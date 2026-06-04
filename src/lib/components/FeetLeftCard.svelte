<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import SourceTag from './SourceTag.svelte';
	import DotTable from './DotTable.svelte';
	import RoadProgressBar from './RoadProgressBar.svelte';
	import Tooltip from './ui/Tooltip.svelte';
	import CalculationStep from './ui/CalculationStep.svelte';
	import CalcProofButton from './CalcProofButton.svelte';
	import type { CalcProofData } from '$lib/utils/pdf-export';
	import { job } from '$lib/stores/job.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { feetFromOrderedMinusPlaced, spreadRateFromThickness } from '$lib/config/formulas';
	import { constantMeta } from '$lib/config';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { calcHistory } from '$lib/stores/calcHistory.svelte';
	import { onDestroy } from 'svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import {
		UNIT_LABELS,
		toMeters,
		fromMeters,
		toMetricTonnes,
		fromMetricTonnes
	} from '$lib/utils/unitConvert';

	let orderedInput = $state<number | null>(null);
	let placedInput = $state<number | null>(null);
	let totalJobInput = $state<number | null>(null);

	// Shared inputs from calc context (manual override → job-site → job).
	const widthFt = $derived(calcContext.road_width.value);
	const thicknessIn = $derived(calcContext.lift_thickness.value);

	// Convert inputs to imperial for formula
	const ordered = $derived(
		orderedInput != null && unitsStore.system === 'metric'
			? fromMetricTonnes(orderedInput)
			: orderedInput
	);
	const placed = $derived(
		placedInput != null && unitsStore.system === 'metric'
			? fromMetricTonnes(placedInput)
			: placedInput
	);
	const totalJobFeet = $derived(
		totalJobInput != null && unitsStore.system === 'metric'
			? fromMeters(totalJobInput)
			: totalJobInput
	);

	function clearInputs() {
		orderedInput = null;
		placedInput = null;
		totalJobInput = null;
		logDraft.clearFor('feet-left');
	}

	const rate = $derived(thicknessIn > 0 ? spreadRateFromThickness(thicknessIn) : 0);

	const feet = $derived.by(() => {
		if (rate <= 0 || widthFt <= 0 || ordered == null || placed == null) return null;
		return feetFromOrderedMinusPlaced({
			tonsOrdered: ordered,
			tonsPlaced: placed,
			widthFt: widthFt,
			rateLbsSy: rate
		});
	});

	// Calculate completed distance for progress bar
	const completedFeet = $derived.by(() => {
		if (totalJobFeet == null || feet == null) return 0;
		return Math.max(0, totalJobFeet - feet);
	});

	$effect(() => {
		if (placed != null && placed > 0) {
			logDraft.set({
				toolId: 'feet-left',
				entryType: 'paving',
				summary: `${placed} t placed so far today`,
				fields: { tons_placed: placed }
			});
		} else {
			logDraft.clearFor('feet-left');
		}
	});
	onDestroy(() => logDraft.clearFor('feet-left'));

	// ── History recording ─────────────────────────────────────────────────
	let _lastFeetRecorded = $state<string | null>(null);
	$effect(() => {
		if (feet == null) return;
		const resultStr = `${Math.round(feet).toLocaleString()} ft remaining`;
		if (resultStr === _lastFeetRecorded) return;
		_lastFeetRecorded = resultStr;
		calcHistory.add({
			toolId: 'feet-left',
			toolLabel: 'Feet Left',
			result: resultStr,
			summary: `${orderedInput ?? '?'} tons ordered, ${placedInput ?? '?'} placed`
		});
	});

	const displayFeet = $derived(
		feet != null && unitsStore.system === 'metric' ? toMeters(feet) : feet
	);

	const thickMultMeta = constantMeta('CONST.THICK_MULT');

	function getProofData(): CalcProofData | null {
		if (ordered == null || placed == null || !widthFt || !rate || feet == null) {
			return null;
		}

		const remaining = ordered - placed;
		const remainingLbs = remaining * 2000;

		return {
			title: 'Feet Left Today',
			inputs: {
				'Tons ordered': `${ordered.toFixed(2)} tons`,
				'Tons placed': `${placed.toFixed(2)} tons`,
				'Mat width': `${widthFt.toFixed(0)} ft`,
				'Target thickness': `${thicknessIn.toFixed(2)}"`
			},
			steps: [
				{
					step: 1,
					label: 'Spread rate',
					formula: `${thicknessIn.toFixed(2)} × 110`,
					result: `${rate.toFixed(0)} lbs/SY`
				},
				{
					step: 2,
					label: 'Remaining tons',
					formula: `${ordered.toFixed(2)} − ${placed.toFixed(2)}`,
					result: `${remaining.toFixed(2)} tons`
				},
				{
					step: 3,
					label: 'Remaining lbs',
					formula: `${remaining.toFixed(2)} × 2000`,
					result: `${remainingLbs.toFixed(0)} lbs`
				},
				{
					step: 4,
					label: 'Feet left',
					formula: `${remainingLbs.toFixed(0)} × 9 ÷ (${widthFt.toFixed(0)} × ${rate.toFixed(0)})`,
					result: `${feet.toFixed(0)} ft`
				}
			],
			result: {
				value: feet.toFixed(0),
				unit: 'feet'
			},
			notes: `Spread rate calculated from thickness × 110 rule.`,
			jobContext: {
				width: widthFt,
				thickness: thicknessIn,
				rate: Math.round(rate)
			}
		};
	}
</script>

<CalcCard
	title="Feet Left Today"
	hideTitle
	purpose="How many more feet you can pave with what is left, using the shared width and target rate."
>
	<NumberField
		label="Tons ordered today"
		unit={UNIT_LABELS.tons[unitsStore.system]}
		bind:value={orderedInput}
		hint="Use total from plant tickets for accuracy"
	/>
	<NumberField
		label="Tons placed so far"
		unit={UNIT_LABELS.tons[unitsStore.system]}
		bind:value={placedInput}
	/>

	<NumberField
		label="Total length (optional)"
		unit={UNIT_LABELS.ft[unitsStore.system]}
		bind:value={totalJobInput}
		hint="For progress tracking"
	/>

	<div class="result-with-tooltip">
		<ResultStat
			value={displayFeet != null ? Math.round(displayFeet).toLocaleString() : null}
			unit={`${UNIT_LABELS.ft[unitsStore.system]} left today`}
		/>
		<div class="context-tags">
			<SourceTag source={calcContext.road_width.source} updatedAt={calcContext.road_width.updatedAt} label="Width" />
			<SourceTag source={calcContext.lift_thickness.source} updatedAt={calcContext.lift_thickness.updatedAt} label="Thickness" />
			<span class="context-text">At {calcContext.road_width.value} ft wide, {Math.round(rate)} lbs/SY</span>
		</div>
	</div>

	{#if totalJobFeet != null && feet != null && totalJobFeet > 0}
		<RoadProgressBar currentFeet={completedFeet} totalFeet={totalJobFeet} />
	{/if}

	<ShowWork stepCount={4}>
		{#if ordered != null && placed != null && widthFt && rate && feet != null}
			{@const remaining = ordered - placed}
			{@const remainingLbs = remaining * 2000}

			<CalculationStep
				step={1}
				label="Spread rate"
				formula="{thicknessIn.toFixed(2)} × 110"
				result="{rate.toFixed(0)} lbs/SY"
			/>
			<CalculationStep
				step={2}
				label="Remaining tons"
				formula="{ordered.toFixed(2)} − {placed.toFixed(2)}"
				result="{remaining.toFixed(2)} tons"
			/>
			<CalculationStep
				step={3}
				label="Remaining lbs"
				formula="{remaining.toFixed(2)} × 2000"
				result="{remainingLbs.toFixed(0)} lbs"
			/>
			<CalculationStep
				step={4}
				label="Feet left"
				formula="{remainingLbs.toFixed(0)} × 9 ÷ ({widthFt.toFixed(0)} × {rate.toFixed(0)})"
				result="{feet.toFixed(0)} ft"
			/>

			<CalcProofButton title="Feet Left Today" getData={getProofData} />
		{:else}
			<code>feet = (ordered − placed) × 2000 × 9 ÷ (width × rate)</code>
			<p>Enter values above to see step-by-step calculation.</p>
		{/if}

		<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
			<p>Rate comes from THICK_MULT (§400 rule-of-thumb: <SourceBadge status={thickMultMeta.status} tier={thickMultMeta.tier} /> = {thickMultMeta.value} lbs/SY per inch). Actual rate shown from job settings.</p>
			<DotTable tableId="table-12" />
		</div>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.context-tags {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
		margin-top: var(--sp-2);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
	.context-text {
		color: var(--text-muted);
	}
</style>
