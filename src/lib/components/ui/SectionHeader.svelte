<!--
	SectionHeader — a section-level heading used inside cards/panels. Replaces the
	hand-rolled `.section-header` / `.panel-head` idioms (heading on the left,
	optional action on the right).

	Usage:
		<SectionHeader title="Work zones" subtitle="Station ranges along the route">
			{#snippet actions()}
				<Button variant="ghost" size="sm">Add</Button>
			{/snippet}
		</SectionHeader>
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		eyebrow,
		as = 'h3',
		actions
	}: {
		title: string;
		subtitle?: string;
		eyebrow?: string;
		as?: 'h2' | 'h3' | 'h4';
		actions?: Snippet;
	} = $props();
</script>

<div class="section-header">
	<div class="section-header__text">
		{#if eyebrow}
			<span class="eyebrow">{eyebrow}</span>
		{/if}
		{#if as === 'h2'}
			<h2 class="section-header__title">{title}</h2>
		{:else if as === 'h4'}
			<h4 class="section-header__title">{title}</h4>
		{:else}
			<h3 class="section-header__title">{title}</h3>
		{/if}
		{#if subtitle}
			<p class="section-header__subtitle">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="section-header__actions">
			{@render actions()}
		</div>
	{/if}
</div>

<style>
	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}

	.section-header__text {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: 0;
	}

	.section-header__title {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
		color: var(--text);
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.section-header__subtitle {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.section-header__actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
</style>
