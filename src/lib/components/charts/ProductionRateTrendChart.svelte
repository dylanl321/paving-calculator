<script lang="ts">
	import { LineChart } from 'layerchart';
	import ChartMount from '$lib/components/charts/ChartMount.svelte';

	let {
		data = [],
		targetRate = 0
	}: { data: Array<{ date: string; tons: number; hours: number }>; targetRate?: number } = $props();

	// Filter out days with zero hours and compute rate with rolling average
	const chartData = $derived(
		(() => {
			const filtered = data.filter((d) => d.hours > 0);
			const withRate = filtered.map((d) => {
				const [, month, day] = d.date.split('-');
				return {
					rate: d.tons / d.hours,
					dateLabel: `${parseInt(month)}/${parseInt(day)}`
				};
			});

			// Compute 3-day rolling average
			return withRate.map((d, i) => {
				const start = Math.max(0, i - 2);
				const win = withRate.slice(start, i + 1);
				const rollingAvg = win.reduce((sum, p) => sum + p.rate, 0) / win.length;
				return { ...d, rollingAvg };
			});
		})()
	);

	const isEmpty = $derived(chartData.length === 0);

	const lineChartProps = $derived({
		data: chartData,
		x: 'dateLabel',
		y: 'rollingAvg',
		xAxisLabel: 'Date',
		yAxisLabel: 'T/hr (3-Day Avg)',
		padding: { left: 52, bottom: 32, top: 8, right: 8 }
	});

	// Stats for display
	const stats = $derived(
		isEmpty
			? null
			: (() => {
					const rates = chartData.map((d) => d.rate);
					const latest = rates[rates.length - 1];
					const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length;
					const best = Math.max(...rates);
					return { latest, avg, best };
				})()
	);
</script>

<div class="chart">
	{#if isEmpty}
		<p class="empty">No rate data yet.</p>
	{:else}
		<div class="stats-row">
			{#if stats}
				<div class="stat-pill">
					<span class="pill-label">Latest</span>
					<span class="pill-value">{stats.latest.toFixed(1)} T/hr</span>
				</div>
				<div class="stat-pill">
					<span class="pill-label">Avg</span>
					<span class="pill-value">{stats.avg.toFixed(1)} T/hr</span>
				</div>
				<div class="stat-pill">
					<span class="pill-label">Best</span>
					<span class="pill-value">{stats.best.toFixed(1)} T/hr</span>
				</div>
			{/if}
		</div>
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
		--color-primary: #fb923c;
	}

	.stats-row {
		display: flex;
		gap: 8px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}

	.stat-pill {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 12px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 6px;
		min-width: 80px;
	}

	.stat-pill.target {
		border-style: dashed;
	}

	.pill-label {
		font-size: 0.7rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.pill-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--accent);
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
