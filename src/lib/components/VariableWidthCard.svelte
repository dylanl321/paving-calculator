<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { variableWidthArea, spreadRateFromThickness } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { UNIT_LABELS, fromMeters, toMetricTonnes } from '$lib/utils/unitConvert';

	let lengthInput = $state<number | null>(null);
	let startWidthInput = $state<number | null>(null);
	let endWidthInput = $state<number | null>(null);

	function toFt(v: number | null): number | null {
		if (v == null) return null;
		return unitsStore.system === 'metric' ? fromMeters(v) : v;
	}

	const widthFt = $derived(calcContext.road_width.value);
	const thicknessIn = $derived(calcContext.lift_thickness.value);

	const lengthFt = $derived(toFt(lengthInput));
	const startWidthFt = $derived(toFt(startWidthInput) ?? widthFt);
	const endWidthFt = $derived(toFt(endWidthInput) ?? widthFt);

	const rate = $derived(thicknessIn > 0 ? spreadRateFromThickness(thicknessIn) : 0);

	const result = $derived.by(() => {
		if (lengthFt == null || lengthFt <= 0 || startWidthFt <= 0 || endWidthFt <= 0 || rate <= 0)
			return null;
		return variableWidthArea({
			lengthFt,
			startWidthFt,
			endWidthFt,
			rateLbsSy: rate,
			wastePct: job.wastePct
		});
	});

	const displayTons = $derived(
		result != null && unitsStore.system === 'metric' ? toMetricTonnes(result.tons) : result?.tons
	);

	function clearInputs() {
		lengthInput = null;
		startWidthInput = null;
		endWidthInput = null;
		logDraft.clearFor('variable-width');
	}

	$effect(() => {
		if (result && displayTons != null) {
			logDraft.set({
				toolId: 'variable-width',
				entryType: 'paving',
				summary: `Variable-width: ${result.areaSy.toFixed(0)} SY — ${Math.round(displayTons)} ${UNIT_LABELS.tons[unitsStore.system]}`,
				fields: {
					tons_placed: Math.round(result.tons),
					notes: `Variable-width flare: ${result.areaSy.toFixed(0)} SY (avg width ${result.avgWidthFt.toFixed(1)} ft)`
				}
			});
		} else {
			logDraft.clearFor('variable-width');
		}
	});
	onDestroy(() => logDraft.clearFor('variable-width'));
</script>

<CalcCard
	title="Variable-Width Calculator"
	hideTitle
	purpose="Trapezoidal section for turn lane flares: enter the start width, end width, and length to get area and tonnage."
>
	<NumberField
		label="Length of flare"
		unit={UNIT_LABELS.ft[unitsStore.system]}
		bind:value={lengthInput}
		step={1}
	/>

	<div class="width-row">
		<NumberField
			label="Start width (narrow end)"
			unit={UNIT_LABELS.ft[unitsStore.system]}
			bind:value={startWidthInput}
			hint="Blank = job width ({widthFt} ft)"
			step={0.5}
		/>
		<NumberField
			label="End width (wide end)"
			unit={UNIT_LABELS.ft[unitsStore.system]}
			bind:value={endWidthInput}
			hint="Blank = job width ({widthFt} ft)"
			step={0.5}
		/>
	</div>

	{#if result && displayTons != null}
		<div class="results-grid">
			<div class="result-item accent">
				<div class="result-label">Total Area</div>
				<div class="result-value">{result.areaSy.toFixed(1)} SY</div>
			</div>
			<div class="result-item accent">
				<div class="result-label">Tons to Order</div>
				<div class="result-value">{Math.round(displayTons)} {UNIT_LABELS.tons[unitsStore.system]}</div>
			</div>
			<div class="result-item">
				<div class="result-label">Avg Width</div>
				<div class="result-value">
					{result.avgWidthFt.toFixed(1)}
					{UNIT_LABELS.ft[unitsStore.system]}
				</div>
			</div>
			<div class="result-item">
				<div class="result-label">Spread Rate</div>
				<div class="result-value">{Math.round(rate)} lbs/SY</div>
			</div>
		</div>
	{:else}
		<ResultStat value={null} unit="SY" />
	{/if}

	<ShowWork>
		<p>Trapezoid formula for flares (turn lanes, tapers, gore areas):</p>
		<code>Avg Width = (Start Width + End Width) ÷ 2</code>
		<code>Area (SY) = Length × Avg Width ÷ 9</code>
		<code>Tons = Area × rate ÷ 2000 × (1 + waste%)</code>
		{#if result}
			<code>
				= {lengthFt} × ({startWidthFt} + {endWidthFt}) ÷ 2 ÷ 9 = {result.areaSy.toFixed(1)} SY
			</code>
		{/if}
		<p class="src-note">
			Trapezoid area per standard geometry; spread rate from GDOT §400 Table 12 (THICK_MULT ×
			thickness); no magic numbers.
		</p>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.width-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
		margin-top: var(--sp-1);
	}
	.results-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}
	.result-item {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--sp-3) var(--sp-4);
		text-align: center;
	}
	.result-item.accent {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface-alt));
	}
	.result-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-bottom: var(--sp-1);
	}
	.result-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}
	.result-item.accent .result-value {
		color: var(--accent);
	}
</style>
