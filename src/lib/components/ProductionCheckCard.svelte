<script lang="ts">
	import { onDestroy } from 'svelte';
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceTag from './SourceTag.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { spreadSpecCheck } from '$lib/config';
	import { constant } from '$lib/config';
	import { feetFromTons, spreadRateFromThickness, spreadRatePlaced } from '$lib/config/formulas';
	import { unitsStore } from '$lib/stores/units.svelte';
	import {
		UNIT_LABELS,
		fromMeters,
		fromMetricTonnes,
		toKgPerM2,
		toMeters,
		toMetricTonnes
	} from '$lib/utils/unitConvert';

	const TOOL_ID = 'production-check';

	let tonsPlacedInput = $state<number | null>(null);
	let distancePavedInput = $state<number | null>(null);
	let availableTonsInput = $state<number | null>(null);
	let targetDistanceInput = $state<number | null>(null);

	const widthFt = $derived(calcContext.road_width.value);
	const thicknessIn = $derived(calcContext.lift_thickness.value);
	const courseType = $derived(calcContext.course_type.value);
	const targetRate = $derived(thicknessIn > 0 ? spreadRateFromThickness(thicknessIn) : null);

	const tonsPlaced = $derived(
		tonsPlacedInput != null && unitsStore.system === 'metric'
			? fromMetricTonnes(tonsPlacedInput)
			: tonsPlacedInput
	);
	const distancePavedFt = $derived(
		distancePavedInput != null && unitsStore.system === 'metric'
			? fromMeters(distancePavedInput)
			: distancePavedInput
	);
	const availableTons = $derived(
		availableTonsInput != null && unitsStore.system === 'metric'
			? fromMetricTonnes(availableTonsInput)
			: availableTonsInput
	);
	const targetDistanceFt = $derived(
		targetDistanceInput != null && unitsStore.system === 'metric'
			? fromMeters(targetDistanceInput)
			: targetDistanceInput
	);

	const actualRate = $derived(
		tonsPlaced != null && tonsPlaced > 0 && distancePavedFt != null && distancePavedFt > 0 && widthFt > 0
			? spreadRatePlaced({
					tons: tonsPlaced,
					lengthFt: distancePavedFt,
					widthFt,
					machineId: job.machineId,
					firstPass: job.firstPass
				})
			: null
	);
	const spec = $derived(spreadSpecCheck(actualRate, targetRate, courseType));
	const specBadge = $derived(spec ? ({ kind: spec.status, text: spec.label } as const) : null);
	const variance = $derived(
		actualRate != null && targetRate != null ? actualRate - targetRate : null
	);

	const reachableFt = $derived(
		availableTons != null && availableTons > 0 && targetRate != null && widthFt > 0
			? feetFromTons(availableTons, widthFt, targetRate)
			: null
	);
	const tonsNeeded = $derived(
		targetDistanceFt != null && targetDistanceFt > 0 && targetRate != null && widthFt > 0
			? (targetDistanceFt * widthFt * targetRate) /
				(constant('CONST.LB_PER_TON') * constant('CONST.SF_PER_SY'))
			: null
	);

	const displayTargetRate = $derived(
		targetRate != null && unitsStore.system === 'metric' ? toKgPerM2(targetRate) : targetRate
	);
	const displayActualRate = $derived(
		actualRate != null && unitsStore.system === 'metric' ? toKgPerM2(actualRate) : actualRate
	);
	const displayReachable = $derived(
		reachableFt != null && unitsStore.system === 'metric' ? toMeters(reachableFt) : reachableFt
	);
	const displayTonsNeeded = $derived(
		tonsNeeded != null && unitsStore.system === 'metric' ? toMetricTonnes(tonsNeeded) : tonsNeeded
	);

	const reachSecondary = $derived(
		availableTonsInput != null
			? `${availableTonsInput.toLocaleString()} ${UNIT_LABELS.tons[unitsStore.system]} available`
			: null
	);
	const targetSecondary = $derived(
		targetDistanceInput != null
			? `For ${Math.round(targetDistanceInput).toLocaleString()} ${UNIT_LABELS.ft[unitsStore.system]}`
			: null
	);

	function clearInputs() {
		tonsPlacedInput = null;
		distancePavedInput = null;
		availableTonsInput = null;
		targetDistanceInput = null;
		logDraft.clearFor(TOOL_ID);
	}

	$effect(() => {
		if (actualRate != null && tonsPlaced != null && distancePavedFt != null) {
			logDraft.set({
				toolId: TOOL_ID,
				entryType: 'paving',
				summary: `${tonsPlaced.toFixed(1)} t over ${Math.round(distancePavedFt).toLocaleString()} ft @ ${Math.round(actualRate)} lbs/SY`,
				fields: {
					tons_placed: tonsPlaced,
					distance_ft: Math.round(distancePavedFt),
					spread_rate_actual: Math.round(actualRate),
					notes: 'Production check'
				}
			});
		} else if (reachableFt != null && availableTons != null) {
			logDraft.set({
				toolId: TOOL_ID,
				entryType: 'paving',
				summary: `${availableTons.toFixed(1)} t reaches ${Math.round(reachableFt).toLocaleString()} ft`,
				fields: {
					distance_ft: Math.round(reachableFt),
					notes: 'Production check reach estimate'
				}
			});
		} else {
			logDraft.clearFor(TOOL_ID);
		}
	});

	onDestroy(() => logDraft.clearFor(TOOL_ID));
</script>

<CalcCard
	title="Production Check"
	hideTitle
	purpose="Active-job field math for actual spread rate and material-based reach."
>
	<section class="job-strip" aria-label="Active job context">
		<div class="job-fact">
			<span>Width</span>
			<strong>{widthFt}</strong>
			<small>ft</small>
			<SourceTag source={calcContext.road_width.source} updatedAt={calcContext.road_width.updatedAt} label="Width" />
		</div>
		<div class="job-fact">
			<span>Lift</span>
			<strong>{thicknessIn}</strong>
			<small>in</small>
			<SourceTag source={calcContext.lift_thickness.source} updatedAt={calcContext.lift_thickness.updatedAt} label="Lift" />
		</div>
		<div class="job-fact accent">
			<span>Target</span>
			<strong>{displayTargetRate != null ? Math.round(displayTargetRate) : '-'}</strong>
			<small>{UNIT_LABELS.lbsSy[unitsStore.system]}</small>
			<SourceTag source={calcContext.course_type.source} updatedAt={calcContext.course_type.updatedAt} label="Course" />
		</div>
	</section>

	<section class="calc-section" aria-labelledby="actual-spread-heading">
		<div class="section-head">
			<h3 id="actual-spread-heading">Actual Spread</h3>
			{#if variance != null}
				<span class="variance" class:over={variance > 0} class:under={variance < 0}>
					{variance > 0 ? '+' : ''}{Math.round(variance)} lbs/SY
				</span>
			{/if}
		</div>
		<div class="field-grid">
			<NumberField
				label="Tons placed"
				unit={UNIT_LABELS.tons[unitsStore.system]}
				step={0.1}
				min={0}
				bind:value={tonsPlacedInput}
			/>
			<NumberField
				label="Distance paved"
				unit={UNIT_LABELS.ft[unitsStore.system]}
				min={0}
				bind:value={distancePavedInput}
			/>
		</div>
		<ResultStat
			value={displayActualRate != null ? Math.round(displayActualRate) : null}
			unit={UNIT_LABELS.lbsSy[unitsStore.system]}
			badge={specBadge}
		/>
	</section>

	<section class="calc-section" aria-labelledby="reach-heading">
		<div class="section-head">
			<h3 id="reach-heading">End-of-Day Reach</h3>
		</div>
		<NumberField
			label="Available tons"
			unit={UNIT_LABELS.tons[unitsStore.system]}
			step={0.1}
			min={0}
			bind:value={availableTonsInput}
			hint="Remaining ordered tons, trucks, or material on hand"
		/>
		<ResultStat
			value={displayReachable != null ? Math.round(displayReachable).toLocaleString() : null}
			unit={`${UNIT_LABELS.ft[unitsStore.system]} reachable`}
			secondary={reachSecondary}
		/>

		<div class="divider"></div>

		<NumberField
			label="Target distance"
			unit={UNIT_LABELS.ft[unitsStore.system]}
			min={0}
			bind:value={targetDistanceInput}
		/>
		<ResultStat
			value={displayTonsNeeded != null ? Math.round(displayTonsNeeded).toLocaleString() : null}
			unit={`${UNIT_LABELS.tons[unitsStore.system]} needed`}
			secondary={targetSecondary}
		/>
	</section>

	<div class="actions">
		<div class="draft-state" class:ready={logDraft.current?.toolId === TOOL_ID}>
			<span class="dot"></span>
			<span>{logDraft.current?.toolId === TOOL_ID ? 'Log draft ready' : 'No log draft'}</span>
		</div>
		<button type="button" class="btn-clear" onclick={clearInputs}>Clear</button>
	</div>

	<ShowWork stepCount={4}>
		{#if actualRate != null && tonsPlaced != null && distancePavedFt != null && targetRate != null}
			<p>Actual spread rate:</p>
			<code>rate = {tonsPlaced.toFixed(2)} × 2000 ÷ ({Math.round(distancePavedFt)} × {widthFt} ÷ 9) = {Math.round(actualRate)} lbs/SY</code>
			<p>Target rate:</p>
			<code>target = {thicknessIn} × {constant('CONST.THICK_MULT')} = {Math.round(targetRate)} lbs/SY</code>
		{:else}
			<code>actual rate = tons × 2000 ÷ (distance × width ÷ 9)</code>
		{/if}
		{#if reachableFt != null && availableTons != null && targetRate != null}
			<p>Reach from available material:</p>
			<code>feet = {availableTons.toFixed(2)} × 2000 × 9 ÷ ({widthFt} × {Math.round(targetRate)}) = {Math.round(reachableFt)} ft</code>
		{:else}
			<code>reachable feet = available tons × 2000 × 9 ÷ (width × target rate)</code>
		{/if}
		{#if tonsNeeded != null && targetDistanceFt != null && targetRate != null}
			<p>Tons needed for target distance:</p>
			<code>tons = {Math.round(targetDistanceFt)} × {widthFt} × {Math.round(targetRate)} ÷ (2000 × 9) = {tonsNeeded.toFixed(1)} tons</code>
		{/if}
	</ShowWork>
</CalcCard>

<style>
	.job-strip {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-2);
		margin-bottom: var(--sp-4);
	}

	.job-fact {
		min-width: 0;
		padding: var(--sp-3);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 8px;
		display: grid;
		gap: 3px;
		align-content: start;
	}

	.job-fact span,
	.job-fact small {
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: 1.2;
	}

	.job-fact strong {
		color: var(--text);
		font-size: var(--fs-xl);
		line-height: 1;
	}

	.job-fact.accent strong {
		color: var(--accent);
	}

	.calc-section {
		padding-top: var(--sp-4);
		margin-top: var(--sp-4);
		border-top: 1px solid var(--border);
	}

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.section-head h3 {
		margin: 0;
		font-size: var(--fs-md);
		line-height: 1.2;
	}

	.variance {
		flex-shrink: 0;
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
	}

	.variance.over,
	.variance.under {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
		background: color-mix(in srgb, var(--accent) 10%, transparent);
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-3);
	}

	.divider {
		height: 1px;
		background: var(--border);
		margin: var(--sp-4) 0;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
		padding-top: var(--sp-4);
		border-top: 1px solid var(--border);
	}

	.draft-state {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	.draft-state .dot {
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--border);
	}

	.draft-state.ready {
		color: var(--accent);
	}

	.draft-state.ready .dot {
		background: var(--accent);
	}

	@media (max-width: 520px) {
		.job-strip,
		.field-grid {
			grid-template-columns: 1fr;
		}

		.actions {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
