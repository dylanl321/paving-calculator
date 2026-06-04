<script lang="ts">
	import type { Snippet } from 'svelte';
	import AdminSidebar from './AdminSidebar.svelte';

	let {
		children,
		isGlobalAdmin = false,
		isOrgAdmin = false,
		orgName = null
	}: {
		children: Snippet;
		isGlobalAdmin?: boolean;
		isOrgAdmin?: boolean;
		orgName?: string | null;
	} = $props();
</script>

<div class="admin-shell">
	<AdminSidebar {isGlobalAdmin} {isOrgAdmin} {orgName} />

	<main class="admin-main">
		<div class="admin-main-inner">
			{@render children()}
		</div>
	</main>
</div>

<style>
	/* Mobile-first: single column; the sidebar renders its own mobile top bar/drawer. */
	.admin-shell {
		display: block;
		min-height: 100vh;
		background: var(--bg);
		color: var(--text);
	}

	.admin-main {
		padding: 16px;
	}

	.admin-main-inner {
		max-width: 1280px;
		margin: 0 auto;
		width: 100%;
	}

	/* Tablet / desktop: rail/sidebar + content grid. */
	@media (min-width: 900px) {
		.admin-shell {
			display: grid;
			grid-template-columns: var(--sidebar-rail-w) 1fr;
			grid-template-rows: 1fr;
			grid-template-areas: 'nav main';
			min-height: 100vh;
		}

		.admin-shell > :global(nav.sidebar) {
			grid-area: nav;
		}

		.admin-main {
			grid-area: main;
			min-width: 0;
			padding: 28px 32px 56px;
		}
	}

	@media (min-width: 1100px) {
		.admin-shell {
			grid-template-columns: var(--sidebar-w) 1fr;
		}
	}
</style>
