<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { job } from '$lib/stores/job.svelte';
	import {
		feetFromLoads,
		feetFromOrderedMinusPlaced,
		spreadRateFromThickness
	} from '$lib/config/formulas';

	type Mode = 'loads' | 'ordered';
	let mode = $state<Mode>('loads');

	let loads = $state<number | null>(null);
	let ordered = $state<number | null>(null);
	let placed = $state<number | null>(null);

	const rate = $derived(job.thicknessIn > 0 ? spreadRateFromThickness(job.thicknessIn) : 0);

	const feet = $derived.by(() => {
		if (rate <= 0 || job.widthFt <= 0) return null;
		if (mode === 'loads') {
			if (loads == null) return null;
			return feetFromLoads({
				loads,
				tonsPerLoad: job.truckLoadTons,
				widthFt: job.widthFt,
				rateLbsSy: rate
			});
		}
		if (ordered == null || placed == null) return null;
		return feetFromOrderedMinusPlaced({
			tonsOrdered: ordered,
			tonsPlaced: placed,
			widthFt: job.widthFt,
			rateLbsSy: rate
		});
	});
</script>

<CalcCard
	title="Feet Left Today"
	purpose="How many more feet you can pave with what is left, at the job width and target rate set above."
>
	<div class="seg">
		<button class:active={mode === 'loads'} onclick={() => (mode = 'loads')}>Loads left</button>
		<button class:active={mode === 'ordered'} onclick={() => (mode = 'ordered')}>
			Ordered − used
		</button>
	</div>

	{#if mode === 'loads'}
		<NumberField
			label="Loads remaining"
			unit="loads"
			bind:value={loads}
			hint={`Each load = ${job.truckLoadTons} tons (set in Job Setup).`}
		/>
	{:else}
		<NumberField label="Tons ordered today" unit="tons" bind:value={ordered} />
		<NumberField label="Tons placed so far" unit="tons" bind:value={placed} />
	{/if}

	<ResultStat
		value={feet != null ? Math.round(feet).toLocaleString() : null}
		unit="feet left today"
		secondary={`At ${job.widthFt} ft wide, ${Math.round(rate)} lbs/SY`}
	/>

	<ShowWork>
		<p>Both modes use the same tons → feet conversion:</p>
		<code>feet = tons × 2000 × 9 ÷ (width × rate)</code>
		<p>
			Loads-left sets tons = loads × {job.truckLoadTons}. Ordered − used sets tons = ordered −
			placed.
		</p>
	</ShowWork>
</CalcCard>

<style>
	.seg {
		display: inline-flex;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 4px;
		margin-bottom: 16px;
	}
	.seg button {
		min-height: 42px;
		padding: 0 16px;
		border: 0;
		border-radius: 999px;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.9rem;
		cursor: pointer;
	}
	.seg button.active {
		background: var(--accent);
		color: var(--accent-text);
		font-weight: 700;
	}
</style>
