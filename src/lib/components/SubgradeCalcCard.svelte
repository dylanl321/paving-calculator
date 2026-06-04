<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { config } from '$lib/config';
	import { subgradeTonnage } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	interface MaterialOption {
		id: string;
		label: string;
		densityTonsPerYd3: number;
	}

	let { materials: materialsProp }: { materials?: MaterialOption[] } = $props();

	const materials = $derived(materialsProp ?? config.materials ?? []);

	let lengthFt = $state<number | null>(null);
	let widthFt = $state<number | null>(null);
	let depthIn = $state<number | null>(null);
	// svelte-ignore state_referenced_locally
	let materialId = $state<string>(materials[0]?.id ?? 'MAT.GAB');

	function clearInputs() {
		lengthFt = null;
		widthFt = null;
		depthIn = null;
		materialId = materials[0]?.id ?? 'MAT.GAB';
		logDraft.clearFor('subgrade');
	}

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

	$effect(() => {
		if (result && selectedMaterial) {
			logDraft.set({
				toolId: 'subgrade',
				entryType: 'note',
				summary: `${result.tons.toFixed(1)} t ${selectedMaterial.label}`,
				fields: {
					notes: `${selectedMaterial.label}: ${result.tons.toFixed(1)} tons (${result.truckLoads.toFixed(1)} loads, ${result.cubicYards.toFixed(1)} yd³)`
				}
			});
		} else {
			logDraft.clearFor('subgrade');
		}
	});
	onDestroy(() => logDraft.clearFor('subgrade'));
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
		<p>Material densities per GDOT §207 Embankment and §310 Aggregate Base Course. Truck load assumes 18-ton (field standard); adjust for your actual fleet.</p>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.material-select {
		margin: var(--sp-3) 0;
	}
	.material-select label {
		display: block;
		font-size: var(--fs-sm);
		margin-bottom: var(--sp-1);
		color: var(--text-muted);
	}
	.material-select select {
		width: 100%;
		min-height: var(--touch);
		padding: 0 var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: var(--fs-md);
	}
</style>
