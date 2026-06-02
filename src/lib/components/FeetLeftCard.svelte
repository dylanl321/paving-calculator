<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import DotTable from './DotTable.svelte';
	import RoadProgressBar from './RoadProgressBar.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { feetFromOrderedMinusPlaced, spreadRateFromThickness } from '$lib/config/formulas';
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

	let orderedInput = $state<number | null>(null);
	let placedInput = $state<number | null>(null);
	let totalJobInput = $state<number | null>(null);

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

	const rate = $derived(job.thicknessIn > 0 ? spreadRateFromThickness(job.thicknessIn) : 0);

	const feet = $derived.by(() => {
		if (rate <= 0 || job.widthFt <= 0 || ordered == null || placed == null) return null;
		return feetFromOrderedMinusPlaced({
			tonsOrdered: ordered,
			tonsPlaced: placed,
			widthFt: job.widthFt,
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

	const displayFeet = $derived(
		feet != null && unitsStore.system === 'metric' ? toMeters(feet) : feet
	);

	const thickMultMeta = constantMeta('CONST.THICK_MULT');
</script>

<CalcCard
	title="Feet Left Today"
	hideTitle
	purpose="How many more feet you can pave with what is left, at the job width and target rate set above."
>
	<NumberField
		label="Tons ordered today"
		unit={UNIT_LABELS.tons[unitsStore.system]}
		bind:value={orderedInput}
		hint="Include asphalt still in the plant silo (not the paver hopper)"
	/>
	<NumberField
		label="Tons placed so far"
		unit={UNIT_LABELS.tons[unitsStore.system]}
		bind:value={placedInput}
	/>

	<NumberField
		label="Total job length (optional)"
		unit={UNIT_LABELS.ft[unitsStore.system]}
		bind:value={totalJobInput}
		hint="For progress tracking"
	/>

	<ResultStat
		value={displayFeet != null ? Math.round(displayFeet).toLocaleString() : null}
		unit={`${UNIT_LABELS.ft[unitsStore.system]} left today`}
		secondary={`At ${job.widthFt} ft wide, ${Math.round(rate)} lbs/SY`}
	/>

	{#if totalJobFeet != null && feet != null && totalJobFeet > 0}
		<RoadProgressBar currentFeet={completedFeet} totalFeet={totalJobFeet} />
	{/if}

	<ShowWork>
		<p>Tons → feet conversion:</p>
		<code>feet = (ordered − placed) × 2000 × 9 ÷ (width × rate)</code>
		<p>Ordered minus placed gives remaining tons available today.</p>
		<p>Rate comes from THICK_MULT (§400 rule-of-thumb: <SourceBadge status={thickMultMeta.status} tier={thickMultMeta.tier} /> = {thickMultMeta.value} lbs/SY per inch). Actual rate shown from job settings.</p>
		<DotTable tableId="table-12" />
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>
