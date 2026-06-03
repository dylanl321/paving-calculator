<script lang="ts">
	import { onMount } from 'svelte';

	const ROLES = [
		'owner',
		'admin',
		'member',
		'foreman',
		'operator',
		'inspector',
		'office',
		'laborer',
		'screed_man'
	] as const;

	interface User {
		id: string;
		email: string;
		name: string;
		org_name: string | null;
		org_id: string | null;
		role: string | null;
		is_global_admin: boolean;
		disabled: boolean;
		phone: string | null;
		created_at: number;
	}

	interface OrgOption {
		id: string;
		name: string;
	}

	let users = $state<User[]>([]);
	let filteredUsers = $state<User[]>([]);
	let orgs = $state<OrgOption[]>([]);
	let searchQuery = $state('');
	let filterStatus = $state('all');
	let loading = $state(true);
	let error = $state('');
	let statusMessage = $state('');
	let editingUser = $state<User | null>(null);
	let editForm = $state({
		name: '',
		email: '',
		phone: '',
		is_global_admin: false,
		disabled: false
	});

	let showCreate = $state(false);
	let createSaving = $state(false);
	let createError = $state('');
	let createForm = $state({
		name: '',
		email: '',
		password: '',
		phone: '',
		org_id: '',
		role: 'member' as (typeof ROLES)[number],
		is_global_admin: false
	});

	onMount(async () => {
		await Promise.all([loadUsers(), loadOrgs()]);
	});

	async function loadOrgs() {
		try {
			const res = await fetch('/api/admin/orgs');
			if (!res.ok) return;
			const data = (await res.json()) as { orgs: OrgOption[] };
			orgs = data.orgs;
		} catch {
			// non-fatal; org dropdown will just be empty
		}
	}

	async function loadUsers() {
		try {
			const res = await fetch('/api/admin/users');
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load users';
				loading = false;
				return;
			}

			const data = (await res.json()) as { users: User[] };
			users = data.users;
			applyFilters();
		} catch (e) {
			error = 'Failed to load users';
		} finally {
			loading = false;
		}
	}

	function applyFilters() {
		let filtered = users;

		const query = searchQuery.toLowerCase().trim();
		if (query) {
			filtered = filtered.filter(
				(u) =>
					u.name.toLowerCase().includes(query) ||
					u.email.toLowerCase().includes(query) ||
					(u.org_name && u.org_name.toLowerCase().includes(query))
			);
		}

		if (filterStatus === 'active') {
			filtered = filtered.filter((u) => !u.disabled);
		} else if (filterStatus === 'disabled') {
			filtered = filtered.filter((u) => u.disabled);
		}

		filteredUsers = filtered;
	}

	function openCreate() {
		createForm = {
			name: '',
			email: '',
			password: '',
			phone: '',
			org_id: '',
			role: 'member',
			is_global_admin: false
		};
		createError = '';
		showCreate = true;
	}

	async function createUser() {
		if (createSaving) return;
		createError = '';
		createSaving = true;
		try {
			const res = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: createForm.name.trim(),
					email: createForm.email.trim(),
					password: createForm.password,
					phone: createForm.phone.trim() || null,
					org_id: createForm.org_id || undefined,
					role: createForm.org_id ? createForm.role : undefined,
					is_global_admin: createForm.is_global_admin
				})
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				createError = data.error || 'Failed to create user';
				return;
			}

			await loadUsers();
			showCreate = false;
		} catch (e) {
			createError = 'Failed to create user';
		} finally {
			createSaving = false;
		}
	}

	function startEdit(user: User) {
		editingUser = user;
		editForm = {
			name: user.name,
			email: user.email,
			phone: user.phone || '',
			is_global_admin: user.is_global_admin,
			disabled: user.disabled
		};
		statusMessage = '';
	}

	async function saveEdit() {
		if (!editingUser) return;

		try {
			const res = await fetch(`/api/admin/users/${editingUser.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: editForm.name.trim(),
					email: editForm.email.trim(),
					phone: editForm.phone.trim() || null,
					is_global_admin: editForm.is_global_admin,
					disabled: editForm.disabled
				})
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				statusMessage = data.error || 'Failed to update user';
				return;
			}

			await loadUsers();
			editingUser = null;
			statusMessage = '';
		} catch (e) {
			statusMessage = 'Failed to update user';
		}
	}

	async function toggleDisabled(user: User) {
		const newDisabledState = !user.disabled;
		const action = newDisabledState ? 'disable' : 'enable';

		if (!confirm(`Are you sure you want to ${action} ${user.name}?${newDisabledState ? ' This will log them out immediately.' : ''}`)) {
			return;
		}

		try {
			const res = await fetch(`/api/admin/users/${user.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ disabled: newDisabledState })
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				statusMessage = data.error || `Failed to ${action} user`;
				return;
			}

			await loadUsers();
			statusMessage = '';
		} catch (e) {
			statusMessage = `Failed to ${action} user`;
		}
	}

	async function toggleGlobalAdmin(user: User) {
		const newAdminState = !user.is_global_admin;
		const action = newAdminState ? 'grant global admin to' : 'revoke global admin from';

		if (!confirm(`Are you sure you want to ${action} ${user.name}?`)) {
			return;
		}

		try {
			const res = await fetch(`/api/admin/users/${user.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_global_admin: newAdminState })
			});

			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				statusMessage = data.error || `Failed to update admin status`;
				return;
			}

			await loadUsers();
			statusMessage = '';
		} catch (e) {
			statusMessage = `Failed to update admin status`;
		}
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString();
	}
</script>

<div class="admin-users">
	<header>
		<h1>Users</h1>
		<div class="header-actions">
			<button class="primary-btn" onclick={openCreate}>New User</button>
			<a href="/admin">Back to Admin</a>
		</div>
	</header>

	{#if statusMessage}
		<div class="status-message error">{statusMessage}</div>
	{/if}

	<div class="filters">
		<input
			type="search"
			bind:value={searchQuery}
			oninput={applyFilters}
			placeholder="Search users..."
		/>
		<select bind:value={filterStatus} onchange={applyFilters}>
			<option value="all">All Users</option>
			<option value="active">Active</option>
			<option value="disabled">Disabled</option>
		</select>
	</div>

	{#if loading}
		<p class="loading">Loading...</p>
	{:else if error}
		<div class="error">{error}</div>
	{:else if filteredUsers.length === 0}
		<p class="empty">No users found</p>
	{:else}
		<div class="users-table-wrapper">
			<table class="users-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Email</th>
						<th>Organization</th>
						<th>Role</th>
						<th>Status</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredUsers as user}
						<tr class:disabled-row={user.disabled}>
							<td data-label="Name">
								{user.name}
								{#if user.is_global_admin}
									<span class="badge admin">Global Admin</span>
								{/if}
							</td>
							<td data-label="Email">{user.email}</td>
							<td data-label="Organization">{user.org_name || '—'}</td>
							<td data-label="Role">{user.role || '—'}</td>
							<td data-label="Status">
								<span class="status-badge" class:active={!user.disabled} class:disabled={user.disabled}>
									{user.disabled ? 'Disabled' : 'Active'}
								</span>
							</td>
							<td data-label="Actions" class="actions-cell">
								<a class="action-btn" href="/admin/users/{user.id}">Manage</a>
								<button class="action-btn" onclick={() => toggleGlobalAdmin(user)}>
									{user.is_global_admin ? 'Remove Admin' : 'Make Admin'}
								</button>
								<button
									class="action-btn"
									class:danger={!user.disabled}
									class:success={user.disabled}
									onclick={() => toggleDisabled(user)}
								>
									{user.disabled ? 'Enable' : 'Disable'}
								</button>
								<button class="action-btn" onclick={() => startEdit(user)}>Edit</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

{#if editingUser}
	<div class="modal-overlay" onclick={() => { editingUser = null; statusMessage = ''; }}></div>
	<div class="modal">
		<h2>Edit User</h2>
		<form onsubmit={(e) => { e.preventDefault(); saveEdit(); }}>
			<label>
				Name
				<input type="text" bind:value={editForm.name} required />
			</label>
			<label>
				Email
				<input type="email" bind:value={editForm.email} required />
			</label>
			<label>
				Phone
				<input type="tel" bind:value={editForm.phone} />
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={editForm.is_global_admin} />
				<span>Global Admin</span>
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={editForm.disabled} />
				<span>Disabled</span>
			</label>
			<div class="modal-actions">
				<button type="button" onclick={() => { editingUser = null; statusMessage = ''; }}>Cancel</button>
				<button type="submit">Save</button>
			</div>
		</form>
	</div>
{/if}

{#if showCreate}
	<div class="modal-overlay" onclick={() => (showCreate = false)}></div>
	<div class="modal">
		<h2>New User</h2>
		{#if createError}
			<div class="status-message error">{createError}</div>
		{/if}
		<form onsubmit={(e) => { e.preventDefault(); createUser(); }}>
			<label>
				Name
				<input type="text" bind:value={createForm.name} required />
			</label>
			<label>
				Email
				<input type="email" bind:value={createForm.email} required />
			</label>
			<label>
				Temporary Password
				<input type="text" bind:value={createForm.password} required minlength="8" />
			</label>
			<label>
				Phone
				<input type="tel" bind:value={createForm.phone} />
			</label>
			<label>
				Organization (optional)
				<select bind:value={createForm.org_id}>
					<option value="">— None —</option>
					{#each orgs as org}
						<option value={org.id}>{org.name}</option>
					{/each}
				</select>
			</label>
			{#if createForm.org_id}
				<label>
					Role
					<select bind:value={createForm.role}>
						{#each ROLES as r}
							<option value={r}>{r}</option>
						{/each}
					</select>
				</label>
			{/if}
			<label class="checkbox">
				<input type="checkbox" bind:checked={createForm.is_global_admin} />
				<span>Global Admin</span>
			</label>
			<div class="modal-actions">
				<button type="button" onclick={() => (showCreate = false)}>Cancel</button>
				<button type="submit" disabled={createSaving}>{createSaving ? 'Creating…' : 'Create'}</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.admin-users {
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
		margin-bottom: 1.5rem;
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

	.header-actions {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.primary-btn {
		padding: 0.5rem 1rem;
		min-height: var(--touch);
		background: var(--accent);
		color: var(--accent-text);
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
	}

	.primary-btn:hover {
		filter: brightness(1.05);
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

	.filters {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.filters input,
	.filters select {
		flex: 1;
		min-width: 200px;
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

	.users-table-wrapper {
		overflow-x: auto;
	}

	.users-table {
		width: 100%;
		border-collapse: collapse;
		background: var(--surface);
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.users-table thead {
		background: var(--surface-alt);
	}

	.users-table th {
		text-align: left;
		padding: 1rem;
		font-weight: 600;
		color: var(--text);
	}

	.users-table td {
		padding: 1rem;
		border-top: 1px solid var(--border);
		color: var(--text);
	}

	.users-table tr:hover {
		background: var(--surface-hover);
	}

	.users-table tr.disabled-row {
		opacity: 0.6;
	}

	.badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		font-size: 0.75rem;
		border-radius: var(--radius);
		margin-left: 0.5rem;
	}

	.badge.admin {
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 600;
	}

	.status-badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius);
		font-size: 0.875rem;
	}

	.status-badge.active {
		background: var(--good);
		color: var(--bg);
	}

	.status-badge.disabled {
		background: var(--bad);
		color: var(--text);
	}

	.actions-cell {
		white-space: nowrap;
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
		margin-bottom: 0.25rem;
	}

	.action-btn:hover {
		background: var(--surface-hover);
	}

	a.action-btn {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.action-btn.danger {
		background: rgba(var(--bad-rgb), 0.1);
		color: var(--bad);
		border-color: var(--bad);
	}

	.action-btn.danger:hover {
		background: rgba(var(--bad-rgb), 0.2);
	}

	.action-btn.success {
		background: rgba(63, 178, 127, 0.1);
		color: var(--good);
		border-color: var(--good);
	}

	.action-btn.success:hover {
		background: rgba(63, 178, 127, 0.2);
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
		max-height: 90vh;
		overflow-y: auto;
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

	.modal label.checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: normal;
	}

	.modal label.checkbox input {
		width: auto;
		margin: 0;
		min-height: var(--touch);
	}

	.modal input[type='text'],
	.modal input[type='email'],
	.modal input[type='tel'] {
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

	.modal select {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.75rem;
		font-size: 1rem;
		min-height: var(--touch);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		color: var(--text);
	}

	.modal-actions button[type='submit']:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
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
		.users-table thead {
			display: none;
		}

		.users-table td {
			display: block;
			text-align: right;
			padding: 0.5rem 1rem;
		}

		.users-table td:first-child {
			padding-top: 1rem;
		}

		.users-table td:last-child {
			padding-bottom: 1rem;
		}

		.users-table td::before {
			content: attr(data-label);
			float: left;
			font-weight: 600;
		}

		.users-table tr {
			display: block;
			margin-bottom: 1rem;
			border: 1px solid var(--border);
			border-radius: var(--radius);
		}

		.actions-cell {
			white-space: normal;
		}
	}
</style>
