<script lang="ts">
	import { onMount } from 'svelte';

	interface AuditEvent {
		id: string;
		user_id: string | null;
		org_id: string | null;
		event_type: string;
		ip_address: string | null;
		user_agent: string | null;
		metadata: Record<string, unknown> | null;
		created_at: number;
		user_email?: string;
		user_name?: string;
		org_name?: string;
	}

	const EVENT_TYPES = [
		'login_success',
		'login_failed',
		'logout',
		'register',
		'email_verified',
		'password_reset_request',
		'password_reset_complete',
		'password_changed',
		'invite_sent',
		'invite_accepted',
		'user_created',
		'user_updated',
		'user_disabled',
		'user_enabled',
		'org_created',
		'org_updated',
		'org_deleted',
		'role_changed',
		'api_key_created',
		'api_key_revoked'
	] as const;

	const PAGE_SIZE = 50;

	let events = $state<AuditEvent[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let error = $state('');

	// Filter state
	let filterEventType = $state('');
	let filterEmail = $state('');
	let filterDateFrom = $state('');
	let filterDateTo = $state('');
	let currentPage = $state(0);

	onMount(async () => {
		await loadEvents();
	});

	function buildQueryString(page: number) {
		const params = new URLSearchParams();
		if (filterEventType) params.set('event_type', filterEventType);
		if (filterDateFrom) params.set('from', String(Math.floor(new Date(filterDateFrom).getTime() / 1000)));
		if (filterDateTo) {
			// end of day for "to" date
			const d = new Date(filterDateTo);
			d.setHours(23, 59, 59, 999);
			params.set('to', String(Math.floor(d.getTime() / 1000)));
		}
		params.set('limit', String(PAGE_SIZE));
		params.set('offset', String(page * PAGE_SIZE));
		return params.toString();
	}

	async function loadEvents(page = currentPage) {
		loading = true;
		error = '';
		try {
			let url = `/api/admin/audit?${buildQueryString(page)}`;

			// If filtering by email, first resolve to user_id
			if (filterEmail.trim()) {
				const userRes = await fetch(`/api/admin/users?search=${encodeURIComponent(filterEmail.trim())}`);
				if (userRes.ok) {
					const userData = (await userRes.json()) as { users: { id: string; email: string }[] };
					const match = userData.users.find((u) =>
						u.email.toLowerCase().includes(filterEmail.trim().toLowerCase())
					);
					if (match) {
						url = `/api/admin/audit?user_id=${match.id}&${buildQueryString(page)}`;
					} else {
						// No user found — show empty results
						events = [];
						total = 0;
						loading = false;
						return;
					}
				}
			}

			const res = await fetch(url);
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load audit log';
				loading = false;
				return;
			}
			const data = (await res.json()) as { events: AuditEvent[]; total: number };
			events = data.events;
			total = data.total;
			currentPage = page;
		} catch {
			error = 'Failed to load audit log';
		} finally {
			loading = false;
		}
	}

	async function applyFilters() {
		await loadEvents(0);
	}

	function formatTimestamp(ts: number): string {
		return new Date(ts * 1000).toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function formatMetadata(meta: Record<string, unknown> | null): string {
		if (!meta) return '';
		try {
			return JSON.stringify(meta, null, 0);
		} catch {
			return '';
		}
	}

	function eventTypeClass(type: string): string {
		if (type === 'login' || type === 'login_success' || type.includes('created') || type.includes('accepted')) {
			return 'badge-green';
		}
		if (type.includes('failed') || type.includes('disabled') || type.includes('deleted') || type.includes('revoked')) {
			return 'badge-red';
		}
		if (type.includes('reset') || type.includes('password') || type.includes('changed') || type.includes('updated')) {
			return 'badge-yellow';
		}
		return 'badge-default';
	}

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
</script>

<div class="audit-page">
	<header class="page-header">
		<h1>Audit Log</h1>
		<div class="header-meta">
			{#if !loading}
				<span class="total-count">{total.toLocaleString()} events</span>
			{/if}
		</div>
	</header>

	<!-- Filter bar -->
	<div class="filter-bar">
		<div class="filter-group">
			<label for="filter-event-type">Event Type</label>
			<select
				id="filter-event-type"
				bind:value={filterEventType}
				onchange={applyFilters}
			>
				<option value="">All Types</option>
				{#each EVENT_TYPES as et}
					<option value={et}>{et}</option>
				{/each}
			</select>
		</div>

		<div class="filter-group">
			<label for="filter-email">User Email</label>
			<input
				id="filter-email"
				type="search"
				bind:value={filterEmail}
				placeholder="Search by email..."
				onkeydown={(e) => { if (e.key === 'Enter') applyFilters(); }}
			/>
		</div>

		<div class="filter-group">
			<label for="filter-from">From Date</label>
			<input
				id="filter-from"
				type="date"
				bind:value={filterDateFrom}
				onchange={applyFilters}
			/>
		</div>

		<div class="filter-group">
			<label for="filter-to">To Date</label>
			<input
				id="filter-to"
				type="date"
				bind:value={filterDateTo}
				onchange={applyFilters}
			/>
		</div>

		<button class="apply-btn" onclick={applyFilters} disabled={loading}>
			{loading ? 'Loading...' : 'Apply'}
		</button>

		<button
			class="clear-btn"
			onclick={() => {
				filterEventType = '';
				filterEmail = '';
				filterDateFrom = '';
				filterDateTo = '';
				applyFilters();
			}}
		>
			Clear
		</button>
	</div>

	{#if error}
		<div class="error-msg">{error}</div>
	{:else if loading}
		<div class="loading-msg">Loading audit events...</div>
	{:else if events.length === 0}
		<div class="empty-msg">No audit events found matching your filters.</div>
	{:else}
		<div class="table-wrapper">
			<table class="audit-table">
				<thead>
					<tr>
						<th>Timestamp</th>
						<th>User</th>
						<th>Organization</th>
						<th>Event Type</th>
						<th>IP Address</th>
						<th>Details</th>
					</tr>
				</thead>
				<tbody>
					{#each events as ev}
						<tr>
							<td data-label="Timestamp" class="col-timestamp">
								{formatTimestamp(ev.created_at)}
							</td>
							<td data-label="User" class="col-user">
								{#if ev.user_id}
									<a href="/admin/users/{ev.user_id}" class="table-link">
										{ev.user_email || ev.user_id}
									</a>
								{:else}
									<span class="text-muted">—</span>
								{/if}
							</td>
							<td data-label="Organization" class="col-org">
								{#if ev.org_id}
									<a href="/admin/orgs/{ev.org_id}" class="table-link">
										{ev.org_name || ev.org_id}
									</a>
								{:else}
									<span class="text-muted">—</span>
								{/if}
							</td>
							<td data-label="Event Type" class="col-event">
								<span class="badge {eventTypeClass(ev.event_type)}">
									{ev.event_type}
								</span>
							</td>
							<td data-label="IP" class="col-ip">
								{ev.ip_address || '—'}
							</td>
							<td data-label="Details" class="col-details">
								{#if ev.metadata}
									<code class="meta-snippet">{formatMetadata(ev.metadata)}</code>
								{:else}
									<span class="text-muted">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="pagination">
				<button
					class="page-btn"
					disabled={currentPage === 0}
					onclick={() => loadEvents(0)}
					aria-label="First page"
				>
					«
				</button>
				<button
					class="page-btn"
					disabled={currentPage === 0}
					onclick={() => loadEvents(currentPage - 1)}
					aria-label="Previous page"
				>
					‹
				</button>

				<span class="page-info">
					Page {currentPage + 1} of {totalPages}
				</span>

				<button
					class="page-btn"
					disabled={currentPage >= totalPages - 1}
					onclick={() => loadEvents(currentPage + 1)}
					aria-label="Next page"
				>
					›
				</button>
				<button
					class="page-btn"
					disabled={currentPage >= totalPages - 1}
					onclick={() => loadEvents(totalPages - 1)}
					aria-label="Last page"
				>
					»
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.audit-page {
		max-width: 1600px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid var(--border);
	}

	.page-header h1 {
		font-size: 1.75rem;
		margin: 0;
		color: var(--text);
	}

	.total-count {
		font-size: 0.875rem;
		color: var(--text-muted);
		background: var(--surface);
		padding: 0.25rem 0.75rem;
		border-radius: 9999px;
		border: 1px solid var(--border);
	}

	/* Filter bar */
	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: flex-end;
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 160px;
	}

	.filter-group label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.filter-group select,
	.filter-group input[type='search'],
	.filter-group input[type='date'] {
		height: 48px;
		padding: 0 0.75rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		color: var(--text);
		font-size: 0.875rem;
		min-width: 0;
	}

	.filter-group input[type='date'] {
		color-scheme: dark;
	}

	.apply-btn,
	.clear-btn {
		height: 48px;
		padding: 0 1.25rem;
		border-radius: var(--radius, 0.5rem);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid var(--border);
		transition: background-color 0.15s;
		align-self: flex-end;
	}

	.apply-btn {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	.apply-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.apply-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.clear-btn {
		background: var(--surface-alt, var(--surface));
		color: var(--text-muted);
	}

	.clear-btn:hover {
		background: var(--surface-hover, var(--surface));
		color: var(--text);
	}

	/* Table */
	.table-wrapper {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
	}

	.audit-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.audit-table thead {
		background: var(--surface);
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.audit-table th {
		padding: 0.75rem 1rem;
		text-align: left;
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	.audit-table td {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}

	.audit-table tbody tr:hover {
		background: var(--surface-alt, rgba(255, 255, 255, 0.02));
	}

	.audit-table tbody tr:last-child td {
		border-bottom: none;
	}

	.col-timestamp {
		white-space: nowrap;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.col-user,
	.col-org {
		white-space: nowrap;
	}

	.col-event {
		white-space: nowrap;
	}

	.col-ip {
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.col-details {
		max-width: 280px;
	}

	.table-link {
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
	}

	.table-link:hover {
		text-decoration: underline;
	}

	.text-muted {
		color: var(--text-muted);
	}

	/* Badges */
	.badge {
		display: inline-block;
		padding: 0.2rem 0.6rem;
		border-radius: 9999px;
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.badge-green {
		background: rgba(34, 197, 94, 0.15);
		color: #4ade80;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.badge-yellow {
		background: rgba(234, 179, 8, 0.15);
		color: #facc15;
		border: 1px solid rgba(234, 179, 8, 0.3);
	}

	.badge-red {
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}

	.badge-default {
		background: var(--surface);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	/* Meta snippet */
	.meta-snippet {
		font-family: monospace;
		font-size: 0.72rem;
		color: var(--text-muted);
		word-break: break-all;
		white-space: pre-wrap;
		max-width: 260px;
		display: block;
		overflow: hidden;
		max-height: 3.5rem;
		-webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
		mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
	}

	/* Pagination */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1.5rem;
		flex-wrap: wrap;
	}

	.page-btn {
		min-width: 48px;
		min-height: 48px;
		padding: 0 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		color: var(--text);
		font-size: 1rem;
		cursor: pointer;
		transition: background-color 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.page-btn:hover:not(:disabled) {
		background: var(--surface-hover, var(--surface-alt));
	}

	.page-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.page-info {
		font-size: 0.875rem;
		color: var(--text-muted);
		padding: 0 0.5rem;
		min-height: 48px;
		display: flex;
		align-items: center;
	}

	/* Status messages */
	.error-msg,
	.loading-msg,
	.empty-msg {
		padding: 2rem;
		text-align: center;
		border-radius: var(--radius, 0.5rem);
		border: 1px solid var(--border);
	}

	.error-msg {
		color: #f87171;
		background: rgba(239, 68, 68, 0.08);
		border-color: rgba(239, 68, 68, 0.3);
	}

	.loading-msg,
	.empty-msg {
		color: var(--text-muted);
		background: var(--surface);
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.filter-bar {
			flex-direction: column;
		}

		.filter-group {
			width: 100%;
		}

		.filter-group select,
		.filter-group input[type='search'],
		.filter-group input[type='date'] {
			width: 100%;
		}

		.apply-btn,
		.clear-btn {
			width: 100%;
		}

		.audit-table thead {
			display: none;
		}

		.audit-table tbody tr {
			display: block;
			border: 1px solid var(--border);
			border-radius: var(--radius, 0.5rem);
			margin-bottom: 0.75rem;
			padding: 0.75rem;
		}

		.audit-table td {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			gap: 0.5rem;
			padding: 0.4rem 0;
			border-bottom: none;
			font-size: 0.8rem;
		}

		.audit-table td::before {
			content: attr(data-label);
			font-weight: 600;
			color: var(--text-muted);
			font-size: 0.72rem;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			min-width: 90px;
			flex-shrink: 0;
		}

		.col-details {
			max-width: none;
		}

		.meta-snippet {
			max-width: none;
		}
	}
</style>
