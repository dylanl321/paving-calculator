<!--
	Card — the shared surface container that replaces the per-page `.calc-card` /
	`.panel` / `.card` reimplementations. Token-driven surface + border + radius
	with optional header (title/subtitle/actions snippet) and elevation.

	Usage:
		Card title="Key stats" subtitle="Auto-derived" with an actions snippet
		and body content. A header-less Card is just a padded surface. Pass an
		href plus interactive to render the whole card as a link.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import SectionHeader from './SectionHeader.svelte';

	let {
		title,
		subtitle,
		eyebrow,
		padding = 'md',
		elevation = 'none',
		interactive = false,
		span,
		href,
		actions,
		children
	}: {
		title?: string;
		subtitle?: string;
		eyebrow?: string;
		padding?: 'none' | 'sm' | 'md' | 'lg';
		elevation?: 'none' | 'sm' | 'md' | 'lg';
		interactive?: boolean;
		/** Grid-column span when placed inside a CardGrid (1 / 2 / full width). */
		span?: 1 | 2 | 'full';
		href?: string;
		actions?: Snippet;
		children?: Snippet;
	} = $props();

	const hasHeader = $derived(Boolean(title || actions));
</script>

{#snippet body()}
	{#if hasHeader}
		<SectionHeader title={title ?? ''} {subtitle} {eyebrow} {actions} />
	{/if}
	{#if children}
		{@render children()}
	{/if}
{/snippet}

{#if href}
	<a
		{href}
		class="card card--p-{padding} card--e-{elevation}"
		class:card--interactive={true}
		class:card--span-1={span === 1}
		class:card--span-2={span === 2}
		class:card--span-full={span === 'full'}
	>
		{@render body()}
	</a>
{:else}
	<div
		class="card card--p-{padding} card--e-{elevation}"
		class:card--interactive={interactive}
		class:card--span-1={span === 1}
		class:card--span-2={span === 2}
		class:card--span-full={span === 'full'}
	>
		{@render body()}
	</div>
{/if}

<style>
	.card {
		display: block;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		min-width: 0;
		/* Fill the grid row so siblings in a CardGrid are equal height. */
		height: 100%;
	}

	/* Grid-column span intent (used inside CardGrid). Drops to 1 column on
	   narrow viewports where the grid itself collapses to a single track. */
	.card--span-2 {
		grid-column: span 2;
	}
	.card--span-full {
		grid-column: 1 / -1;
	}

	@media (max-width: 640px) {
		.card--span-2 {
			grid-column: auto;
		}
	}

	.card--p-none {
		padding: 0;
	}
	.card--p-sm {
		padding: var(--sp-3);
	}
	.card--p-md {
		padding: var(--sp-5);
	}
	.card--p-lg {
		padding: var(--sp-6);
	}

	.card--e-sm {
		box-shadow: var(--shadow-sm);
	}
	.card--e-md {
		box-shadow: var(--shadow-md);
	}
	.card--e-lg {
		box-shadow: var(--shadow-lg);
	}

	.card--interactive {
		transition:
			border-color var(--dur) var(--ease),
			transform var(--dur) var(--ease),
			box-shadow var(--dur) var(--ease);
	}

	.card--interactive:hover {
		border-color: var(--accent);
	}

	@media (prefers-reduced-motion: no-preference) {
		.card--interactive:hover {
			transform: translateY(-2px);
			box-shadow: var(--shadow-md);
		}
	}
</style>
