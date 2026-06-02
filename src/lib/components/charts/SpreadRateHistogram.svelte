<script lang="ts">
	interface Load {
		spread_rate: number | null;
		[key: string]: any;
	}

	interface Props {
		loads: Load[];
		targetRate: number | null;
		toleranceLbsSy: number;
	}

	let { loads, targetRate, toleranceLbsSy }: Props = $props();

	const pad = { left: 44, right: 8, top: 8, bottom: 28 };
	const plotW = 100 - pad.left - pad.right;
	const plotH = 100 - pad.top - pad.bottom;

	const validLoads = $derived(
		loads.filter((load): load is Load & { spread_rate: number } => load.spread_rate != null)
	);

	const spreadRates = $derived(validLoads.map((load) => load.spread_rate));

	const hasData = $derived(spreadRates.length > 0);

	const dataRange = $derived.by(() => {
		if (!hasData) return { min: 0, max: 100 };
		const min = Math.min(...spreadRates);
		const max = Math.max(...spreadRates);

		if (targetRate != null) {
			const targetMin = targetRate - toleranceLbsSy * 3;
			const targetMax = targetRate + toleranceLbsSy * 3;
			return {
				min: Math.min(min, targetMin),
				max: Math.max(max, targetMax)
			};
		}

		const padding = (max - min) * 0.1;
		return {
			min: Math.floor(min - padding),
			max: Math.ceil(max + padding)
		};
	});

	const binCount = $derived.by(() => {
		if (!hasData) return 6;
		if (spreadRates.length < 3) return 3;
		if (spreadRates.length < 10) return 5;
		return 8;
	});

	const binWidth = $derived((dataRange.max - dataRange.min) / binCount);

	const bins = $derived.by(() => {
		if (!hasData) return [];
		const result: { min: number; max: number; count: number; color: string }[] = [];

		for (let i = 0; i < binCount; i++) {
			const binMin = dataRange.min + i * binWidth;
			const binMax = binMin + binWidth;
			const count = spreadRates.filter((rate) => rate >= binMin && rate < binMax).length;

			let color = 'neutral';
			if (targetRate != null) {
				const binCenter = (binMin + binMax) / 2;
				const deviation = Math.abs(binCenter - targetRate);
				if (deviation <= toleranceLbsSy) {
					color = 'good';
				} else if (deviation <= toleranceLbsSy * 1.5) {
					color = 'warn';
				} else {
					color = 'bad';
				}
			}

			result.push({ min: binMin, max: binMax, count, color });
		}

		return result;
	});

	const maxCount = $derived(Math.max(...bins.map((b) => b.count), 1));

	const yTicks = $derived.by(() => {
		if (!hasData) return [0, 2, 4];
		if (maxCount <= 3) return [0, 1, 2, 3].slice(0, maxCount + 1);
		if (maxCount <= 6) return [0, Math.floor(maxCount / 2), maxCount];
		return [0, Math.floor(maxCount / 3), Math.floor((maxCount * 2) / 3), maxCount];
	});

	function barX(index: number): number {
		const slot = plotW / binCount;
		return pad.left + index * slot + slot * 0.1;
	}

	function barWidth(): number {
		return (plotW / binCount) * 0.8;
	}

	function barY(count: number): number {
		if (maxCount === 0) return pad.top + plotH;
		return pad.top + plotH * (1 - count / maxCount);
	}

	function barHeight(count: number): number {
		if (maxCount === 0) return 0;
		return plotH * (count / maxCount);
	}

	function xPosition(rate: number): number {
		const range = dataRange.max - dataRange.min;
		if (range === 0) return pad.left;
		return pad.left + ((rate - dataRange.min) / range) * plotW;
	}

	const xTicks = $derived.by(() => {
		const result = [];
		for (let i = 0; i <= binCount; i += Math.ceil(binCount / 4)) {
			const value = Math.round(dataRange.min + i * binWidth);
			result.push(value);
		}
		return result;
	});
</script>

{#if !hasData}
	<div class="empty-state">Log loads with spread rate to see distribution</div>
{:else}
	<div class="chart">
		<svg
			viewBox="0 0 100 100"
			preserveAspectRatio="none"
			role="img"
			aria-label="Spread rate distribution histogram showing load count by rate range"
		>
			<!-- Grid lines -->
			{#each yTicks as tick (tick)}
				{@const y = pad.top + plotH * (1 - tick / maxCount)}
				<line x1={pad.left} y1={y} x2={100 - pad.right} y2={y} class="grid" />
				<text x={pad.left - 2} y={y + (tick === 0 ? 3 : 0)} text-anchor="end" class="tick-label"
					>{tick}</text
				>
			{/each}

			<!-- Tolerance band -->
			{#if targetRate != null}
				{@const bandMin = xPosition(targetRate - toleranceLbsSy)}
				{@const bandMax = xPosition(targetRate + toleranceLbsSy)}
				<rect
					x={bandMin}
					y={pad.top}
					width={bandMax - bandMin}
					height={plotH}
					class="tolerance-band"
				/>
			{/if}

			<!-- Bars -->
			{#each bins as bin, i (i)}
				{@const x = barX(i)}
				{@const w = barWidth()}
				{@const h = barHeight(bin.count)}
				{@const y = barY(bin.count)}
				{#if bin.count > 0}
					<rect {x} {y} width={w} height={h} class="bar bar-{bin.color}" rx="0.6" />
				{/if}
			{/each}

			<!-- Target line -->
			{#if targetRate != null}
				{@const targetX = xPosition(targetRate)}
				<line x1={targetX} y1={pad.top} x2={targetX} y2={pad.top + plotH} class="target-line" />
			{/if}

			<!-- X-axis ticks -->
			{#each xTicks as tick (tick)}
				{@const x = xPosition(tick)}
				<text {x} y={98} text-anchor="middle" class="tick-label">{tick}</text>
			{/each}
		</svg>
	</div>
{/if}

<style>
	.chart {
		height: 200px;
		width: 100%;
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

	.tolerance-band {
		fill: color-mix(in srgb, var(--good) 8%, transparent);
	}

	.bar {
		stroke: none;
	}

	.bar-neutral {
		fill: color-mix(in srgb, var(--accent) 55%, var(--surface));
	}

	.bar-good {
		fill: var(--good);
	}

	.bar-warn {
		fill: var(--warn);
	}

	.bar-bad {
		fill: var(--bad);
	}

	.target-line {
		stroke: var(--accent);
		stroke-width: 0.4;
		stroke-dasharray: 2 2;
		vector-effect: non-scaling-stroke;
	}

	.tick-label {
		fill: var(--text-muted);
		font-size: 3.2px;
		vector-effect: non-scaling-stroke;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 200px;
		padding: var(--sp-4);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		text-align: center;
		background: color-mix(in srgb, var(--surface-alt) 30%, transparent);
		border: 1px dashed var(--border);
		border-radius: var(--radius-sm);
	}
</style>
