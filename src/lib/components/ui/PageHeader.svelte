<!--
	PageHeader — the single page-title idiom that replaces the copy-pasted
	`.page-header` / `.stage-head` / `.admin-page-header` blocks across the app.

	Usage:
		<PageHeader title="Projects" subtitle={org.name}>
			{#snippet actions()}
				<Button href="/dashboard/projects/new">New project</Button>
			{/snippet}
		</PageHeader>

	An optional `eyebrow` renders a small uppercase label above the title (the
	existing `.eyebrow` pattern). Pass a heading level (`as`) when the page title
	should not be an <h1> (e.g. nested under another heading).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		eyebrow,
		as = 'h1',
		actions,
		children
	}: {
		title: string;
		subtitle?: string;
		eyebrow?: string;
		as?: 'h1' | 'h2';
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<header class="page-header">
	<div class="page-header__text">
		{#if eyebrow}
			<span class="eyebrow">{eyebrow}</span>
		{/if}
		{#if as === 'h2'}
			<h2 class="page-header__title">{title}</h2>
		{:else}
			<h1 class="page-header__title">{title}</h1>
		{/if}
		{#if subtitle}
			<p class="page-header__subtitle">{subtitle}</p>
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</div>
	{#if actions}
		<div class="page-header__actions">
			{@render actions()}
		</div>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-4);
		flex-wrap: wrap;
		margin-bottom: var(--sp-6);
	}

	.page-header__text {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: 0;
	}

	.page-header__title {
		margin: 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		color: var(--text);
		line-height: 1.2;
		overflow-wrap: anywhere;
	}

	.page-header__subtitle {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.page-header__actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
</style>
