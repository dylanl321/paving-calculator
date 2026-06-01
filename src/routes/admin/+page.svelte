<script lang="ts">
	import { onMount } from 'svelte';

	let stats = $state<{
		totalOrgs: number;
		totalUsers: number;
		activeUsers: number;
	}>({ totalOrgs: 0, totalUsers: 0, activeUsers: 0 });
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

			const orgsData = await orgsRes.json();
			const usersData = await usersRes.json();

			stats = {
				totalOrgs: orgsData.orgs.length,
				totalUsers: usersData.users.length,
				activeUsers: usersData.users.filter((u: any) => !u.disabled).length
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
			<div class="stat-card">
				<h2>{stats.totalOrgs}</h2>
				<p>Organizations</p>
				<a href="/admin/orgs">Manage</a>
			</div>
			<div class="stat-card">
				<h2>{stats.totalUsers}</h2>
				<p>Total Users</p>
				<a href="/admin/users">Manage</a>
			</div>
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
		border-bottom: 2px solid var(--color-border);
		padding-bottom: 1rem;
	}

	h1 {
		font-size: 1.75rem;
		margin: 0 0 1rem 0;
		color: var(--color-text);
	}

	nav {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	nav a {
		padding: 0.5rem 1rem;
		background: var(--color-bg-secondary);
		color: var(--color-text);
		text-decoration: none;
		border-radius: 4px;
		min-height: 48px;
		display: flex;
		align-items: center;
	}

	nav a:hover {
		background: var(--color-bg-hover);
	}

	.loading,
	.error {
		text-align: center;
		padding: 2rem;
		font-size: 1.125rem;
	}

	.error {
		color: var(--color-error);
		background: var(--color-bg-secondary);
		border-radius: 8px;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1.5rem;
	}

	.stat-card {
		background: var(--color-bg-secondary);
		padding: 2rem;
		border-radius: 8px;
		text-align: center;
	}

	.stat-card h2 {
		font-size: 3rem;
		margin: 0 0 0.5rem 0;
		color: var(--color-primary);
	}

	.stat-card p {
		font-size: 1.125rem;
		margin: 0 0 1rem 0;
		color: var(--color-text-secondary);
	}

	.stat-card a {
		display: inline-block;
		padding: 0.5rem 1.5rem;
		background: var(--color-primary);
		color: white;
		text-decoration: none;
		border-radius: 4px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.stat-card a:hover {
		opacity: 0.9;
	}
</style>
