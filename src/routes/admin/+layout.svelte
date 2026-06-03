<script lang="ts">
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="admin-shell">
	<header class="admin-header">
		<div class="admin-header-content">
			<h1 class="admin-title">Paverate Admin</h1>
			<div class="admin-user">{data.adminUser.name}</div>
		</div>
	</header>

	<nav class="admin-nav">
		<a href="/admin" class="nav-item">Overview</a>
		<a href="/admin/orgs" class="nav-item">Organizations</a>
		<a href="/admin/users" class="nav-item">Users</a>
		<a href="/admin/emails" class="nav-item">Email Log</a>
		<a href="/dashboard" class="nav-item nav-item-secondary">← Back to app</a>
	</nav>

	<main class="admin-main">
		{@render children()}
	</main>
</div>

<style>
	.admin-shell {
		min-height: 100vh;
		background: var(--bg);
		color: var(--text);
	}

	.admin-header {
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.admin-header-content {
		max-width: 1600px;
		margin: 0 auto;
		padding: 1rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.admin-title {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0;
		color: var(--accent);
	}

	.admin-user {
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	.admin-nav {
		background: var(--surface-alt);
		border-bottom: 1px solid var(--border);
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem 1.5rem;
		max-width: 1600px;
		margin: 0 auto;
		overflow-x: auto;
	}

	.nav-item {
		display: block;
		padding: 0.75rem 1.25rem;
		min-height: 48px;
		border-radius: 0.5rem;
		text-decoration: none;
		color: var(--text);
		font-weight: 500;
		transition: background-color 0.15s;
		white-space: nowrap;
	}

	.nav-item:hover {
		background: var(--surface-hover);
	}

	.nav-item.nav-item-secondary {
		color: var(--text-muted);
		margin-inline-start: auto;
	}

	.admin-main {
		max-width: 1600px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	@media (max-width: 640px) {
		.admin-header-content {
			padding: 0.75rem 1rem;
		}

		.admin-title {
			font-size: 1.25rem;
		}

		.admin-nav {
			padding: 0.5rem 1rem;
		}

		.nav-item {
			padding: 0.75rem 1rem;
		}

		.admin-main {
			padding: 1.5rem 1rem;
		}
	}
</style>
