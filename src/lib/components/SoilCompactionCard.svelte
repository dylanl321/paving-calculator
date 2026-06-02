<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { soilCompaction } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	let wetWeightLbs = $state<number | null>(null);
	let dryWeightLbs = $state<number | null>(null);
	let volumeFt3 = $state<number | null>(null);
	let moisturePct = $state<number | null>(null);
	let proctorMaxDryPcf = $state<number | null>(null);

	function clearInputs() {
		wetWeightLbs = null;
		dryWeightLbs = null;
		volumeFt3 = null;
		moisturePct = null;
		proctorMaxDryPcf = null;
		logDraft.clearFor('soil-compaction');
	}

	const result = $derived.by(() => {
		if (
			wetWeightLbs == null ||
			dryWeightLbs == null ||
			volumeFt3 == null ||
			volumeFt3 <= 0 ||
			moisturePct == null ||
			proctorMaxDryPcf == null ||
			proctorMaxDryPcf <= 0
		)
			return null;
		return soilCompaction({ wetWeightLbs, dryWeightLbs, volumeFt3, moisturePct, proctorMaxDryPcf });
	});

	const badge = $derived.by(() => {
		if (!result) return null;
		if (result.status === 'pass') return { kind: 'good' as const, text: 'PASS ≥95%' };
		if (result.status === 'marginal') return { kind: 'warn' as const, text: 'MARGINAL 92-95%' };
		return { kind: 'bad' as const, text: 'FAIL <92%' };
	});

	$effect(() => {
		if (result) {
			logDraft.set({
				toolId: 'soil-compaction',
				entryType: 'note',
				summary: `Compaction ${result.compactionPct.toFixed(1)}% (${result.status})`,
				fields: {
					notes: `Soil compaction ${result.compactionPct.toFixed(1)}% — ${result.status} (dry density ${result.dryDensity.toFixed(1)} pcf)`
				}
			});
		} else {
			logDraft.clearFor('soil-compaction');
		}
	});
	onDestroy(() => logDraft.clearFor('soil-compaction'));
</script>

<CalcCard
	title="Soil Compaction"
	hideTitle
	purpose="Calculate field density and percent compaction from test mold measurements."
>
	<NumberField label="Wet weight of soil" unit="lbs" bind:value={wetWeightLbs} />
	<NumberField label="Dry weight of soil" unit="lbs" bind:value={dryWeightLbs} />
	<NumberField label="Volume of mold" unit="ft³" step={0.01} bind:value={volumeFt3} />
	<NumberField label="Moisture content" unit="%" bind:value={moisturePct} />
	<NumberField
		label="Proctor max dry density (from lab)"
		unit="pcf"
		bind:value={proctorMaxDryPcf}
	/>

	{#if result}
		<div class="results-grid">
			<div class="result-item">
				<div class="result-label">Wet Density</div>
				<div class="result-value">{result.wetDensity.toFixed(1)} pcf</div>
			</div>
			<div class="result-item">
				<div class="result-label">Dry Density</div>
				<div class="result-value">{result.dryDensity.toFixed(1)} pcf</div>
			</div>
		</div>
		<ResultStat
			value={result.compactionPct.toFixed(1)}
			unit="% Compaction"
			badge={badge}
		/>
	{:else}
		<ResultStat value={null} unit="% Compaction" />
	{/if}

	<ShowWork>
		<p>Soil compaction test calculations:</p>
		<code
			>Wet Density = Wet Weight / Volume = {wetWeightLbs ?? '—'} / {volumeFt3 ?? '—'} = {result?.wetDensity.toFixed(1) ?? '—'} pcf</code
		>
		<code
			>Dry Density = Dry Weight / Volume = {dryWeightLbs ?? '—'} / {volumeFt3 ?? '—'} = {result?.dryDensity.toFixed(1) ?? '—'} pcf</code
		>
		<code
			>% Compaction = (Field Dry Density / Proctor Max) × 100 = ({result?.dryDensity.toFixed(1) ?? '—'} / {proctorMaxDryPcf ?? '—'}) × 100 = {result?.compactionPct.toFixed(1) ?? '—'}%</code
		>
		<p>Compaction spec: <strong>≥95%</strong> for subgrade per GDOT §207.3.05; 92–95% marginal, &lt;92% fail. Test method: AASHTO T 99 / T 180 (Proctor).</p>
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


	.results-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin: 12px 0;
	}
	@media (max-width: 560px) {
		.results-grid {
			grid-template-columns: 1fr;
		}
	}
	.result-item {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
		text-align: center;
	}
	.result-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		margin-bottom: 4px;
	}
	.result-value {
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--text);
	}
</style>
