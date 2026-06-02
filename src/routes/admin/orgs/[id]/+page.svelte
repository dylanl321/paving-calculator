<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	interface Org {
		id: string;
		name: string;
		slug: string;
		created_at: number;
	}

	interface Member {
		user_id: string;
		user_name: string;
		user_email: string;
		role: 'owner' | 'admin' | 'member';
		invited_at: number;
	}

	let org = $state<Org | null>(null);
	let members = $state<Member[]>([]);
	let loading = $state(true);
	let error = $state('');
	let editingOrg = $state(false);
	let editOrgName = $state('');
	let editOrgSlug = $state('');
	let statusMessage = $state('');
	let editingMember = $state<{ userId: string; role: string } | null>(null);

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

			const data = await res.json();
			org = data.org;
			members = data.members;
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
				const data = await res.json();
				statusMessage = data.error || 'Failed to update organization';
				return;
			}

			await loadOrg();
			editingOrg = false;
			statusMessage = '';
		} catch (e) {
			statusMessage = 'Failed to update organization';
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
				const data = await res.json();
				statusMessage = data.error || 'Failed to update member role';
				return;
			}

			await loadOrg();
			editingMember = null;
			statusMessage = '';
		} catch (e) {
			statusMessage = 'Failed to update member role';
		}
	}

	async function removeMember(userId: string) {
		if (!org || !confirm('Remove this member from the organization?')) return;

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
				const data = await res.json();
				statusMessage = data.error || 'Failed to remove member';
				return;
			}

			await loadOrg();
			statusMessage = '';
		} catch (e) {
			statusMessage = 'Failed to remove member';
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
				</dl>
			{/if}
		</section>

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
					<option value="member">Member</option>
					<option value="admin">Admin</option>
					<option value="owner">Owner</option>
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
