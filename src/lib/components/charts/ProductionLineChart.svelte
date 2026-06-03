<script lang="ts">
	import { LineChart } from 'layerchart';
	import ChartMount from '$lib/components/charts/ChartMount.svelte';

	let {
		data = [],
		targetTons = 0
	}: { data: Array<{ date: string; tons: number }>; targetTons?: number } = $props();

	const isEmpty = $derived(data.length === 0 || data.every((d) => d.tons === 0));

	// Format date from 'YYYY-MM-DD' to 'M/d'
	const chartData = $derived(
		data.map((d) => {
			const [year, month, day] = d.date.split('-');
			return {
				...d,
				dateLabel: `${parseInt(month)}/${parseInt(day)}`
			};
		})
	);

	const lineChartProps = $derived({
		data: chartData,
		x: 'dateLabel',
		y: 'tons',
		xAxisLabel: 'Date',
		yAxisLabel: 'Tons',
		padding: { left: 52, bottom: 32, top: 8, right: 8 }
	});
</script>

<div class="chart">
	{#if isEmpty}
		<p class="empty">No production data yet.</p>
	{:else}
		{#if targetTons && targetTons > 0}
			<div class="target-label">Target: {targetTons.toFixed(1)} tons/day</div>
		{/if}
		<ChartMount>
			<LineChart {...lineChartProps} />
		</ChartMount>
	{/if}
</div>

<style>
	.chart {
		height: 240px;
		width: 100%;
		position: relative;
		--color-primary: var(--accent);
	}

	.target-label {
		position: absolute;
		top: 8px;
		right: 12px;
		font-size: 0.75rem;
		color: var(--text-muted);
		background: var(--surface);
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px dashed var(--border);
		z-index: 10;
	}

	.empty {
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 90px 12px;
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
