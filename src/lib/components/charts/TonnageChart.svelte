<script lang="ts">
	import { AreaChart } from 'layerchart';
	import ChartMount from '$lib/components/charts/ChartMount.svelte';
	import { tonnageToOrder } from '$lib/config/formulas';

	let {
		widthFt = 12,
		rateLbsSy = 0,
		wastePct = 0
	}: { widthFt?: number; rateLbsSy?: number; wastePct?: number } = $props();

	// Tons-to-order across a range of run lengths for the current width + rate.
	// A planning curve computed straight from the tonnage formula -- no stored data.
	const lengths = [100, 250, 500, 1000, 1500, 2000, 3000, 5000];

	const data = $derived(
		lengths.map((lengthFt) => ({
			length: lengthFt,
			tons: Math.round(
				tonnageToOrder({ lengthFt, widthFt, rateLbsSy, wastePct })
			)
		}))
	);
</script>

<div class="chart">
	{#if rateLbsSy > 0}
		<ChartMount>
			<AreaChart
				{data}
				x="length"
				y="tons"
				padding={{ left: 48, bottom: 28, top: 8, right: 8 }}
			/>
		</ChartMount>
	{:else}
		<p class="empty">Set a target thickness to see the tonnage curve.</p>
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
