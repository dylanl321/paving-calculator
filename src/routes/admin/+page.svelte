<script lang="ts">
	import { onMount } from 'svelte';

	interface AdminStats {
		totalOrgs: number;
		totalUsers: number;
		activeUsers: number;
	}

	let stats = $state<AdminStats>({ totalOrgs: 0, totalUsers: 0, activeUsers: 0 });
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			const [orgsRes, usersRes] = await Promise.all([
				fetch('/api/admin/orgs'),
				fetch('/api/admin/users')
			]);

			if (!orgsRes.ok || !usersRes.ok) {
				if (orgsRes.status === 403 || usersRes.status === 403) {
					error = 'Access denied. Global admin privileges required.';
				} else {
					error = 'Failed to load admin data';
				}
				loading = false;
				return;
			}

			const orgsData = (await orgsRes.json()) as { orgs: unknown[] };
			const usersData = (await usersRes.json()) as { users: { disabled: boolean }[] };

			stats = {
				totalOrgs: orgsData.orgs.length,
				totalUsers: usersData.users.length,
				activeUsers: usersData.users.filter((u: { disabled: boolean }) => !u.disabled).length
			};
		} catch (e) {
			error = 'Failed to load admin data';
		} finally {
			loading = false;
		}
	});
</script>

<div class="admin-dashboard">
	<header>
		<h1>Global Admin Dashboard</h1>
		<nav>
			<a href="/admin/orgs">Organizations</a>
			<a href="/admin/users">Users</a>
			<a href="/dashboard">Back to App</a>
		</nav>
	</header>

	{#if loading}
		<p class="loading">Loading...</p>
	{:else if error}
		<div class="error">{error}</div>
	{:else}
		<div class="stats-grid">
			<a href="/admin/orgs" class="stat-card">
				<h2>{stats.totalOrgs}</h2>
				<p>Organizations</p>
			</a>
			<a href="/admin/users" class="stat-card">
				<h2>{stats.totalUsers}</h2>
				<p>Total Users</p>
			</a>
			<div class="stat-card">
				<h2>{stats.activeUsers}</h2>
				<p>Active Users</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.admin-dashboard {
		padding: 1rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	header {
		margin-bottom: 2rem;
		border-bottom: 2px solid var(--border);
		padding-bottom: 1rem;
	}

	h1 {
		font-size: 1.75rem;
		margin: 0 0 1rem 0;
		color: var(--text);
	}

	nav {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	nav a {
		padding: 0.5rem 1rem;
		background: var(--surface);
		color: var(--text);
		text-decoration: none;
		border-radius: var(--radius);
		min-height: var(--touch);
		display: flex;
		align-items: center;
		border: 1px solid var(--border);
	}

	nav a:hover {
		background: var(--surface-hover);
	}

	.loading,
	.error {
		text-align: center;
		padding: 2rem;
		font-size: 1.125rem;
		color: var(--text);
	}

	.error {
		color: var(--bad);
		background: var(--surface);
		border-radius: var(--radius);
		border: 1px solid var(--bad);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
	}

	.stat-card {
		background: var(--surface);
		padding: 2rem;
		border-radius: var(--radius);
		text-align: center;
		border: 1px solid var(--border);
		text-decoration: none;
		display: block;
		transition: background 0.15s ease;
	}

	a.stat-card:hover {
		background: var(--surface-hover);
		cursor: pointer;
	}

	.stat-card h2 {
		font-size: 3rem;
		margin: 0 0 0.5rem 0;
		color: var(--accent);
	}

	.stat-card p {
		font-size: 1.125rem;
		margin: 0;
		color: var(--text-muted);
	}
</style>
