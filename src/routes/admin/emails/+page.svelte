<script lang="ts">
	import { onMount } from 'svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface EmailRow {
		id: string;
		to_email: string;
		from_email: string;
		subject: string;
		type: string;
		org_id: string | null;
		user_id: string | null;
		status: 'sent' | 'failed' | 'skipped_no_key';
		provider_message_id: string | null;
		error: string | null;
		created_at: number;
	}

	const PAGE_SIZE = 50;

	let emails = $state<EmailRow[]>([]);
	let loading = $state(true);
	let error = $state('');

	let statusFilter = $state('all');
	let typeFilter = $state('all');
	let toFilter = $state('');
	let orgIdFilter = $state('');
	let dateFromFilter = $state('');
	let dateToFilter = $state('');

	let currentPage = $state(0);
	let totalEmails = $state(0);

	const totalPages = $derived(Math.ceil(totalEmails / PAGE_SIZE));

	let previewHtml = $state('');
	let previewSubject = $state('');
	let previewLoading = $state(false);
	let showPreview = $state(false);

	// Email types that map to a previewable template.
	const PREVIEWABLE: Record<string, 'invitation' | 'verification' | 'password-reset'> = {
		invitation: 'invitation',
		verification: 'verification',
		'password-reset': 'password-reset'
	};

	onMount(loadEmails);

	async function loadEmails() {
		loading = true;
		error = '';
		try {
			const params = new URLSearchParams();
			if (statusFilter !== 'all') {
				if (statusFilter === 'failed') params.set('failedOnly', 'true');
				else params.set('status', statusFilter);
			}
			if (typeFilter !== 'all') params.set('type', typeFilter);
			if (toFilter.trim()) params.set('to', toFilter.trim());
			if (orgIdFilter.trim()) params.set('orgId', orgIdFilter.trim());
			if (dateFromFilter) {
				const ts = Math.floor(new Date(dateFromFilter).getTime() / 1000);
				params.set('dateFrom', String(ts));
			}
			if (dateToFilter) {
				const ts = Math.floor(new Date(dateToFilter + 'T23:59:59').getTime() / 1000);
				params.set('dateTo', String(ts));
			}
			params.set('page', String(currentPage));
			params.set('limit', String(PAGE_SIZE));

			const res = await fetch(`/api/admin/emails?${params.toString()}`);
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load email log';
				return;
			}
			const data = (await res.json()) as {
				emails: EmailRow[];
				total: number;
				page: number;
				pageSize: number;
			};
			emails = data.emails;
			totalEmails = data.total;
		} catch {
			error = 'Failed to load email log';
		} finally {
			loading = false;
		}
	}

	function onFilterChange() {
		currentPage = 0;
		loadEmails();
	}

	function goToPage(page: number) {
		if (page >= 0 && page < totalPages) {
			currentPage = page;
			loadEmails();
		}
	}

	async function openPreview(row: EmailRow) {
		const previewType = PREVIEWABLE[row.type];
		if (!previewType) {
			previewLoading = false;
			showPreview = true;
			previewSubject = row.subject;
			previewHtml = `<div style="padding: 2rem; text-align: center; color: #666;">No preview available for type: ${row.type}</div>`;
			return;
		}
		previewLoading = true;
		showPreview = true;
		previewSubject = row.subject;
		previewHtml = '';
		try {
			const res = await fetch(`/api/admin/emails?preview=${previewType}`);
			if (!res.ok) {
				toastStore.error('Failed to load preview');
				showPreview = false;
				return;
			}
			const data = (await res.json()) as { preview: { html: string; subject: string } };
			previewHtml = data.preview.html;
			previewSubject = data.preview.subject;
		} catch {
			toastStore.error('Failed to load preview');
			showPreview = false;
		} finally {
			previewLoading = false;
		}
	}

	function closePreview() {
		showPreview = false;
		previewHtml = '';
	}

	function formatDateTime(ts: number): string {
		return new Date(ts * 1000).toLocaleString();
	}

	function statusLabel(status: EmailRow['status']): string {
		if (status === 'sent') return 'Sent';
		if (status === 'failed') return 'Failed';
		return 'Skipped (no key)';
	}
</script>

<div class="admin-emails">
	<header>
		<h1>Email Log</h1>
		<a href="/admin">Back to Admin</a>
	</header>

	<p class="hint">Every send attempt from PaveRate (verification, password reset, invitations, welcome). Use this to debug delivery.</p>

	<div class="filters">
		<select bind:value={statusFilter} onchange={onFilterChange}>
			<option value="all">All statuses</option>
			<option value="sent">Sent</option>
			<option value="failed">Failed / Skipped</option>
			<option value="skipped_no_key">Skipped (no key)</option>
		</select>
		<select bind:value={typeFilter} onchange={onFilterChange}>
			<option value="all">All templates</option>
			<option value="verification">Verification</option>
			<option value="password-reset">Password reset</option>
			<option value="invitation">Invitation</option>
			<option value="welcome">Welcome</option>
		</select>
		<input
			type="search"
			placeholder="Filter by recipient…"
			bind:value={toFilter}
			oninput={onFilterChange}
		/>
		<input
			type="text"
			placeholder="Org ID"
			bind:value={orgIdFilter}
			oninput={onFilterChange}
		/>
		<input type="date" bind:value={dateFromFilter} onchange={onFilterChange} />
		<input type="date" bind:value={dateToFilter} onchange={onFilterChange} />
	</div>

	{#if loading}
		<p class="loading">Loading…</p>
	{:else if error}
		<div class="error">{error}</div>
	{:else if emails.length === 0}
		<p class="empty">No emails logged yet.</p>
	{:else}
		<div class="table-wrapper">
			<table>
				<thead>
					<tr>
						<th>Sent</th>
						<th>To</th>
						<th>Template</th>
						<th>Subject</th>
						<th>Org</th>
						<th>Status</th>
						<th>Detail</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each emails as row}
						<tr class:row-failed={row.status !== 'sent'}>
							<td data-label="Sent">{formatDateTime(row.created_at)}</td>
							<td data-label="To">{row.to_email}</td>
							<td data-label="Template">{row.type}</td>
							<td data-label="Subject">{row.subject}</td>
							<td data-label="Org">
								{#if row.org_id}
									<span class="muted">{row.org_id}</span>
								{:else}
									—
								{/if}
							</td>
							<td data-label="Status">
								<span
									class="status-badge"
									class:sent={row.status === 'sent'}
									class:failed={row.status !== 'sent'}
								>
									{statusLabel(row.status)}
								</span>
							</td>
							<td data-label="Detail" class="detail-cell">
								{#if row.error}
									<span class="error-text" title={row.error}>{row.error}</span>
								{:else if row.provider_message_id}
									<span class="muted">{row.provider_message_id}</span>
								{:else}
									—
								{/if}
							</td>
							<td data-label="">
								<button class="preview-btn" onclick={() => openPreview(row)}>Preview</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if totalPages > 1}
			<div class="pagination">
				<button
					class="page-btn"
					onclick={() => goToPage(currentPage - 1)}
					disabled={currentPage === 0}
				>
					Prev
				</button>
				<span class="page-info">Page {currentPage + 1} of {totalPages}</span>
				<button
					class="page-btn"
					onclick={() => goToPage(currentPage + 1)}
					disabled={currentPage >= totalPages - 1}
				>
					Next
				</button>
			</div>
		{/if}
	{/if}
</div>

{#if showPreview}
	<div class="modal-overlay" onclick={closePreview}></div>
	<div class="modal">
		<div class="modal-head">
			<h2>{previewSubject}</h2>
			<button class="close-btn" onclick={closePreview} aria-label="Close">✕</button>
		</div>
		{#if previewLoading}
			<p class="loading">Loading preview…</p>
		{:else}
			<iframe class="preview-frame" title="Email preview" srcdoc={previewHtml}></iframe>
		{/if}
	</div>
{/if}

<style>
	.admin-emails {
		padding: 1rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 0.5rem;
		border-bottom: 2px solid var(--border);
		padding-bottom: 1rem;
	}

	h1 {
		font-size: 1.75rem;
		margin: 0;
		color: var(--text);
	}

	header a {
		padding: 0.5rem 1rem;
		min-height: var(--touch);
		display: flex;
		align-items: center;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		border-radius: var(--radius);
		border: 1px solid var(--border);
	}

	header a:hover {
		background: var(--surface-hover);
	}

	.hint {
		color: var(--text-muted);
		font-size: 0.9rem;
		margin: 1rem 0 1.5rem;
	}

	.filters {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.5rem;
	}

	.filters select,
	.filters input {
		flex: 1;
		min-width: 180px;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text);
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: 2rem;
		font-size: 1.125rem;
		color: var(--text-muted);
	}

	.error {
		color: var(--bad);
		background: var(--surface);
		border-radius: var(--radius);
		border: 1px solid var(--bad);
	}

	.table-wrapper {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--surface);
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	thead {
		background: var(--surface-alt);
	}

	th {
		text-align: left;
		padding: 0.875rem 1rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}

	td {
		padding: 0.875rem 1rem;
		border-top: 1px solid var(--border);
		color: var(--text);
		vertical-align: top;
	}

	tr:hover {
		background: var(--surface-hover);
	}

	tr.row-failed {
		background: rgba(var(--bad-rgb), 0.06);
	}

	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.status-badge.sent {
		background: rgba(63, 178, 127, 0.15);
		color: var(--good);
	}

	.status-badge.failed {
		background: rgba(var(--bad-rgb), 0.15);
		color: var(--bad);
	}

	.detail-cell {
		max-width: 320px;
	}

	.error-text {
		color: var(--bad);
		font-size: 0.85rem;
		display: inline-block;
		max-width: 320px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.muted {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.preview-btn {
		padding: 0.4rem 0.85rem;
		min-height: var(--touch);
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 0.85rem;
	}

	.preview-btn:hover {
		background: var(--surface-hover);
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 100;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--surface);
		border-radius: var(--radius);
		border: 1px solid var(--border);
		z-index: 101;
		width: 92%;
		max-width: 640px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border);
	}

	.modal-head h2 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--text);
	}

	.close-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.25rem;
		cursor: pointer;
		min-height: var(--touch);
		min-width: var(--touch);
	}

	.preview-frame {
		border: none;
		width: 100%;
		height: 70vh;
		background: #fff;
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		margin-top: 1.5rem;
		padding: 1rem;
		min-height: var(--touch);
	}

	.page-btn {
		padding: 0.75rem 1.5rem;
		min-height: var(--touch);
		min-width: 100px;
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 1rem;
		font-weight: 500;
	}

	.page-btn:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.page-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.page-info {
		color: var(--text);
		font-size: 1rem;
		font-weight: 500;
		min-width: 120px;
		text-align: center;
	}

	@media (max-width: 768px) {
		thead {
			display: none;
		}

		td {
			display: block;
			text-align: right;
			padding: 0.5rem 1rem;
		}

		td::before {
			content: attr(data-label);
			float: left;
			font-weight: 600;
		}

		tr {
			display: block;
			margin-bottom: 1rem;
			border: 1px solid var(--border);
			border-radius: var(--radius);
		}

		.error-text,
		.detail-cell {
			max-width: none;
		}
	}
</style>
