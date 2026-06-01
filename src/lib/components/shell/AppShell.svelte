<script lang="ts">
	import type { Snippet } from 'svelte';
	import NavSidebar from './NavSidebar.svelte';

	let {
		children,
		context,
		hasContext = false
	}: {
		children: Snippet;
		context?: Snippet;
		hasContext?: boolean;
	} = $props();

	const showContext = $derived(hasContext && !!context);
</script>

<div class="shell" class:with-context={showContext}>
	<NavSidebar />

	<main class="shell-main">
		{@render children()}
	</main>

	{#if showContext && context}
		<aside class="shell-context">
			{@render context()}
		</aside>
	{/if}
</div>

<style>
	/* Mobile-first: a single column. Sidebar renders its own mobile top bar /
	   drawer, the main content stacks below, the context panel is hidden
	   (its data lives inline on mobile). */
	.shell {
		display: block;
		min-height: 100vh;
	}

	.shell-main {
		padding: 12px 16px calc(40px + env(safe-area-inset-bottom));
	}

	.shell-context {
		display: none;
	}

	/* Tablet / iPad: icon-rail sidebar + content + job-site settings panel. */
	@media (min-width: 768px) {
		.shell {
			display: grid;
			grid-template-columns: var(--sidebar-rail-w) 1fr;
		}

		.shell.with-context {
			grid-template-columns: var(--sidebar-rail-w) 1fr var(--context-w);
		}

		.shell-main {
			min-width: 0;
			padding: 20px 24px 48px;
		}

		.shell.with-context .shell-context {
			display: block;
			border-left: 1px solid var(--border);
			background: var(--surface);
			min-height: 100vh;
		}

		.shell-context > :global(*) {
			position: sticky;
			top: 0;
			max-height: 100vh;
			overflow-y: auto;
			padding: 20px 18px;
		}
	}

	/* Desktop: full label sidebar. */
	@media (min-width: 1100px) {
		.shell {
			grid-template-columns: var(--sidebar-w) 1fr;
		}

		.shell.with-context {
			grid-template-columns: var(--sidebar-w) 1fr var(--context-w);
		}

		.shell-main {
			padding: 28px 32px 56px;
		}

		.shell-context > :global(*) {
			padding: 28px 22px;
		}
	}
</style>
