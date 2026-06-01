<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { feetFromTons, spreadRateFromThickness } from '$lib/config/formulas';
	import { constant } from '$lib/config';

	let tonsInSilo = $state<number | null>(null);
	let tonsInTrucks = $state<number | null>(null);
	let desiredDistanceFt = $state<number | null>(null);

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
</script>

<CalcCard
	title="Distance Planner"
	purpose="Figure out how much asphalt to order to reach a specific stopping point. Shows how far available material will cover and how much is needed for a desired distance."
>
	<NumberField label="Tons in silo" unit="tons" bind:value={tonsInSilo} />
	<NumberField label="Tons in trucks headed to job" unit="tons" bind:value={tonsInTrucks} />

	<ResultStat
		value={availableDistance != null ? Math.round(availableDistance).toLocaleString() : null}
		unit="feet available"
		secondary={availableTons != null
			? `From ${availableTons.toLocaleString()} tons total`
			: null}
	/>

	<div class="divider"></div>

	<NumberField label="Desired distance to cover" unit="ft" bind:value={desiredDistanceFt} />

	<ResultStat
		value={tonnageNeeded != null ? Math.round(tonnageNeeded).toLocaleString() : null}
		unit="tons needed"
		secondary={desiredDistanceFt != null
			? `To cover ${Math.round(desiredDistanceFt).toLocaleString()} ft`
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
