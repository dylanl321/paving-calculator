<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import DotTable from './DotTable.svelte';
	import Tooltip from './ui/Tooltip.svelte';
	import CalculationStep from './ui/CalculationStep.svelte';
	import CalcProofButton from './CalcProofButton.svelte';
	import type { CalcProofData } from '$lib/utils/pdf-export';
	import { job } from '$lib/stores/job.svelte';
	import { spreadRateFromThickness, tonnageToOrder } from '$lib/config/formulas';
	import { constantMeta } from '$lib/config';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import {
		UNIT_LABELS,
		toMeters,
		fromMeters,
		toMetricTonnes,
		fromMetricTonnes
	} from '$lib/utils/unitConvert';

	let lengthInput = $state<number | null>(null);

	// Convert input to imperial for formula
	const lengthFt = $derived(
		lengthInput != null && unitsStore.system === 'metric'
			? fromMeters(lengthInput)
			: lengthInput
	);

	function clearInputs() {
		lengthInput = null;
		logDraft.clearFor('tonnage');
	}

	const rate = $derived(job.thicknessIn > 0 ? spreadRateFromThickness(job.thicknessIn) : 0);

	const tons = $derived(
		lengthFt && rate > 0 && job.widthFt > 0
			? tonnageToOrder({
					lengthFt,
					widthFt: job.widthFt,
					rateLbsSy: rate,
					wastePct: job.wastePct
				})
			: null
	);

	$effect(() => {
		if (tons != null && lengthFt) {
			logDraft.set({
				toolId: 'tonnage',
				entryType: 'paving',
				summary: `${Math.round(tons)} t ordered for ${lengthFt} ft`,
				fields: {
					tons_placed: Math.round(tons),
					distance_ft: lengthFt,
					notes: `Ordered (${job.wastePct}% waste)`
				}
			});
		} else {
			logDraft.clearFor('tonnage');
		}
	});
	onDestroy(() => logDraft.clearFor('tonnage'));

	const displayTons = $derived(
		tons != null && unitsStore.system === 'metric' ? toMetricTonnes(tons) : tons
	);

	const thickMultMeta = constantMeta('CONST.THICK_MULT');

	function getProofData(): CalcProofData | null {
		if (!lengthFt || !job.widthFt || !rate || tons == null) {
			return null;
		}

		const areaYards = (lengthFt * job.widthFt) / 9;
		const baseTons = (areaYards * rate) / 2000;
		const wasteFactor = 1 + (job.wastePct / 100);

		return {
			title: 'Tonnage to Order',
			inputs: {
				'Length of job': `${lengthFt.toFixed(0)} ft`,
				'Mat width': `${job.widthFt.toFixed(0)} ft`,
				'Target thickness': `${job.thicknessIn.toFixed(2)}"`
			},
			steps: [
				{
					step: 1,
					label: 'Area in square yards',
					formula: `${lengthFt.toFixed(0)} × ${job.widthFt.toFixed(0)} ÷ 9`,
					result: `${areaYards.toFixed(2)} SY`
				},
				{
					step: 2,
					label: 'Spread rate',
					formula: `${job.thicknessIn.toFixed(2)} × 110`,
					result: `${rate.toFixed(0)} lbs/SY`
				},
				{
					step: 3,
					label: 'Base tons',
					formula: `${areaYards.toFixed(2)} × ${rate.toFixed(0)} ÷ 2000`,
					result: `${baseTons.toFixed(2)} tons`
				},
				{
					step: 4,
					label: 'With waste',
					formula: `${baseTons.toFixed(2)} × ${wasteFactor.toFixed(2)}`,
					result: `${tons.toFixed(2)} tons`
				}
			],
			result: {
				value: Math.round(tons).toString(),
				unit: 'tons'
			},
			notes: `Calculation includes ${job.wastePct}% waste allowance. Spread rate from thickness × 110 rule.`,
			jobContext: {
				width: job.widthFt,
				thickness: job.thicknessIn,
				rate: Math.round(rate),
				wastePct: job.wastePct
			}
		};
	}

	const inspectorStats = $derived.by(() => {
		if (tons == null || lengthFt == null) return undefined;

		return [
			{
				label: 'Tons to Order',
				value: Math.round(displayTons ?? tons).toLocaleString(),
				unit: UNIT_LABELS.tons[unitsStore.system],
				highlight: true,
				status: null as 'good' | 'warn' | 'bad' | null
			},
			{
				label: 'Length',
				value: (lengthInput ?? 0).toFixed(0),
				unit: UNIT_LABELS.ft[unitsStore.system],
				highlight: false,
				status: null as 'good' | 'warn' | 'bad' | null
			},
			{
				label: 'Width',
				value: job.widthFt.toFixed(1),
				unit: UNIT_LABELS.ft[unitsStore.system],
				highlight: false,
				status: null as 'good' | 'warn' | 'bad' | null
			},
			{
				label: 'Spread Rate',
				value: Math.round(rate).toString(),
				unit: 'lbs/SY',
				highlight: false,
				status: null as 'good' | 'warn' | 'bad' | null
			}
		];
	});
</script>

<CalcCard
	title="Tonnage to Order"
	hideTitle
	purpose="How much asphalt to order for a job at the job width and target thickness."
>
	<NumberField
		label="Length of the job"
		unit={UNIT_LABELS.ft[unitsStore.system]}
		bind:value={lengthInput}
	/>

	<ResultStat
		value={displayTons != null ? Math.round(displayTons).toLocaleString() : null}
		unit={`${UNIT_LABELS.tons[unitsStore.system]} to order`}
		secondary={`At ${job.widthFt} ft wide, ${job.thicknessIn}" (${Math.round(rate)} lbs/SY) · ${job.wastePct}% waste`}
	/>

	<ShowWork stepCount={4} inspectorStats={inspectorStats} inspectorTitle="Tonnage Order">
		{#if lengthFt && job.widthFt && rate && tons != null}
			{@const areaYards = (lengthFt * job.widthFt) / 9}
			{@const baseTons = (areaYards * rate) / 2000}
			{@const wasteFactor = 1 + (job.wastePct / 100)}

			<CalculationStep
				step={1}
				label="Area in square yards"
				formula="{lengthFt.toFixed(0)} × {job.widthFt.toFixed(0)} ÷ 9"
				result="{areaYards.toFixed(2)} SY"
			/>
			<CalculationStep
				step={2}
				label="Spread rate"
				formula="{job.thicknessIn.toFixed(2)} × 110"
				result="{rate.toFixed(0)} lbs/SY"
			/>
			<CalculationStep
				step={3}
				label="Base tons"
				formula="{areaYards.toFixed(2)} × {rate.toFixed(0)} ÷ 2000"
				result="{baseTons.toFixed(2)} tons"
			/>
			<CalculationStep
				step={4}
				label="With waste"
				formula="{baseTons.toFixed(2)} × {wasteFactor.toFixed(2)}"
				result="{tons.toFixed(2)} tons"
			/>

			<CalcProofButton title="Tonnage to Order" getData={getProofData} />
		{:else}
			<code>tons = (length × width ÷ 9 × rate) ÷ 2000 × (1 + waste%)</code>
			<p>Enter length above to see step-by-step calculation.</p>
		{/if}

		<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
			<p class="src-note">Spread rate from GDOT §400 Table 12 (§400.4.A.2.b); THICK_MULT constant: <SourceBadge status={thickMultMeta.status} tier={thickMultMeta.tier} /> ({thickMultMeta.value} lbs/SY/in from §400).</p>
			<DotTable tableId="table-12" />
		</div>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	/* Component uses global .btn-clear utility from app.css */
</style>
