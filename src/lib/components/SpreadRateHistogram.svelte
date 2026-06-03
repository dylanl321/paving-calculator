<script lang="ts">
	interface DbLoad {
		id: string;
		job_site_id: string;
		user_id: string;
		ticket_number: string | null;
		tons: number;
		timestamp: number;
		spread_rate: number | null;
		notes: string | null;
		created_at: number;
	}

	interface Props {
		jobSiteId: string;
		targetRate?: number | null;
		toleranceLbsSy?: number;
	}

	let { jobSiteId, targetRate = null, toleranceLbsSy = 5 }: Props = $props();

	let loads = $state<DbLoad[]>([]);
	let loading = $state(true);

	// Fetch loads
	$effect(() => {
		loading = true;
		fetch(`/api/job-sites/${jobSiteId}/loads?limit=200`)
			.then((res) => res.json())
			.then((data) => {
				loads = data.loads || [];
			})
			.catch(() => {
				loads = [];
			})
			.finally(() => {
				loading = false;
			});
	});

	// Filter loads with spread_rate data
	const loadsWithRate = $derived(loads.filter((l) => l.spread_rate != null));

	// Build histogram
	const histogram = $derived.by(() => {
		if (loadsWithRate.length === 0) return null;

		const rates = loadsWithRate.map((l) => l.spread_rate!);
		const minRate = Math.min(...rates);
		const maxRate = Math.max(...rates);

		// Determine range: either data-driven or target ± 3*tolerance
		let rangeMin: number;
		let rangeMax: number;

		if (targetRate != null && toleranceLbsSy > 0) {
			const targetMin = targetRate - 3 * toleranceLbsSy;
			const targetMax = targetRate + 3 * toleranceLbsSy;
			rangeMin = Math.min(minRate, targetMin);
			rangeMax = Math.max(maxRate, targetMax);
		} else {
			rangeMin = minRate;
			rangeMax = maxRate;
		}

		// Build 8-10 equal-width bins
		const numBins = 9;
		const binWidth = (rangeMax - rangeMin) / numBins;

		const bins = Array.from({ length: numBins }, (_, i) => {
			const binMin = rangeMin + i * binWidth;
			const binMax = binMin + binWidth;
			const midpoint = (binMin + binMax) / 2;

			const count = rates.filter((r) => r >= binMin && (i === numBins - 1 ? r <= binMax : r < binMax))
				.length;

			// Determine color based on relation to targetRate
			let color = 'var(--accent)';
			if (targetRate != null) {
				const delta = Math.abs(midpoint - targetRate);
				if (delta <= toleranceLbsSy) {
					color = 'var(--good)';
				} else if (delta <= 1.5 * toleranceLbsSy) {
					color = 'var(--warn)';
				} else {
					color = 'var(--bad)';
				}
			}

			return { binMin, binMax, midpoint, count, color };
		});

		return { bins, rangeMin, rangeMax };
	});

	const maxCount = $derived(
		histogram ? Math.max(...histogram.bins.map((b) => b.count), 1) : 1
	);

	// Statistics
	const avgRate = $derived.by(() => {
		if (loadsWithRate.length === 0) return null;
		const sum = loadsWithRate.reduce((acc, l) => acc + l.spread_rate!, 0);
		return sum / loadsWithRate.length;
	});

	const inSpecPercent = $derived.by(() => {
		if (loadsWithRate.length === 0 || targetRate == null) return null;
		const inSpec = loadsWithRate.filter(
			(l) => Math.abs(l.spread_rate! - targetRate) <= toleranceLbsSy
		).length;
		return (inSpec / loadsWithRate.length) * 100;
	});

	// Chart layout
	const pad = { left: 40, right: 8, top: 8, bottom: 28 };
	const plotW = 100 - pad.left - pad.right;
	const plotH = 100 - pad.top - pad.bottom;

	function barX(index: number, count: number): number {
		const slot = plotW / count;
		return pad.left + index * slot + slot * 0.1;
	}

	function barWidth(count: number): number {
		return (plotW / count) * 0.8;
	}

	function barY(count: number): number {
		return pad.top + plotH * (1 - count / maxCount);
	}

	function barHeight(count: number): number {
		return plotH * (count / maxCount);
	}

	function targetX(rate: number): number {
		if (!histogram) return 0;
		const { rangeMin, rangeMax } = histogram;
		const normalized = (rate - rangeMin) / (rangeMax - rangeMin);
		return pad.left + normalized * plotW;
	}

	const yTicks = $derived([0, Math.ceil(maxCount / 2), maxCount]);
</script>

{#if loading}
	<section class="histogram-panel">
		<div class="panel-head">
			<h3>Spread Rate Distribution</h3>
		</div>
		<div class="loading-state">Loading...</div>
	</section>
{:else if loadsWithRate.length === 0}
	<section class="histogram-panel">
		<div class="panel-head">
			<h3>Spread Rate Distribution</h3>
		</div>
		<div class="empty-state">
			<p>No spread rate data yet — enter tons and distance in the calculator</p>
		</div>
	</section>
{:else}
	<section class="histogram-panel">
		<div class="panel-head">
			<h3>Spread Rate Distribution</h3>
		</div>

		<div class="chart">
			<svg
				viewBox="0 0 100 100"
				preserveAspectRatio="none"
				role="img"
				aria-label="Spread rate distribution histogram"
			>
				{#each yTicks as tick, i (tick)}
					{@const y = pad.top + plotH * (1 - tick / maxCount)}
					<line x1={pad.left} y1={y} x2={100 - pad.right} y2={y} class="grid" />
					<text x={pad.left - 2} y={y + (i === 0 ? 3 : 0)} text-anchor="end" class="tick-label"
						>{tick}</text
					>
				{/each}

				{#if histogram}
					{#each histogram.bins as bin, i (i)}
						{@const x = barX(i, histogram.bins.length)}
						{@const w = barWidth(histogram.bins.length)}
						{@const h = barHeight(bin.count)}
						{@const y = barY(bin.count)}
						{#if bin.count > 0}
							<rect {x} {y} width={w} height={h} fill={bin.color} rx="0.6" />
						{/if}
						{#if i % 2 === 0 || histogram.bins.length <= 6}
							<text x={x + w / 2} y={98} text-anchor="middle" class="tick-label"
								>{Math.round(bin.midpoint)}</text
							>
						{/if}
					{/each}

					{#if targetRate != null}
						{@const x = targetX(targetRate)}
						<line
							x1={x}
							y1={pad.top}
							x2={x}
							y2={100 - pad.bottom}
							stroke="var(--accent)"
							stroke-width="0.4"
							stroke-dasharray="1 1"
							vector-effect="non-scaling-stroke"
						/>
						<text
							x={x}
							y={pad.top - 1}
							text-anchor="middle"
							class="target-label"
							fill="var(--accent)"
						>
							Target
						</text>
					{/if}
				{/if}
			</svg>
		</div>

		<div class="summary">
			{loadsWithRate.length} loads •
			{#if avgRate != null}avg {avgRate.toFixed(1)} lbs/yd²{/if}
			{#if inSpecPercent != null} • {inSpecPercent.toFixed(0)}% in-spec{/if}
		</div>
	</section>
{/if}

<style>
	.histogram-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.panel-head h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.loading-state,
	.empty-state {
		padding: 24px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.empty-state p {
		margin: 0;
	}

	.chart {
		height: 180px;
		width: 100%;
		margin-bottom: 12px;
	}

	svg {
		display: block;
		width: 100%;
		height: 100%;
	}

	.grid {
		stroke: var(--border);
		stroke-width: 0.15;
		vector-effect: non-scaling-stroke;
	}

	.tick-label {
		fill: var(--text-muted);
		font-size: 3.2px;
		vector-effect: non-scaling-stroke;
	}

	.target-label {
		font-size: 2.8px;
		font-weight: 600;
		vector-effect: non-scaling-stroke;
	}

	.summary {
		font-size: 0.85rem;
		color: var(--text-muted);
		text-align: center;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
</style>
