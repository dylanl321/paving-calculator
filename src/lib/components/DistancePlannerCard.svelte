<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { feetFromTons, spreadRateFromThickness } from '$lib/config/formulas';
	import { constant } from '$lib/config';
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

	let tonsInSiloInput = $state<number | null>(null);
	let tonsInTrucksInput = $state<number | null>(null);
	let desiredDistanceInput = $state<number | null>(null);

	// Convert inputs to imperial for formula
	const tonsInSilo = $derived(
		tonsInSiloInput != null && unitsStore.system === 'metric'
			? fromMetricTonnes(tonsInSiloInput)
			: tonsInSiloInput
	);
	const tonsInTrucks = $derived(
		tonsInTrucksInput != null && unitsStore.system === 'metric'
			? fromMetricTonnes(tonsInTrucksInput)
			: tonsInTrucksInput
	);
	const desiredDistanceFt = $derived(
		desiredDistanceInput != null && unitsStore.system === 'metric'
			? fromMeters(desiredDistanceInput)
			: desiredDistanceInput
	);

	const rate = $derived(job.thicknessIn > 0 ? spreadRateFromThickness(job.thicknessIn) : 0);

	const availableTons = $derived.by(() => {
		if (tonsInSilo == null || tonsInTrucks == null) return null;
		return tonsInSilo + tonsInTrucks;
	});

	const availableDistance = $derived.by(() => {
		if (availableTons == null || rate <= 0 || job.widthFt <= 0) return null;
		return feetFromTons(availableTons, job.widthFt, rate);
	});

	// Reverse formula: tons = feet × width × rate / (LB_PER_TON × SF_PER_SY)
	const tonnageNeeded = $derived.by(() => {
		if (desiredDistanceFt == null || rate <= 0 || job.widthFt <= 0) return null;
		return (desiredDistanceFt * job.widthFt * rate) / (constant('CONST.LB_PER_TON') * constant('CONST.SF_PER_SY'));
	});

	$effect(() => {
		if (desiredDistanceFt != null && tonnageNeeded != null && desiredDistanceFt > 0) {
			logDraft.set({
				toolId: 'distance-planner',
				entryType: 'paving',
				summary: `${Math.round(tonnageNeeded)} t to cover ${Math.round(desiredDistanceFt)} ft`,
				fields: {
					tons_placed: Math.round(tonnageNeeded),
					distance_ft: Math.round(desiredDistanceFt),
					notes: 'Planned from Distance Planner'
				}
			});
		} else {
			logDraft.clearFor('distance-planner');
		}
	});
	onDestroy(() => logDraft.clearFor('distance-planner'));

	const displayAvailableDistance = $derived(
		availableDistance != null && unitsStore.system === 'metric'
			? toMeters(availableDistance)
			: availableDistance
	);
	const displayAvailableTons = $derived(
		availableTons != null && unitsStore.system === 'metric'
			? toMetricTonnes(availableTons)
			: availableTons
	);
	const displayTonnageNeeded = $derived(
		tonnageNeeded != null && unitsStore.system === 'metric'
			? toMetricTonnes(tonnageNeeded)
			: tonnageNeeded
	);
	const displayDesiredDistance = $derived(
		desiredDistanceFt != null && unitsStore.system === 'metric'
			? toMeters(desiredDistanceFt)
			: desiredDistanceFt
	);
</script>

<CalcCard
	title="Distance Planner"
	hideTitle
	purpose="Figure out how much asphalt to order to reach a specific stopping point. Shows how far available material will cover and how much is needed for a desired distance."
>
	<NumberField
		label="Tons in silo"
		unit={UNIT_LABELS.tons[unitsStore.system]}
		bind:value={tonsInSiloInput}
	/>
	<NumberField
		label="Tons in trucks headed to job"
		unit={UNIT_LABELS.tons[unitsStore.system]}
		bind:value={tonsInTrucksInput}
	/>

	<ResultStat
		value={
			displayAvailableDistance != null
				? Math.round(displayAvailableDistance).toLocaleString()
				: null
		}
		unit={`${UNIT_LABELS.ft[unitsStore.system]} available`}
		secondary={displayAvailableTons != null
			? `From ${displayAvailableTons.toLocaleString()} ${UNIT_LABELS.tons[unitsStore.system]} total`
			: null}
	/>

	<div class="divider"></div>

	<NumberField
		label="Desired distance to cover"
		unit={UNIT_LABELS.ft[unitsStore.system]}
		bind:value={desiredDistanceInput}
	/>

	<ResultStat
		value={
			displayTonnageNeeded != null
				? Math.round(displayTonnageNeeded).toLocaleString()
				: null
		}
		unit={`${UNIT_LABELS.tons[unitsStore.system]} needed`}
		secondary={displayDesiredDistance != null
			? `To cover ${Math.round(displayDesiredDistance).toLocaleString()} ${UNIT_LABELS.ft[unitsStore.system]}`
			: null}
	/>

	<ShowWork>
		<p>Available distance uses the tons → feet formula:</p>
		<code>feet = (silo + trucks) × 2000 × 9 ÷ (width × rate)</code>
		<p>Tonnage needed reverses it:</p>
		<code>tons = desired feet × width × rate ÷ (2000 × 9)</code>
		<p>Uses job width ({job.widthFt} ft) and target rate ({Math.round(rate)} lbs/SY).</p>
	</ShowWork>
</CalcCard>

<style>
	.divider {
		height: 1px;
		background: var(--border);
		margin: 20px 0;
	}
</style>