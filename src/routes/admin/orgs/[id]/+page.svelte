<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	type Org = {
		id: string;
		name: string;
		slug: string;
		created_at: number;
	};

	type Member = {
		user_id: string;
		user_name: string;
		user_email: string;
		role: string;
		invited_at: number;
	};

	let org = $state<Org | null>(null);
	let members = $state<Member[]>([]);
	let loading = $state(true);
	let error = $state('');
	let editingOrg = $state(false);
	let editOrgName = $state('');
	let editOrgSlug = $state('');

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
				alert(data.error || 'Failed to update organization');
				return;
			}

			await loadOrg();
			editingOrg = false;
		} catch (e) {
			alert('Failed to update organization');
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
						<button type="button" onclick={() => (editingOrg = false)}>Cancel</button>
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
							</tr>
						</thead>
						<tbody>
							{#each members as member}
								<tr>
									<td data-label="Name">{member.user_name}</td>
									<td data-label="Email">{member.user_email}</td>
									<td data-label="Role">{member.role}</td>
									<td data-label="Joined">{formatDate(member.invited_at)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>

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
		border-bottom: 2px solid var(--color-border);
		padding-bottom: 1rem;
	}

	h1 {
		font-size: 1.75rem;
		margin: 0;
		color: var(--color-text);
	}

	h2 {
		font-size: 1.25rem;
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

	section {
		background: var(--color-bg-secondary);
		padding: 1.5rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}

	.section-header button {
		padding: 0.5rem 1rem;
		min-height: 48px;
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
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
		color: var(--color-text-secondary);
	}

	.info-list dd {
		margin: 0;
		color: var(--color-text);
	}

	.edit-form label {
		display: block;
		margin-bottom: 1rem;
		color: var(--color-text);
	}

	.edit-form input {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-bg);
		color: var(--color-text);
	}

	.form-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.form-actions button {
		padding: 0.5rem 1.5rem;
		min-height: 48px;
		border: none;
		border-radius: 4px;
		font-size: 1rem;
		cursor: pointer;
	}

	.form-actions button[type='button'] {
		background: var(--color-bg-tertiary);
		color: var(--color-text);
	}

	.form-actions button[type='submit'] {
		background: var(--color-primary);
		color: white;
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
		color: var(--color-text);
		border-bottom: 2px solid var(--color-border);
	}

	.members-table td {
		padding: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.members-table tr:hover {
		background: var(--color-bg-hover);
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
			border: 1px solid var(--color-border);
			border-radius: 8px;
		}
	}
</style>
