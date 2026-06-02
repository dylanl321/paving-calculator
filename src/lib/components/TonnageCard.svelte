<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import DotTable from './DotTable.svelte';
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

	<ShowWork>
		<code>tons = (length × width ÷ 9 × rate) ÷ 2000 × (1 + waste%)</code>
		<p class="src-note">Spread rate from GDOT §400 Table 12 (§400.4.A.2.b); THICK_MULT constant: <SourceBadge status={thickMultMeta.status} tier={thickMultMeta.tier} /> ({thickMultMeta.value} lbs/SY/in from §400).</p>
		<DotTable tableId="table-12" />
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
