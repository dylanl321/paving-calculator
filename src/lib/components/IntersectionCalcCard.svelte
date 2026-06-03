<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ShowWork from './ShowWork.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { intersectionArea, spreadRateFromThickness } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { UNIT_LABELS, fromMeters, toMetricTonnes } from '$lib/utils/unitConvert';

	// Road 1 — uses the current job width as a default
	let road1LengthInput = $state<number | null>(null);
	let road1WidthInput = $state<number | null>(null);
	// Road 2
	let road2LengthInput = $state<number | null>(null);
	let road2WidthInput = $state<number | null>(null);

	function toFt(v: number | null): number | null {
		if (v == null) return null;
		return unitsStore.system === 'metric' ? fromMeters(v) : v;
	}

	const widthFt = $derived(calcContext.road_width.value);
	const thicknessIn = $derived(calcContext.lift_thickness.value);

	const road1LengthFt = $derived(toFt(road1LengthInput));
	const road1WidthFt = $derived(toFt(road1WidthInput) ?? widthFt);
	const road2LengthFt = $derived(toFt(road2LengthInput));
	const road2WidthFt = $derived(toFt(road2WidthInput) ?? widthFt);

	const rate = $derived(thicknessIn > 0 ? spreadRateFromThickness(thicknessIn) : 0);

	const result = $derived.by(() => {
		if (
			road1LengthFt == null ||
			road1LengthFt <= 0 ||
			road2LengthFt == null ||
			road2LengthFt <= 0 ||
			road1WidthFt <= 0 ||
			road2WidthFt <= 0 ||
			rate <= 0
		)
			return null;
		return intersectionArea({
			road1LengthFt,
			road1WidthFt,
			road2LengthFt,
			road2WidthFt,
			rateLbsSy: rate,
			wastePct: job.wastePct
		});
	});

	const displayTons = $derived(
		result != null && unitsStore.system === 'metric' ? toMetricTonnes(result.tons) : result?.tons
	);

	function clearInputs() {
		road1LengthInput = null;
		road1WidthInput = null;
		road2LengthInput = null;
		road2WidthInput = null;
		logDraft.clearFor('intersection-calc');
	}

	$effect(() => {
		if (result && displayTons != null) {
			logDraft.set({
				toolId: 'intersection-calc',
				entryType: 'paving',
				summary: `Intersection: ${result.totalSy.toFixed(0)} SY — ${Math.round(displayTons)} ${UNIT_LABELS.tons[unitsStore.system]}`,
				fields: {
					tons_placed: Math.round(result.tons),
					notes: `Intersection calc: ${result.totalSy.toFixed(0)} SY total (Road 1: ${result.road1Sy.toFixed(0)} SY, Road 2: ${result.road2Sy.toFixed(0)} SY, overlap: ${result.overlapSy.toFixed(1)} SY)`
				}
			});
		} else {
			logDraft.clearFor('intersection-calc');
		}
	});
	onDestroy(() => logDraft.clearFor('intersection-calc'));
</script>

<CalcCard
	title="Intersection Calculator"
	hideTitle
	purpose="Two crossing roads: enter each road's length and width to get the net paved area minus the overlap box."
>
	<div class="road-group">
		<div class="road-label">Road 1</div>
		<div class="road-fields">
			<NumberField
				label="Length"
				unit={UNIT_LABELS.ft[unitsStore.system]}
				bind:value={road1LengthInput}
				step={1}
			/>
			<NumberField
				label="Width"
				unit={UNIT_LABELS.ft[unitsStore.system]}
				bind:value={road1WidthInput}
				hint="Leave blank to use job width ({widthFt} ft)"
				step={0.5}
			/>
		</div>
	</div>

	<div class="road-group">
		<div class="road-label">Road 2</div>
		<div class="road-fields">
			<NumberField
				label="Length"
				unit={UNIT_LABELS.ft[unitsStore.system]}
				bind:value={road2LengthInput}
				step={1}
			/>
			<NumberField
				label="Width"
				unit={UNIT_LABELS.ft[unitsStore.system]}
				bind:value={road2WidthInput}
				hint="Leave blank to use job width ({widthFt} ft)"
				step={0.5}
			/>
		</div>
	</div>

	{#if result && displayTons != null}
		<div class="results-grid">
			<div class="result-item accent">
				<div class="result-label">Total Area</div>
				<div class="result-value">{result.totalSy.toFixed(1)} SY</div>
			</div>
			<div class="result-item accent">
				<div class="result-label">Tons to Order</div>
				<div class="result-value">{Math.round(displayTons)} {UNIT_LABELS.tons[unitsStore.system]}</div>
			</div>
			<div class="result-item">
				<div class="result-label">Road 1</div>
				<div class="result-value">{result.road1Sy.toFixed(1)} SY</div>
			</div>
			<div class="result-item">
				<div class="result-label">Road 2</div>
				<div class="result-value">{result.road2Sy.toFixed(1)} SY</div>
			</div>
			<div class="result-item muted">
				<div class="result-label">Overlap (deducted)</div>
				<div class="result-value">−{result.overlapSy.toFixed(1)} SY</div>
			</div>
		</div>
	{:else}
		<div class="placeholder-result">Enter both road lengths to see the result</div>
	{/if}

	<ShowWork>
		<p>Intersection paving area uses set theory: Road1 + Road2 minus the overlap box.</p>
		<code>Road 1 area = L1 × W1 ÷ 9</code>
		<code>Road 2 area = L2 × W2 ÷ 9</code>
		<code>Overlap box = W1 × W2 ÷ 9</code>
		<code>Total = Road1 + Road2 − Overlap</code>
		<code>Tons = Total SY × rate ÷ 2000 × (1 + waste%)</code>
		<p class="src-note">
			Area arithmetic per GDOT Construction Manual §400; no magic numbers — all constants from
			config.
		</p>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.road-group {
		margin-bottom: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}
	.road-label {
		font-size: var(--fs-sm);
		font-weight: var(--fw-bold);
		color: var(--accent);
		margin-bottom: var(--sp-2);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.road-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-3);
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
	.result-item.muted .result-value {
		color: var(--text-muted);
	}
	.result-item.muted {
		grid-column: span 2;
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
	.placeholder-result {
		margin-top: var(--sp-4);
		padding: var(--sp-4);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		text-align: center;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
</style>
