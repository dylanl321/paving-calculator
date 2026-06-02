<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import RoadProgressBar from './RoadProgressBar.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { feetFromOrderedMinusPlaced, spreadRateFromThickness } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	let ordered = $state<number | null>(null);
	let placed = $state<number | null>(null);
	let totalJobFeet = $state<number | null>(null);

	function clearInputs() {
		ordered = null;
		placed = null;
		totalJobFeet = null;
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
</script>

<CalcCard
	title="Feet Left Today"
	hideTitle
	purpose="How many more feet you can pave with what is left, at the job width and target rate set above."
>
	<NumberField
		label="Tons ordered today"
		unit="tons"
		bind:value={ordered}
		hint="Include asphalt still in the plant silo (not the paver hopper)"
	/>
	<NumberField label="Tons placed so far" unit="tons" bind:value={placed} />

	<NumberField
		label="Total job length (optional)"
		unit="ft"
		bind:value={totalJobFeet}
		hint="For progress tracking"
	/>

	<ResultStat
		value={feet != null ? Math.round(feet).toLocaleString() : null}
		unit="feet left today"
		secondary={`At ${job.widthFt} ft wide, ${Math.round(rate)} lbs/SY`}
	/>

	{#if totalJobFeet != null && feet != null && totalJobFeet > 0}
		<RoadProgressBar currentFeet={completedFeet} totalFeet={totalJobFeet} />
	{/if}

	<ShowWork>
		<p>Tons → feet conversion:</p>
		<code>feet = (ordered − placed) × 2000 × 9 ÷ (width × rate)</code>
		<p>Ordered minus placed gives remaining tons available today.</p>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.btn-clear {
		width: 100%;
		min-height: 3rem;
		padding: 0.75rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-clear:hover {
		background: var(--surface-alt);
		color: var(--text);
	}
</style>
