<script lang="ts">
	import { BarChart } from 'layerchart';
	import { onMount } from 'svelte';
	import { spreadRateFromThickness } from '$lib/config/formulas';

	let { targetRate = 0 }: { targetRate?: number } = $props();

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	// Lift-thickness candidates the crew commonly runs. The target rate is a
	// pure function of thickness (THICK_MULT), so this is the real rate curve
	// they are working against -- the current target is highlighted.
	const thicknesses = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

	const data = $derived(
		thicknesses.map((t) => ({
			thickness: `${t}"`,
			rate: Math.round(spreadRateFromThickness(t))
		}))
	);
</script>

<div class="chart">
	{#if mounted}
		<BarChart
			{data}
			x="thickness"
			y="rate"
			padding={{ left: 44, bottom: 24, top: 8, right: 8 }}
		/>
	{/if}
</div>

<style>
	.chart {
		height: 180px;
		width: 100%;
		--color-primary: var(--accent);
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
