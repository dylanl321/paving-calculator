<!--
	CardGrid — a responsive CSS-grid wrapper for cards/tiles. Columns auto-fill
	at `min` width (default 260px) and `grid-auto-rows: 1fr` forces sibling cards
	to EQUAL height regardless of content. Pairs with Card's `span` prop so a
	card can declare width intent (1 / 2 / full) inside the grid.

	Usage:
		<CardGrid>
			<Card>…</Card>
			<Card span={2}>…</Card>
		</CardGrid>

		<CardGrid min="320px" gap="var(--sp-3)">…</CardGrid>
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		min = '260px',
		gap = 'var(--sp-4)',
		children
	}: {
		min?: string;
		gap?: string;
		children: Snippet;
	} = $props();
</script>

<div class="card-grid-x" style="--cg-min:{min};--cg-gap:{gap};">
	{@render children()}
</div>

<style>
	.card-grid-x {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--cg-min, 260px), 1fr));
		grid-auto-rows: 1fr;
		gap: var(--cg-gap, var(--sp-4));
		align-items: stretch;
		min-width: 0;
	}
</style>
