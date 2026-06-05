<script lang="ts">
	import type { DbLoad } from '$lib/server/db';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { UNIT_LABELS, toMetricTonnes } from '$lib/utils/unitConvert';
	import SpreadRateHistogram from '../charts/SpreadRateHistogramChart.svelte';
	import YieldEfficiencyGauge from '../YieldEfficiencyGauge.svelte';
	import MaterialOrderForecast from '../MaterialOrderForecast.svelte';
	import AfternoonForecastCard from '../AfternoonForecastCard.svelte';
	import SourceTag from '../SourceTag.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { spreadToleranceFor } from '$lib/config';

	interface Props {
		loads: DbLoad[];
		targetTonnage?: number | null;
		numLanes?: number | null;
		jobSiteId: string;
		isAuthenticated?: boolean;
	}

	let { loads, targetTonnage = null, numLanes = null, jobSiteId, isAuthenticated = false }: Props = $props();

	const totalTons = $derived(loads.filter(l => !l.rejected).reduce((sum, load) => sum + load.tons, 0));
	const loadCount = $derived(loads.filter(l => !l.rejected).length);
	const rejectedCount = $derived(loads.filter(l => l.rejected).length);
	const acceptedTons = $derived(loads.filter(l => !l.rejected).reduce((sum, l) => sum + l.tons, 0));
	const avgTonsPerLoad = $derived(loadCount > 0 ? totalTons / loadCount : 0);

	const tonsPerHour = $derived.by(() => {
		if (loads.length < 2) return 0;
		const sorted = [...loads].sort((a, b) => a.timestamp - b.timestamp);
		const firstTs = sorted[0].timestamp;
		const lastTs = sorted[sorted.length - 1].timestamp;
		const hoursDiff = (lastTs - firstTs) / 3600;
		return hoursDiff > 0 ? totalTons / hoursDiff : 0;
	});

	const displayTotalTons = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(totalTons) : totalTons
	);
	const displayAvgTons = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(avgTonsPerLoad) : avgTonsPerLoad
	);
	const displayTonsPerHour = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(tonsPerHour) : tonsPerHour
	);

	const completionPct = $derived(
		targetTonnage && targetTonnage > 0 && totalTons > 0
			? Math.min(100, (totalTons / targetTonnage) * 100)
			: null
	);
	const remainingTons = $derived(
		targetTonnage && targetTonnage > 0
			? Math.max(0, targetTonnage - totalTons)
			: null
	);
	const displayTargetTonnage = $derived(
		targetTonnage
			? (unitsStore.system === 'metric' ? toMetricTonnes(targetTonnage) : targetTonnage)
			: null
	);
	const displayRemainingTons = $derived(
		remainingTons != null
			? (unitsStore.system === 'metric' ? toMetricTonnes(remainingTons) : remainingTons)
			: null
	);

	const tolerance = $derived(spreadToleranceFor(calcContext.course_type.value));
	const targetRate = $derived(
		calcContext.lift_thickness.value > 0 ? calcContext.lift_thickness.value * 110 : null
	);

	const acceptedLoadsWithSpreadRate = $derived(
		loads.filter(l => !l.rejected && l.spread_rate != null && l.spread_rate > 0)
	);

	const avgSpreadRate = $derived.by(() => {
		if (acceptedLoadsWithSpreadRate.length === 0) return null;
		const sum = acceptedLoadsWithSpreadRate.reduce((acc, l) => acc + (l.spread_rate ?? 0), 0);
		return sum / acceptedLoadsWithSpreadRate.length;
	});

	const yieldEfficiency = $derived.by(() => {
		if (targetRate == null || avgSpreadRate == null) return null;
		return (avgSpreadRate / targetRate) * 100;
	});

	const laneBreakdown = $derived.by(() => {
		const map = new Map<number, {count: number, tons: number}>();
		for (const load of loads) {
			if (load.lane_number) {
				const existing = map.get(load.lane_number) || {count: 0, tons: 0};
				map.set(load.lane_number, {count: existing.count + 1, tons: existing.tons + load.tons});
			}
		}
		return [...map.entries()].sort((a, b) => a[0] - b[0]);
	});

	const passBreakdown = $derived.by(() => {
		const map = new Map<number, {count: number, tons: number}>();
		for (const load of loads) {
			if (load.pass_number) {
				const existing = map.get(load.pass_number) || {count: 0, tons: 0};
				map.set(load.pass_number, {count: existing.count + 1, tons: existing.tons + load.tons});
			}
		}
		return [...map.entries()].sort((a, b) => a[0] - b[0]);
	});
</script>

<div class="tally-card">
	<div class="tally-grid">
		<div class="tally-item">
			<div class="tally-label">Total Tons</div>
			<div class="tally-value">{displayTotalTons.toFixed(1)}</div>
			<div class="tally-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
		</div>

		<div class="tally-item">
			<div class="tally-label">Load Count</div>
			<div class="tally-value">{loadCount}</div>
			<div class="tally-unit">loads</div>
		</div>

		<div class="tally-item">
			<div class="tally-label">Avg/Load</div>
			<div class="tally-value">{displayAvgTons.toFixed(1)}</div>
			<div class="tally-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
		</div>

		{#if tonsPerHour > 0}
			<div class="tally-item">
				<div class="tally-label">Tons/Hour</div>
				<div class="tally-value">{displayTonsPerHour.toFixed(1)}</div>
				<div class="tally-unit">{UNIT_LABELS.tons[unitsStore.system]}/hr</div>
			</div>
		{/if}

		{#if rejectedCount > 0}
			<div class="tally-item tally-item--rejected">
				<div class="tally-label">Rejected</div>
				<div class="tally-value tally-value--rejected">{rejectedCount}</div>
				<div class="tally-unit">loads</div>
			</div>
		{/if}

		{#if avgSpreadRate != null}
			<div class="tally-item">
				<div class="tally-label">Avg Rate</div>
				<div class="tally-value">{Math.round(avgSpreadRate)}</div>
				<div class="tally-unit">lbs/SY</div>
			</div>
		{/if}
	</div>

	{#if completionPct != null}
		<div class="completion-section">
			<div class="completion-header">
				<span class="completion-label">Job Completion</span>
				<span class="completion-pct" class:completion-done={completionPct >= 100}>
					{completionPct.toFixed(1)}%
				</span>
			</div>
			<div class="completion-bar-track">
				<div
					class="completion-bar-fill"
					class:completion-bar-fill--done={completionPct >= 100}
					style="width: {Math.min(100, completionPct).toFixed(1)}%"
				></div>
			</div>
			<div class="completion-sub">
				{displayTotalTons.toFixed(1)} / {displayTargetTonnage!.toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]}
				{#if displayRemainingTons != null && displayRemainingTons > 0}
					<span class="completion-remaining">&nbsp;&mdash;&nbsp;{displayRemainingTons.toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]} remaining</span>
				{:else if completionPct >= 100}
					<span class="completion-remaining completion-remaining--done">&nbsp;&mdash;&nbsp;Goal reached!</span>
				{/if}
			</div>
		</div>

		{#if completionPct < 100}
			<MaterialOrderForecast
				{remainingTons}
				{avgTonsPerLoad}
				{tonsPerHour}
				{targetTonnage}
				{totalTons}
			/>
		{/if}

		{#if tonsPerHour > 0}
			<AfternoonForecastCard
				tonsDeliveredToday={acceptedTons}
				{targetTonnage}
				{tonsPerHour}
				{avgTonsPerLoad}
			/>
		{/if}
	{/if}

	{#if targetRate != null}
		<div class="yield-efficiency-section">
			<YieldEfficiencyGauge yieldEfficiency={yieldEfficiency} targetRate={targetRate} />
		</div>
		<div class="context-text">
			<SourceTag source={calcContext.lift_thickness.source} updatedAt={calcContext.lift_thickness.updatedAt} label="Thickness" />
			<SourceTag source={calcContext.course_type.source} updatedAt={calcContext.course_type.updatedAt} label="Course Type" />
			<span>Using {calcContext.lift_thickness.value}" lift, {calcContext.course_type.value} (±{tolerance.toleranceLbsSy} lbs/SY tolerance)</span>
		</div>
	{/if}
</div>

<div class="histogram-section">
	<h4>Spread Rate Distribution</h4>
	<SpreadRateHistogram
		loads={loads}
		targetRate={targetRate}
		toleranceLbsSy={tolerance.toleranceLbsSy}
	/>
</div>

{#if laneBreakdown.length > 1}
	<div class="breakdown-section">
		<h4 class="breakdown-title">By Lane</h4>
		<div class="breakdown-grid">
			{#each laneBreakdown as [lane, stats]}
				<div class="breakdown-item">
					<div class="breakdown-label">Lane {lane}</div>
					<div class="breakdown-value">{(unitsStore.system === 'metric' ? toMetricTonnes(stats.tons) : stats.tons).toFixed(1)}</div>
					<div class="breakdown-sub">{stats.count} loads</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

{#if passBreakdown.length > 1}
	<div class="breakdown-section">
		<h4 class="breakdown-title">By Pass</h4>
		<div class="breakdown-grid">
			{#each passBreakdown as [pass, stats]}
				<div class="breakdown-item">
					<div class="breakdown-label">Pass {pass}</div>
					<div class="breakdown-value">{(unitsStore.system === 'metric' ? toMetricTonnes(stats.tons) : stats.tons).toFixed(1)}</div>
					<div class="breakdown-sub">{stats.count} loads</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.tally-card {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.tally-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-4);
	}

	.tally-item {
		text-align: center;
	}

	.tally-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-1);
	}

	.tally-value {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-bold);
		color: var(--accent);
		line-height: 1.2;
	}

	.tally-unit {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: var(--sp-1);
	}

	.tally-item--rejected .tally-value {
		color: var(--error, #ef4444);
	}

	.yield-efficiency-section {
		margin-top: var(--sp-4);
		padding-top: var(--sp-4);
		border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}

	.histogram-section {
		margin-top: var(--sp-4);
		padding: var(--sp-4);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.histogram-section h4 {
		margin: 0 0 var(--sp-3) 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.breakdown-section {
		margin-top: var(--sp-4);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3) var(--sp-4);
	}

	.breakdown-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.breakdown-grid {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.breakdown-item {
		text-align: center;
		min-width: 60px;
	}

	.breakdown-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-bottom: var(--sp-1);
	}

	.breakdown-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}

	.breakdown-sub {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: 2px;
	}

	@media (max-width: 460px) {
		.tally-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.completion-section {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}

	.completion-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.completion-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.completion-pct {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--accent);
	}

	.completion-pct.completion-done {
		color: #22c55e;
	}

	.completion-bar-track {
		width: 100%;
		height: 10px;
		background: var(--surface-2, rgba(255,255,255,0.08));
		border-radius: 5px;
		overflow: hidden;
		margin-bottom: 0.4rem;
	}

	.completion-bar-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 5px;
		transition: width 0.4s ease;
	}

	.completion-bar-fill--done {
		background: #22c55e;
	}

	.completion-sub {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.completion-remaining {
		opacity: 0.75;
	}

	.completion-remaining--done {
		color: #22c55e;
		opacity: 1;
	}

	.context-text {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
		margin-top: var(--sp-3);
		padding: var(--sp-3);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
</style>
