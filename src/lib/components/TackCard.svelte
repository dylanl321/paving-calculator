<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import { tack, tackMid } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { tackGallons } from '$lib/config/formulas';

	let lengthFt = $state<number | null>(null);

	const selected = $derived(
		tack.field.find((t) => t.id === job.tackApplication) ?? tack.field[0]
	);

	const area = $derived(lengthFt && job.widthFt ? (lengthFt * job.widthFt) / 9 : null);

	const gallons = $derived.by(() => {
		if (!area) return null;
		return {
			min: tackGallons(lengthFt!, job.widthFt, selected.min),
			mid: tackGallons(lengthFt!, job.widthFt, tackMid(selected)),
			max: tackGallons(lengthFt!, job.widthFt, selected.max)
		};
	});
</script>

<CalcCard
	title="Tack Rate"
	purpose="Gallons of tack to shoot for an area. Shows the safe min–max window for the chosen application, with the mid-rate as the suggested amount."
>
	<NumberField label="Length to shoot" unit="ft" bind:value={lengthFt} />

	<div class="apps">
		<span class="apps-label">Application</span>
		<div class="chips">
			{#each tack.field as t (t.id)}
				<button
					class="chip"
					class:active={job.tackApplication === t.id}
					onclick={() => (job.tackApplication = t.id)}
				>
					{t.label}
				</button>
			{/each}
		</div>
	</div>

	<ResultStat
		value={gallons != null ? Math.round(gallons.mid).toLocaleString() : null}
		unit="gal (suggested mid-rate)"
		secondary={gallons != null
			? `Range: ${Math.round(gallons.min)}–${Math.round(gallons.max)} gal`
			: null}
	/>

	<ShowWork>
		<code>gallons = (length × width ÷ 9) × shot rate (gal/SY)</code>
		<p>{selected.label}: {selected.min}–{selected.max} gal/SY.</p>
		<div class="src-row">Tack range source: <SourceBadge status={selected.status} tier={selected.tier} /></div>
	</ShowWork>
</CalcCard>

<style>
	.apps {
		margin-bottom: 16px;
	}
	.apps-label {
		display: block;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 8px;
	}
	.apps .chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
</style>
