<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { confirmStore } from '$lib/stores/confirm.svelte';

	interface Org {
		id: string;
		name: string;
		slug: string;
		created_at: number;
		archived_at?: number | null;
	}

	type OrgRole =
		| 'owner'
		| 'admin'
		| 'member'
		| 'foreman'
		| 'operator'
		| 'inspector'
		| 'office'
		| 'laborer'
		| 'screed_man';

	const ROLES: OrgRole[] = [
		'owner',
		'admin',
		'member',
		'foreman',
		'operator',
		'inspector',
		'office',
		'laborer',
		'screed_man'
	];

	interface Member {
		user_id: string;
		user_name: string;
		user_email: string;
		role: OrgRole;
		invited_at: number;
	}

	interface Invitation {
		id: string;
		email: string;
		role: OrgRole;
		invited_by_name: string;
		created_at: number;
		expires_at: number;
	}

	interface JobSite {
		id: string;
		name: string;
		status: 'active' | 'completed' | 'archived';
		created_at: number;
	}

	interface AuditEvent {
		id: string;
		user_id: string | null;
		org_id: string;
		event_type: string;
		ip_address: string | null;
		user_agent: string | null;
		metadata: unknown;
		created_at: number;
	}

	type Tab = 'overview' | 'members' | 'job-sites' | 'audit';

	let activeTab = $state<Tab>('overview');
	let org = $state<Org | null>(null);
	let members = $state<Member[]>([]);
	let invitations = $state<Invitation[]>([]);
	let jobSiteCount = $state(0);
	let jobSites = $state<JobSite[]>([]);
	let auditEvents = $state<AuditEvent[]>([]);
	let auditTotal = $state(0);
	let auditOffset = $state(0);
	let auditLimit = $state(50);
	let loading = $state(true);
	let error = $state('');
	let editingOrg = $state(false);
	let editOrgName = $state('');
	let editOrgSlug = $state('');
	let statusMessage = $state('');
	let editingMember = $state<{ userId: string; role: string } | null>(null);
	let archiving = $state(false);
	let loadingAudit = $state(false);

	$effect(() => {
		if ($page.params.id) {
			loadOrg();
		}
	});

	async function loadOrg() {
		loading = true;
		try {
			const res = await fetch(`/api/admin/orgs/${$page.params.id}`);
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load organization';
				loading = false;
				return;
			}

			const data = (await res.json()) as {
				org: Org;
				members: Member[];
				invitations: Invitation[];
				jobSiteCount: number;
				jobSites: JobSite[];
			};
			org = data.org;
			members = data.members;
			invitations = data.invitations ?? [];
			jobSiteCount = data.jobSiteCount ?? 0;
			jobSites = data.jobSites ?? [];
		} catch (e) {
			error = 'Failed to load organization';
		} finally {
			loading = false;
		}
	}

	async function loadAudit() {
		if (!org) return;
		loadingAudit = true;
		try {
			const res = await fetch(
				`/api/admin/orgs/${org.id}/audit?limit=${auditLimit}&offset=${auditOffset}`
			);
			if (!res.ok) {
				toastStore.error('Failed to load audit log');
				return;
			}
			const data = (await res.json()) as { events: AuditEvent[]; total: number };
			auditEvents = data.events;
			auditTotal = data.total;
		} catch (e) {
			toastStore.error('Failed to load audit log');
		} finally {
			loadingAudit = false;
		}
	}

	function switchTab(tab: Tab) {
		activeTab = tab;
		if (tab === 'audit' && auditEvents.length === 0) {
			loadAudit();
		}
	}

	function startEditOrg() {
		if (!org) return;
		editOrgName = org.name;
		editOrgSlug = org.slug;
		editingOrg = true;
		statusMessage = '';
	}

	async function saveOrgEdit() {
		if (!org) return;

		try {
			const res = await fetch(`/api/admin/orgs/${org.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editOrgName.trim(),
					slug: editOrgSlug.trim()
				})
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				statusMessage = data.error || 'Failed to update organization';
				toastStore.error(statusMessage);
				return;
			}

			await loadOrg();
			editingOrg = false;
			statusMessage = '';
			toastStore.success('Organization updated successfully');
		} catch (e) {
			statusMessage = 'Failed to update organization';
			toastStore.error(statusMessage);
		}
	}

	function startEditMember(member: Member) {
		editingMember = { userId: member.user_id, role: member.role };
	}

	async function updateMemberRole() {
		if (!editingMember || !org) return;

		try {
			const res = await fetch(`/api/admin/orgs/${org.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'updateRole',
					userId: editingMember.userId,
					role: editingMember.role
				})
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				statusMessage = data.error || 'Failed to update member role';
				toastStore.error(statusMessage);
				return;
			}

			await loadOrg();
			editingMember = null;
			statusMessage = '';
			toastStore.success('Member role updated successfully');
		} catch (e) {
			statusMessage = 'Failed to update member role';
			toastStore.error(statusMessage);
		}
	}

	async function removeMember(userId: string) {
		if (!org) return;

		const confirmed = await confirmStore.ask({
			title: 'Remove Member',
			message: 'Remove this member from the organization?',
			confirmLabel: 'Remove',
			destructive: true
		});
		if (!confirmed) return;

		try {
			const res = await fetch(`/api/admin/orgs/${org.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'removeMember',
					userId
				})
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				statusMessage = data.error || 'Failed to remove member';
				toastStore.error(statusMessage);
				return;
			}

			await loadOrg();
			statusMessage = '';
			toastStore.success('Member removed successfully');
		} catch (e) {
			statusMessage = 'Failed to remove member';
			toastStore.error(statusMessage);
		}
	}

	async function toggleArchive() {
		if (!org || archiving) return;
		const wantArchived = !org.archived_at;
		const confirmed = await confirmStore.ask({
			title: wantArchived ? 'Archive Organization' : 'Unarchive Organization',
			message: wantArchived
				? 'Archive this organization? Members keep access but it is hidden from active lists.'
				: 'Unarchive this organization?',
			confirmLabel: wantArchived ? 'Archive' : 'Unarchive',
			destructive: wantArchived
		});
		if (!confirmed) return;
		archiving = true;
		try {
			const res = await fetch(`/api/admin/orgs/${org.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: wantArchived ? 'archive' : 'unarchive' })
			});
			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				toastStore.error(data.error || 'Failed to update archive state');
				return;
			}
			await loadOrg();
			toastStore.success(wantArchived ? 'Organization archived' : 'Organization unarchived');
		} catch {
			toastStore.error('Failed to update archive state');
		} finally {
			archiving = false;
		}
	}

	function loadMoreAudit() {
		auditOffset += auditLimit;
		loadAudit();
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString();
	}

	function formatDateTime(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleString();
	}

	function getOwner(): Member | null {
		return members.find((m) => m.role === 'owner') ?? null;
	}
</script>

<div class="admin-org-detail">
	<header>
		<h1>Organization Details</h1>
		<a href="/admin/orgs">Back to Organizations</a>
	</header>

	{#if statusMessage}
		<div class="status-message error">{statusMessage}</div>
	{/if}

	{#if loading}
		<p class="loading">Loading...</p>
	{:else if error}
		<div class="error">{error}</div>
	{:else if org}
		<nav class="tabs">
			<button class:active={activeTab === 'overview'} onclick={() => switchTab('overview')}>
				Overview
			</button>
			<button class:active={activeTab === 'members'} onclick={() => switchTab('members')}>
				Members
			</button>
			<button class:active={activeTab === 'job-sites'} onclick={() => switchTab('job-sites')}>
				Job Sites
			</button>
			<button class:active={activeTab === 'audit'} onclick={() => switchTab('audit')}>
				Audit
			</button>
		</nav>

		{#if activeTab === 'overview'}
			<section class="org-info">
				<div class="section-header">
					<h2>Organization Info</h2>
					{#if !editingOrg}
						<button onclick={startEditOrg}>Edit</button>
					{/if}
				</div>

				{#if editingOrg}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							saveOrgEdit();
						}}
						class="edit-form"
					>
						<label>
							Name
							<input type="text" bind:value={editOrgName} required />
						</label>
						<label>
							Slug
							<input type="text" bind:value={editOrgSlug} required />
						</label>
						<div class="form-actions">
							<button
								type="button"
								onclick={() => {
									editingOrg = false;
									statusMessage = '';
								}}>Cancel</button
							>
							<button type="submit">Save</button>
						</div>
					</form>
				{:else}
					<dl class="info-list">
						<dt>Name</dt>
						<dd>{org.name}</dd>
						<dt>Slug</dt>
						<dd>{org.slug}</dd>
						<dt>Created</dt>
						<dd>{formatDate(org.created_at)}</dd>
						<dt>Status</dt>
						<dd>
							<span class="status-badge" class:active={!org.archived_at}>
								{org.archived_at ? 'Archived' : 'Active'}
							</span>
						</dd>
						<dt>Owner</dt>
						<dd>
							{#if getOwner()}
								{getOwner()?.user_name} ({getOwner()?.user_email})
							{:else}
								<span class="text-muted">None</span>
							{/if}
						</dd>
						<dt>Members</dt>
						<dd>{members.length}</dd>
						<dt>Job Sites</dt>
						<dd>{jobSiteCount}</dd>
					</dl>
					<div class="org-actions">
						<button
							class="action-btn"
							class:danger={!org.archived_at}
							onclick={toggleArchive}
							disabled={archiving}
						>
							{org.archived_at ? 'Unarchive Organization' : 'Archive Organization'}
						</button>
					</div>
				{/if}
			</section>
		{:else if activeTab === 'members'}
			<section class="members">
				<h2>Members</h2>
				{#if members.length === 0}
					<p class="empty">No members in this organization</p>
				{:else}
					<div class="table-wrapper">
						<table class="data-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Email</th>
									<th>Role</th>
									<th>Joined</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each members as member}
									<tr>
										<td data-label="Name">
											<a href="/admin/users/{member.user_id}">{member.user_name}</a>
										</td>
										<td data-label="Email">{member.user_email}</td>
										<td data-label="Role">
											<span
												class="role-badge"
												class:owner={member.role === 'owner'}
												class:admin={member.role === 'admin'}
											>
												{member.role}
											</span>
										</td>
										<td data-label="Joined">{formatDate(member.invited_at)}</td>
										<td data-label="Actions" class="actions-cell">
											<button class="action-btn" onclick={() => startEditMember(member)}
												>Change Role</button
											>
											<button class="action-btn danger" onclick={() => removeMember(member.user_id)}
												>Remove</button
											>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				{#if invitations.length > 0}
					<div class="invitations-section">
						<h3>Pending Invitations</h3>
						<div class="table-wrapper">
							<table class="data-table">
								<thead>
									<tr>
										<th>Email</th>
										<th>Role</th>
										<th>Invited By</th>
										<th>Sent</th>
										<th>Expires</th>
									</tr>
								</thead>
								<tbody>
									{#each invitations as inv}
										<tr>
											<td data-label="Email">{inv.email}</td>
											<td data-label="Role">
												<span class="role-badge">{inv.role}</span>
											</td>
											<td data-label="Invited By">{inv.invited_by_name}</td>
											<td data-label="Sent">{formatDate(inv.created_at)}</td>
											<td data-label="Expires">{formatDate(inv.expires_at)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</section>
		{:else if activeTab === 'job-sites'}
			<section class="job-sites">
				<h2>Job Sites</h2>
				{#if jobSites.length === 0}
					<p class="empty">No job sites in this organization</p>
				{:else}
					<div class="table-wrapper">
						<table class="data-table">
							<thead>
								<tr>
									<th>Name</th>
									<th>Status</th>
									<th>Created</th>
								</tr>
							</thead>
							<tbody>
								{#each jobSites as site}
									<tr>
										<td data-label="Name">{site.name}</td>
										<td data-label="Status">
											<span
												class="status-badge"
												class:active={site.status === 'active'}
												class:completed={site.status === 'completed'}
												class:archived={site.status === 'archived'}
											>
												{site.status}
											</span>
										</td>
										<td data-label="Created">{formatDate(site.created_at)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{:else if activeTab === 'audit'}
			<section class="audit">
				<h2>Audit Log</h2>
				{#if loadingAudit}
					<p class="loading">Loading audit log...</p>
				{:else if auditEvents.length === 0}
					<p class="empty">No audit events found</p>
				{:else}
					<div class="table-wrapper">
						<table class="data-table">
							<thead>
								<tr>
									<th>Date</th>
									<th>Event Type</th>
									<th>User ID</th>
									<th>IP Address</th>
									<th>Metadata</th>
								</tr>
							</thead>
							<tbody>
								{#each auditEvents as event}
									<tr>
										<td data-label="Date">{formatDateTime(event.created_at)}</td>
										<td data-label="Event Type">{event.event_type}</td>
										<td data-label="User ID">{event.user_id ?? '-'}</td>
										<td data-label="IP Address">{event.ip_address ?? '-'}</td>
										<td data-label="Metadata" class="metadata-cell">
											{event.metadata ? JSON.stringify(event.metadata) : '-'}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if auditOffset + auditLimit < auditTotal}
						<div class="load-more">
							<button class="action-btn" onclick={loadMoreAudit}>
								Load More ({auditTotal - auditOffset - auditLimit} remaining)
							</button>
						</div>
					{/if}
				{/if}
			</section>
		{/if}
	{/if}
</div>

{#if editingMember}
	<div
		class="modal-overlay"
		role="button"
		tabindex="-1"
		aria-label="Close dialog"
		onclick={() => {
			editingMember = null;
			statusMessage = '';
		}}
		onkeydown={(e) => { if (e.key === 'Escape') { editingMember = null; statusMessage = ''; } }}
	></div>
	<div class="modal">
		<h2>Change Member Role</h2>
		<form
			onsubmit={(e) => {
				e.preventDefault();
				updateMemberRole();
			}}
		>
			<label>
				New Role
				<select bind:value={editingMember.role} required>
					{#each ROLES as r}
						<option value={r}>{r}</option>
					{/each}
				</select>
			</label>
			<div class="modal-actions">
				<button
					type="button"
					onclick={() => {
						editingMember = null;
						statusMessage = '';
					}}>Cancel</button
				>
				<button type="submit">Update</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.admin-org-detail {
		padding: 1rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--border);
		padding-bottom: 1rem;
	}

	h1 {
		font-size: 1.75rem;
		margin: 0;
		color: var(--text);
	}

	h2 {
		font-size: 1.25rem;
		margin: 0 0 1.5rem 0;
		color: var(--text);
	}

	h3 {
		font-size: 1.125rem;
		margin: 0 0 1rem 0;
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

	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid var(--border);
		padding-bottom: 0;
		overflow-x: auto;
	}

	.tabs button {
		padding: 0.75rem 1.5rem;
		min-height: var(--touch);
		background: transparent;
		color: var(--text-muted);
		border: none;
		border-bottom: 3px solid transparent;
		cursor: pointer;
		font-size: 1rem;
		white-space: nowrap;
		transition: all 0.2s;
	}

	.tabs button:hover {
		color: var(--text);
		background: var(--surface-hover);
	}

	.tabs button.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.status-message {
		padding: 0.75rem;
		margin-bottom: 1rem;
		border-radius: var(--radius);
		font-size: 0.875rem;
	}

	.status-message.error {
		background: rgba(var(--bad-rgb), 0.1);
		color: var(--bad);
		border: 1px solid var(--bad);
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

	section {
		background: var(--surface);
		padding: 1.5rem;
		border-radius: var(--radius);
		margin-bottom: 1.5rem;
		border: 1px solid var(--border);
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.section-header h2 {
		margin: 0;
	}

	.section-header button {
		padding: 0.5rem 1rem;
		min-height: var(--touch);
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 1rem;
	}

	.section-header button:hover {
		opacity: 0.9;
	}

	.info-list {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 1rem;
	}

	.info-list dt {
		font-weight: 600;
		color: var(--text-muted);
	}

	.info-list dd {
		margin: 0;
		color: var(--text);
	}

	.text-muted {
		color: var(--text-muted);
	}

	.org-actions {
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px solid var(--border);
	}

	.org-actions .action-btn {
		min-height: var(--touch);
		padding: 0.5rem 1rem;
	}

	.edit-form label {
		display: block;
		margin-bottom: 1rem;
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.edit-form input {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.form-actions button {
		padding: 0.5rem 1.5rem;
		min-height: var(--touch);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 1rem;
		cursor: pointer;
	}

	.form-actions button[type='button'] {
		background: var(--surface-alt);
		color: var(--text);
	}

	.form-actions button[type='submit'] {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.invitations-section {
		margin-top: 2rem;
		padding-top: 2rem;
		border-top: 1px solid var(--border);
	}

	.table-wrapper {
		overflow-x: auto;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
	}

	.data-table th {
		text-align: left;
		padding: 1rem;
		font-weight: 600;
		color: var(--text);
		border-bottom: 2px solid var(--border);
	}

	.data-table td {
		padding: 1rem;
		border-top: 1px solid var(--border);
		color: var(--text);
	}

	.data-table tr:hover {
		background: var(--surface-hover);
	}

	.data-table a {
		color: var(--accent);
		text-decoration: none;
	}

	.data-table a:hover {
		text-decoration: underline;
	}

	.actions-cell {
		white-space: nowrap;
	}

	.metadata-cell {
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: monospace;
		font-size: 0.875rem;
	}

	.role-badge,
	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.875rem;
		background: var(--surface-alt);
		color: var(--text-muted);
	}

	.role-badge.owner {
		background: var(--accent);
		color: var(--accent-text);
	}

	.role-badge.admin {
		background: var(--good);
		color: var(--bg);
	}

	.status-badge.active {
		background: var(--good);
		color: var(--bg);
	}

	.status-badge.completed {
		background: var(--accent);
		color: var(--accent-text);
	}

	.status-badge.archived {
		background: var(--surface-alt);
		color: var(--text-muted);
	}

	.action-btn {
		padding: 0.25rem 0.75rem;
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		font-size: 0.875rem;
		min-height: var(--touch);
		margin-right: 0.5rem;
	}

	.action-btn:hover {
		background: var(--surface-hover);
	}

	.action-btn.danger {
		background: rgba(var(--bad-rgb), 0.1);
		color: var(--bad);
		border-color: var(--bad);
	}

	.action-btn.danger:hover {
		background: rgba(var(--bad-rgb), 0.2);
	}

	.load-more {
		margin-top: 1rem;
		text-align: center;
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
		padding: 2rem;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		z-index: 101;
		min-width: 300px;
		max-width: 500px;
		width: 90%;
	}

	.modal h2 {
		margin: 0 0 1.5rem 0;
		color: var(--text);
	}

	.modal label {
		display: block;
		margin-bottom: 1rem;
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.modal select {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.modal-actions button {
		padding: 0.5rem 1.5rem;
		min-height: var(--touch);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 1rem;
		cursor: pointer;
	}

	.modal-actions button[type='button'] {
		background: var(--surface-alt);
		color: var(--text);
	}

	.modal-actions button[type='submit'] {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	@media (max-width: 768px) {
		.info-list {
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}

		.data-table thead {
			display: none;
		}

		.data-table td {
			display: block;
			text-align: right;
			padding: 0.5rem 1rem;
		}

		.data-table td:first-child {
			padding-top: 1rem;
		}

		.data-table td:last-child {
			padding-bottom: 1rem;
		}

		.data-table td::before {
			content: attr(data-label);
			float: left;
			font-weight: 600;
		}

		.data-table tr {
			display: block;
			margin-bottom: 1rem;
			border: 1px solid var(--border);
			border-radius: var(--radius);
		}

		.tabs {
			gap: 0;
		}

		.tabs button {
			padding: 0.75rem 1rem;
			font-size: 0.875rem;
		}
	}
</style>
