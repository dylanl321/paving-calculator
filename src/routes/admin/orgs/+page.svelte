<script lang="ts">
	import { onMount } from 'svelte';

	type Org = {
		id: string;
		name: string;
		slug: string;
		member_count: number;
		created_at: number;
	};

	let orgs = $state<Org[]>([]);
	let filteredOrgs = $state<Org[]>([]);
	let searchQuery = $state('');
	let loading = $state(true);
	let error = $state('');
	let showCreateModal = $state(false);
	let newOrgName = $state('');
	let newOrgOwnerEmail = $state('');
	let creating = $state(false);
	let createStatus = $state('');

	onMount(async () => {
		await loadOrgs();
	});

	async function loadOrgs() {
		try {
			const res = await fetch('/api/admin/orgs');
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load organizations';
				loading = false;
				return;
			}

			const data = await res.json();
			orgs = data.orgs;
			filteredOrgs = orgs;
		} catch (e) {
			error = 'Failed to load organizations';
		} finally {
			loading = false;
		}
	}

	function handleSearch() {
		const query = searchQuery.toLowerCase().trim();
		if (!query) {
			filteredOrgs = orgs;
			return;
		}
		filteredOrgs = orgs.filter(
			(o) => o.name.toLowerCase().includes(query) || o.slug.toLowerCase().includes(query)
		);
	}

	async function createOrg() {
		if (!newOrgName.trim()) return;

		creating = true;
		createStatus = '';
		try {
			const payload: { name: string; ownerEmail?: string } = { name: newOrgName.trim() };
			if (newOrgOwnerEmail.trim()) {
				payload.ownerEmail = newOrgOwnerEmail.trim();
			}

			const res = await fetch('/api/admin/orgs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const data = await res.json();
				createStatus = data.error || 'Failed to create organization';
				return;
			}

			await loadOrgs();
			showCreateModal = false;
			newOrgName = '';
			newOrgOwnerEmail = '';
			createStatus = '';
		} catch (e) {
			createStatus = 'Failed to create organization';
		} finally {
			creating = false;
		}
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString();
	}
</script>

<div class="admin-orgs">
	<header>
		<h1>Organizations</h1>
		<div class="actions">
			<a href="/admin">Back to Admin</a>
			<button onclick={() => (showCreateModal = true)}>Create Organization</button>
		</div>
	</header>

	<div class="search-bar">
		<input
			type="search"
			bind:value={searchQuery}
			oninput={handleSearch}
			placeholder="Search organizations..."
		/>
	</div>

	{#if loading}
		<p class="loading">Loading...</p>
	{:else if error}
		<div class="error">{error}</div>
	{:else if filteredOrgs.length === 0}
		<p class="empty">No organizations found</p>
	{:else}
		<div class="orgs-table-wrapper">
			<table class="orgs-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Slug</th>
						<th>Members</th>
						<th>Created</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredOrgs as org}
						<tr>
							<td data-label="Name">{org.name}</td>
							<td data-label="Slug">{org.slug}</td>
							<td data-label="Members">{org.member_count}</td>
							<td data-label="Created">{formatDate(org.created_at)}</td>
							<td data-label="Actions">
								<a href="/admin/orgs/{org.id}">View</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

{#if showCreateModal}
	<div class="modal-overlay" onclick={() => (showCreateModal = false)}></div>
	<div class="modal">
		<h2>Create Organization</h2>
		{#if createStatus}
			<div class="status-message error">{createStatus}</div>
		{/if}
		<form onsubmit={(e) => { e.preventDefault(); createOrg(); }}>
			<label>
				Organization Name
				<input
					type="text"
					bind:value={newOrgName}
					placeholder="Acme Paving Co."
					required
					autofocus
				/>
			</label>
			<label>
				Owner Email (optional)
				<input
					type="email"
					bind:value={newOrgOwnerEmail}
					placeholder="owner@example.com"
				/>
			</label>
			<div class="modal-actions">
				<button type="button" onclick={() => (showCreateModal = false)}>Cancel</button>
				<button type="submit" disabled={creating || !newOrgName.trim()}>
					{creating ? 'Creating...' : 'Create'}
				</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.admin-orgs {
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

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.actions a,
	.actions button {
		padding: 0.5rem 1rem;
		min-height: var(--touch);
		display: flex;
		align-items: center;
		text-decoration: none;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		font-size: 1rem;
		cursor: pointer;
	}

	.actions a {
		background: var(--surface);
		color: var(--text);
	}

	.actions button {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.actions a:hover {
		background: var(--surface-hover);
	}

	.actions button:hover {
		opacity: 0.9;
	}

	.search-bar {
		margin-bottom: 1.5rem;
	}

	.search-bar input {
		width: 100%;
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

	.orgs-table-wrapper {
		overflow-x: auto;
	}

	.orgs-table {
		width: 100%;
		border-collapse: collapse;
		background: var(--surface);
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.orgs-table thead {
		background: var(--surface-alt);
	}

	.orgs-table th {
		text-align: left;
		padding: 1rem;
		font-weight: 600;
		color: var(--text);
	}

	.orgs-table td {
		padding: 1rem;
		border-top: 1px solid var(--border);
		color: var(--text);
	}

	.orgs-table tr:hover {
		background: var(--surface-hover);
	}

	.orgs-table a {
		color: var(--accent);
		text-decoration: none;
		padding: 0.25rem 0.5rem;
	}

	.orgs-table a:hover {
		text-decoration: underline;
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

	.modal label {
		display: block;
		margin-bottom: 1.5rem;
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 600;
	}

	.modal input {
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
		background: var(--surface);
		color: var(--text);
	}

	.modal-actions button[type='submit'] {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.modal-actions button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.orgs-table thead {
			display: none;
		}

		.orgs-table td {
			display: block;
			text-align: right;
			padding: 0.5rem 1rem;
		}

		.orgs-table td:first-child {
			padding-top: 1rem;
		}

		.orgs-table td:last-child {
			padding-bottom: 1rem;
		}

		.orgs-table td::before {
			content: attr(data-label);
			float: left;
			font-weight: 600;
		}

		.orgs-table tr {
			display: block;
			margin-bottom: 1rem;
			border: 1px solid var(--border);
			border-radius: var(--radius);
		}
	}
</style>
