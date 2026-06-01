<script lang="ts">
	import { onMount } from 'svelte';

	type User = {
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
	};

	let users = $state<User[]>([]);
	let filteredUsers = $state<User[]>([]);
	let searchQuery = $state('');
	let filterOrg = $state('all');
	let filterStatus = $state('all');
	let loading = $state(true);
	let error = $state('');
	let editingUser = $state<User | null>(null);
	let editForm = $state({ name: '', email: '', phone: '', is_global_admin: false, disabled: false });

	onMount(async () => {
		await loadUsers();
	});

	async function loadUsers() {
		try {
			const res = await fetch('/api/admin/users');
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load users';
				loading = false;
				return;
			}

			const data = await res.json();
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

	function startEdit(user: User) {
		editingUser = user;
		editForm = {
			name: user.name,
			email: user.email,
			phone: user.phone || '',
			is_global_admin: user.is_global_admin,
			disabled: user.disabled
		};
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
				const data = await res.json();
				alert(data.error || 'Failed to update user');
				return;
			}

			await loadUsers();
			editingUser = null;
		} catch (e) {
			alert('Failed to update user');
		}
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString();
	}
</script>

<div class="admin-users">
	<header>
		<h1>Users</h1>
		<a href="/admin">Back to Admin</a>
	</header>

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
						<tr class:disabled={user.disabled}>
							<td data-label="Name">
								{user.name}
								{#if user.is_global_admin}
									<span class="badge">Admin</span>
								{/if}
							</td>
							<td data-label="Email">{user.email}</td>
							<td data-label="Organization">{user.org_name || '—'}</td>
							<td data-label="Role">{user.role || '—'}</td>
							<td data-label="Status">
								<span class="status" class:active={!user.disabled}>
									{user.disabled ? 'Disabled' : 'Active'}
								</span>
							</td>
							<td data-label="Actions">
								<button onclick={() => startEdit(user)}>Edit</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

{#if editingUser}
	<div class="modal-overlay" onclick={() => (editingUser = null)}></div>
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
				Global Admin
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={editForm.disabled} />
				Disabled
			</label>
			<div class="modal-actions">
				<button type="button" onclick={() => (editingUser = null)}>Cancel</button>
				<button type="submit">Save</button>
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
		border-bottom: 2px solid var(--color-border);
		padding-bottom: 1rem;
	}

	h1 {
		font-size: 1.75rem;
		margin: 0;
		color: var(--color-text);
	}

	header a {
		padding: 0.5rem 1rem;
		min-height: 48px;
		display: flex;
		align-items: center;
		background: var(--color-bg-secondary);
		color: var(--color-text);
		text-decoration: none;
		border-radius: 4px;
	}

	header a:hover {
		background: var(--color-bg-hover);
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
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-bg);
		color: var(--color-text);
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: 2rem;
		font-size: 1.125rem;
	}

	.error {
		color: var(--color-error);
		background: var(--color-bg-secondary);
		border-radius: 8px;
	}

	.users-table-wrapper {
		overflow-x: auto;
	}

	.users-table {
		width: 100%;
		border-collapse: collapse;
		background: var(--color-bg-secondary);
		border-radius: 8px;
		overflow: hidden;
	}

	.users-table thead {
		background: var(--color-bg-tertiary);
	}

	.users-table th {
		text-align: left;
		padding: 1rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.users-table td {
		padding: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.users-table tr:hover {
		background: var(--color-bg-hover);
	}

	.users-table tr.disabled {
		opacity: 0.6;
	}

	.badge {
		display: inline-block;
		padding: 0.125rem 0.5rem;
		background: var(--color-primary);
		color: white;
		font-size: 0.75rem;
		border-radius: 4px;
		margin-left: 0.5rem;
	}

	.status {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
		font-size: 0.875rem;
		background: var(--color-bg-tertiary);
		color: var(--color-text-secondary);
	}

	.status.active {
		background: rgba(34, 197, 94, 0.2);
		color: rgb(34, 197, 94);
	}

	.users-table button {
		padding: 0.25rem 0.75rem;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		min-height: 48px;
	}

	.users-table button:hover {
		opacity: 0.9;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-bg);
		padding: 2rem;
		border-radius: 8px;
		z-index: 101;
		min-width: 300px;
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal h2 {
		margin: 0 0 1.5rem 0;
		color: var(--color-text);
	}

	.modal label {
		display: block;
		margin-bottom: 1rem;
		color: var(--color-text);
	}

	.modal label.checkbox {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.modal label.checkbox input {
		width: auto;
		margin: 0;
	}

	.modal input[type='text'],
	.modal input[type='email'],
	.modal input[type='tel'] {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.modal-actions button {
		padding: 0.5rem 1.5rem;
		min-height: 48px;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
	}

	.modal-actions button[type='button'] {
		background: var(--color-bg-secondary);
		color: var(--color-text);
	}

	.modal-actions button[type='submit'] {
		background: var(--color-primary);
		color: white;
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
			border: 1px solid var(--color-border);
			border-radius: 8px;
		}
	}
</style>
