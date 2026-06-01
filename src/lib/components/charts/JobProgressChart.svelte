<script lang="ts">
	import { LineChart } from 'layerchart';
	import { onMount } from 'svelte';
	import { feetFromLoads } from '$lib/config/formulas';

	let {
		widthFt = 12,
		rateLbsSy = 0,
		tonsPerLoad = 18.5
	}: { widthFt?: number; rateLbsSy?: number; tonsPerLoad?: number } = $props();

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	// Feet of road remaining for each count of loads still on the way, at the
	// current width + spread rate. Pure function of the live job settings.
	const loadCounts = [1, 2, 3, 4, 5, 6, 8, 10];

	const data = $derived(
		loadCounts.map((loads) => ({
			loads,
			feet: Math.round(feetFromLoads({ loads, tonsPerLoad, widthFt, rateLbsSy }))
		}))
	);
</script>

<div class="chart">
	{#if mounted && rateLbsSy > 0}
		<LineChart
			{data}
			x="loads"
			y="feet"
			padding={{ left: 52, bottom: 28, top: 8, right: 8 }}
		/>
	{:else}
		<p class="empty">Set a target thickness to see the distance curve.</p>
	{/if}
</div>

<style>
	.chart {
		height: 200px;
		width: 100%;
		--color-primary: var(--accent);
	}

	.empty {
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 60px 12px;
		margin: 0;
	}

	.chart :global(text) {
		fill: var(--text-muted);
		font-size: 0.7rem;
	}

	.chart :global(.tick line),
	.chart :global(path.domain) {
		stroke: var(--border);
	}
</style>
