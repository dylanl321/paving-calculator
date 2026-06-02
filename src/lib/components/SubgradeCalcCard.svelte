<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { config } from '$lib/config';
	import { subgradeTonnage } from '$lib/config/formulas';

	const materials = config.materials ?? [];

	let lengthFt = $state<number | null>(null);
	let widthFt = $state<number | null>(null);
	let depthIn = $state<number | null>(null);
	let materialId = $state<string>(materials[0]?.id ?? 'MAT.GAB');

	const selectedMaterial = $derived(
		materials.find((m) => m.id === materialId) ?? materials[0]
	);

	const result = $derived.by(() => {
		if (
			lengthFt == null ||
			widthFt == null ||
			depthIn == null ||
			lengthFt <= 0 ||
			widthFt <= 0 ||
			!selectedMaterial
		)
			return null;
		return subgradeTonnage({
			lengthFt,
			widthFt,
			depthIn,
			densityTonsPerYd3: selectedMaterial.densityTonsPerYd3
		});
	});
</script>

<CalcCard
	title="Subgrade / Base Stone"
	hideTitle
	purpose="Calculate tonnage and truck loads for base material by depth and density."
>
	<NumberField label="Length" unit="ft" bind:value={lengthFt} />
	<NumberField label="Width" unit="ft" bind:value={widthFt} />
	<NumberField label="Depth" unit="in" bind:value={depthIn} />

	<div class="material-select">
		<label for="material">Material Type</label>
		<select id="material" bind:value={materialId}>
			{#each materials as mat}
				<option value={mat.id}>
					{mat.label} ({mat.densityTonsPerYd3} tons/yd³)
				</option>
			{/each}
		</select>
	</div>

	{#if result}
		<div class="results-grid">
			<div class="result-item">
				<div class="result-label">Cubic Yards</div>
				<div class="result-value">{result.cubicYards.toFixed(2)}</div>
			</div>
			<div class="result-item">
				<div class="result-label">Tons Needed</div>
				<div class="result-value">{result.tons.toFixed(2)}</div>
			</div>
			<div class="result-item">
				<div class="result-label">Truck Loads (18 tons)</div>
				<div class="result-value">{result.truckLoads.toFixed(2)}</div>
			</div>
		</div>
	{:else}
		<ResultStat value={null} unit="tons needed" />
	{/if}

	<ShowWork>
		<p>Subgrade/base stone calculation:</p>
		<code
			>Volume (ft³) = Length × Width × (Depth / 12) = {lengthFt ?? '—'} × {widthFt ?? '—'} × ({depthIn ?? '—'} / 12) = {result ? ((result.cubicYards * 27).toFixed(1)) : '—'} ft³</code
		>
		<code
			>Volume (yd³) = Volume (ft³) / 27 = {result ? result.cubicYards.toFixed(2) : '—'} yd³</code
		>
		<code
			>Tons = Volume (yd³) × Density ({selectedMaterial?.densityTonsPerYd3 ?? '—'} tons/yd³) = {result ? result.tons.toFixed(2) : '—'} tons</code
		>
		<code
			>Truck Loads = Tons / 18 (assumes 18-ton truck) = {result ? result.truckLoads.toFixed(2) : '—'} loads</code
		>
	</ShowWork>
</CalcCard>

<style>
	.material-select {
		margin: 12px 0;
	}
	.material-select label {
		display: block;
		font-size: 0.85rem;
		margin-bottom: 4px;
		color: var(--text-muted);
	}
	.material-select select {
		width: 100%;
		padding: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.95rem;
	}
	.results-grid {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 10px;
		margin: 12px 0;
	}
	.result-item {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
		text-align: center;
	}
	.result-label {
		font-size: 0.7rem;
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
	@media (max-width: 560px) {
		.results-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
