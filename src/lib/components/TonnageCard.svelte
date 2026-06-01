<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { spreadRateFromThickness, tonnageToOrder } from '$lib/config/formulas';

	let lengthFt = $state<number | null>(null);

	const rate = $derived(job.thicknessIn > 0 ? spreadRateFromThickness(job.thicknessIn) : 0);

	const waste = [0, 5, 10];

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
</script>

<CalcCard
	title="Tonnage to Order"
	purpose="How much asphalt to order for a job at the job width and target thickness."
>
	<NumberField label="Length of the job" unit="ft" bind:value={lengthFt} />

	<div class="waste">
		<span class="waste-label">Waste allowance</span>
		<div class="chips">
			{#each waste as w (w)}
				<button class="chip" class:active={job.wastePct === w} onclick={() => (job.wastePct = w)}>
					{w === 0 ? 'None' : `+${w}%`}
				</button>
			{/each}
		</div>
	</div>

	<ResultStat
		value={tons != null ? Math.round(tons).toLocaleString() : null}
		unit="tons to order"
		secondary={`At ${job.widthFt} ft wide, ${job.thicknessIn}" (${Math.round(rate)} lbs/SY)`}
	/>

	<ShowWork>
		<code>tons = (length × width ÷ 9 × rate) ÷ 2000 × (1 + waste%)</code>
	</ShowWork>
</CalcCard>

<style>
	.waste {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
	}
	.waste-label {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.waste .chips {
		display: flex;
		gap: 6px;
	}
</style>
