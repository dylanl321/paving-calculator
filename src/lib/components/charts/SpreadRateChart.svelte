<script lang="ts">
	import { spreadRateFromThickness } from '$lib/config/formulas';

	let { targetRate = 0 }: { targetRate?: number } = $props();

	const thicknesses = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

	const points = $derived(
		thicknesses.map((t) => ({
			label: `${t}"`,
			rate: Math.round(spreadRateFromThickness(t)),
			isTarget: Math.round(spreadRateFromThickness(t)) === targetRate
		}))
	);

	const maxRate = $derived(Math.max(...points.map((p) => p.rate), 1));

	const pad = { left: 44, right: 8, top: 8, bottom: 28 };
	const plotW = 100 - pad.left - pad.right;
	const plotH = 100 - pad.top - pad.bottom;

	function barX(index: number, count: number): number {
		const slot = plotW / count;
		return pad.left + index * slot + slot * 0.15;
	}

	function barWidth(count: number): number {
		return (plotW / count) * 0.7;
	}

	function barY(rate: number): number {
		return pad.top + plotH * (1 - rate / maxRate);
	}

	function barHeight(rate: number): number {
		return plotH * (rate / maxRate);
	}

	const yTicks = $derived([0, Math.round(maxRate / 2), maxRate]);
</script>

<div class="chart">
	<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Spread rate by lift thickness">
		{#each yTicks as tick, i (tick)}
			{@const y = pad.top + plotH * (1 - tick / maxRate)}
			<line x1={pad.left} y1={y} x2={100 - pad.right} y2={y} class="grid" />
			<text x={pad.left - 2} y={y + (i === 0 ? 3 : 0)} text-anchor="end" class="tick-label">{tick}</text>
		{/each}

		{#each points as point, i (point.label)}
			{@const x = barX(i, points.length)}
			{@const w = barWidth(points.length)}
			{@const h = barHeight(point.rate)}
			{@const y = barY(point.rate)}
			<rect
				{x}
				{y}
				width={w}
				height={h}
				class="bar"
				class:target={point.isTarget}
				rx="0.6"
			/>
			<text x={x + w / 2} y={98} text-anchor="middle" class="tick-label">{point.label}</text>
		{/each}
	</svg>
</div>

<style>
	.chart {
		height: 180px;
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

	.bar {
		fill: color-mix(in srgb, var(--accent) 55%, var(--surface));
	}

	.bar.target {
		fill: var(--accent);
	}

	.tick-label {
		fill: var(--text-muted);
		font-size: 3.2px;
		vector-effect: non-scaling-stroke;
	}
</style>
