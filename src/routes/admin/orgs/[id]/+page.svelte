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

	let org = $state<Org | null>(null);
	let members = $state<Member[]>([]);
	let invitations = $state<Invitation[]>([]);
	let jobSiteCount = $state(0);
	let loading = $state(true);
	let error = $state('');
	let editingOrg = $state(false);
	let editOrgName = $state('');
	let editOrgSlug = $state('');
	let statusMessage = $state('');
	let editingMember = $state<{ userId: string; role: string } | null>(null);
	let archiving = $state(false);

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
			};
			org = data.org;
			members = data.members;
			invitations = data.invitations ?? [];
			jobSiteCount = data.jobSiteCount ?? 0;
		} catch (e) {
			error = 'Failed to load organization';
		} finally {
			loading = false;
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

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString();
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
		<section class="org-info">
			<div class="section-header">
				<h2>Organization Info</h2>
				{#if !editingOrg}
					<button onclick={startEditOrg}>Edit</button>
				{/if}
			</div>

			{#if editingOrg}
				<form onsubmit={(e) => { e.preventDefault(); saveOrgEdit(); }} class="edit-form">
					<label>
						Name
						<input type="text" bind:value={editOrgName} required />
					</label>
					<label>
						Slug
						<input type="text" bind:value={editOrgSlug} required />
					</label>
					<div class="form-actions">
						<button type="button" onclick={() => { editingOrg = false; statusMessage = ''; }}>Cancel</button>
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
					<dt>Members</dt>
					<dd>{members.length}</dd>
					<dt>Job Sites</dt>
					<dd>{jobSiteCount}</dd>
					<dt>Pending Invites</dt>
					<dd>{invitations.length}</dd>
					<dt>Status</dt>
					<dd>
						<span class="role-badge" class:owner={!org.archived_at}>
							{org.archived_at ? 'Archived' : 'Active'}
						</span>
					</dd>
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

		{#if invitations.length > 0}
			<section class="invitations">
				<h2>Pending Invitations</h2>
				<div class="members-table-wrapper">
					<table class="members-table">
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
			</section>
		{/if}

		<section class="members">
			<h2>Members</h2>
			{#if members.length === 0}
				<p class="empty">No members in this organization</p>
			{:else}
				<div class="members-table-wrapper">
					<table class="members-table">
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
									<td data-label="Name">{member.user_name}</td>
									<td data-label="Email">{member.user_email}</td>
									<td data-label="Role">
										<span class="role-badge" class:owner={member.role === 'owner'} class:admin={member.role === 'admin'}>
											{member.role}
										</span>
									</td>
									<td data-label="Joined">{formatDate(member.invited_at)}</td>
									<td data-label="Actions">
										<button class="action-btn" onclick={() => startEditMember(member)}>Change Role</button>
										<button class="action-btn danger" onclick={() => removeMember(member.user_id)}>Remove</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>

{#if editingMember}
	<div class="modal-overlay" onclick={() => { editingMember = null; statusMessage = ''; }}></div>
	<div class="modal">
		<h2>Change Member Role</h2>
		<form onsubmit={(e) => { e.preventDefault(); updateMemberRole(); }}>
			<label>
				New Role
				<select bind:value={editingMember.role} required>
					{#each ROLES as r}
						<option value={r}>{r}</option>
					{/each}
				</select>
			</label>
			<div class="modal-actions">
				<button type="button" onclick={() => { editingMember = null; statusMessage = ''; }}>Cancel</button>
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

	.members-table-wrapper {
		overflow-x: auto;
	}

	.members-table {
		width: 100%;
		border-collapse: collapse;
	}

	.members-table th {
		text-align: left;
		padding: 1rem;
		font-weight: 600;
		color: var(--text);
		border-bottom: 2px solid var(--border);
	}

	.members-table td {
		padding: 1rem;
		border-top: 1px solid var(--border);
		color: var(--text);
	}

	.members-table tr:hover {
		background: var(--surface-hover);
	}

	.role-badge {
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

		.members-table thead {
			display: none;
		}

		.members-table td {
			display: block;
			text-align: right;
			padding: 0.5rem 1rem;
		}

		.members-table td:first-child {
			padding-top: 1rem;
		}

		.members-table td:last-child {
			padding-bottom: 1rem;
		}

		.members-table td::before {
			content: attr(data-label);
			float: left;
			font-weight: 600;
		}

		.members-table tr {
			display: block;
			margin-bottom: 1rem;
			border: 1px solid var(--border);
			border-radius: var(--radius);
		}
	}
</style>
