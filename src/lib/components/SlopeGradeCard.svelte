<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { slopeGrade } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	let riseFt = $state<number | null>(null);
	let runFt = $state<number | null>(null);
	let riseUnit = $state<'ft' | 'in'>('ft');

	function clearInputs() {
		riseFt = null;
		runFt = null;
		riseUnit = 'ft';
		logDraft.clearFor('slope-grade');
	}

	const riseInFeet = $derived(
		riseFt != null ? (riseUnit === 'in' ? riseFt / 12 : riseFt) : null
	);

	const result = $derived.by(() => {
		if (riseInFeet == null || runFt == null || runFt <= 0) return null;
		return slopeGrade(riseInFeet, runFt);
	});

	$effect(() => {
		if (result) {
			logDraft.set({
				toolId: 'slope-grade',
				entryType: 'note',
				summary: `Grade ${result.gradePct.toFixed(2)}% (1:${result.ratio.toFixed(1)})`,
				fields: {
					notes: `Slope/grade: ${result.gradePct.toFixed(2)}% — 1:${result.ratio.toFixed(1)} ratio, ${result.angleDeg.toFixed(1)}°`
				}
			});
		} else {
			logDraft.clearFor('slope-grade');
		}
	});
	onDestroy(() => logDraft.clearFor('slope-grade'));
</script>

<CalcCard
	title="Slope / Grade"
	hideTitle
	purpose="Calculate slope grade percentage, ratio, and angle for drainage or grading work."
>
	<div class="rise-input-group">
		<NumberField label="Rise" unit={riseUnit} bind:value={riseFt} step={riseUnit === 'in' ? 1 : 0.1} />
		<div class="unit-toggle">
			<button class:active={riseUnit === 'ft'} onclick={() => (riseUnit = 'ft')}>ft</button>
			<button class:active={riseUnit === 'in'} onclick={() => (riseUnit = 'in')}>in</button>
		</div>
	</div>

	<NumberField label="Run" unit="ft" bind:value={runFt} step={0.1} />

	{#if result}
		<div class="results-grid">
			<div class="result-item">
				<div class="result-label">Grade %</div>
				<div class="result-value">{result.gradePct.toFixed(2)}%</div>
			</div>
			<div class="result-item">
				<div class="result-label">Slope Ratio</div>
				<div class="result-value">1:{result.ratio.toFixed(1)}</div>
			</div>
			<div class="result-item">
				<div class="result-label">Angle</div>
				<div class="result-value">{result.angleDeg.toFixed(1)}°</div>
			</div>
		</div>
	{:else}
		<ResultStat value={null} unit="grade %" />
	{/if}

	<ShowWork>
		<p>Slope/grade calculation:</p>
		<code
			>Grade % = (Rise / Run) × 100 = ({riseInFeet ?? '—'} / {runFt ?? '—'}) × 100 = {result?.gradePct.toFixed(2) ?? '—'}%</code
		>
		<code
			>Slope Ratio = 1 : (Run / Rise) = 1 : {result?.ratio.toFixed(1) ?? '—'}</code
		>
		<code
			>Angle (degrees) = atan(Rise / Run) × (180 / π) = {result?.angleDeg.toFixed(1) ?? '—'}°</code
		>
		<p><strong>Common references:</strong></p>
		<ul>
			<li>2% cross-slope for drainage (1:50 ratio)</li>
			<li>1-3% longitudinal for highways</li>
		</ul>
		<p class="src-note">2% cross-slope per GDOT Design Policy Manual §3.2; 1–3% longitudinal per AASHTO "Green Book" Table 3-1.</p>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.rise-input-group {
		display: flex;
		align-items: flex-end;
		gap: var(--sp-2);
	}
	.rise-input-group :global(.field) {
		flex: 1;
	}
	.unit-toggle {
		display: flex;
		gap: var(--sp-1);
		padding-bottom: var(--sp-2);
	}
	.unit-toggle button {
		padding: var(--sp-2) var(--sp-4);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: var(--fs-sm);
		cursor: pointer;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.unit-toggle button.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--fw-bold);
	}
	:global(.work-body ul) {
		margin: var(--sp-2) 0;
		padding-left: var(--sp-5);
	}
	:global(.work-body li) {
		margin: var(--sp-1) 0;
	}
</style>
