<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { concreteVolume } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	let lengthFt = $state<number | null>(null);
	let widthFt = $state<number | null>(null);
	let depthIn = $state<number | null>(null);
	let wasteFactor = $state<number>(0);

	function clearInputs() {
		lengthFt = null;
		widthFt = null;
		depthIn = null;
		wasteFactor = 0;
		logDraft.clearFor('concrete-volume');
	}

	const result = $derived.by(() => {
		if (lengthFt == null || widthFt == null || depthIn == null || lengthFt <= 0 || widthFt <= 0)
			return null;
		const base = concreteVolume(lengthFt, widthFt, depthIn);
		const wasteMultiplier = 1 + wasteFactor / 100;
		return {
			volumeFt3: base.volumeFt3 * wasteMultiplier,
			volumeYd3: base.volumeYd3 * wasteMultiplier,
			bags80lb: base.bags80lb * wasteMultiplier,
			truckLoads: base.truckLoads * wasteMultiplier
		};
	});

	$effect(() => {
		if (result) {
			logDraft.set({
				toolId: 'concrete-volume',
				entryType: 'note',
				summary: `${result.volumeYd3.toFixed(2)} yd³ concrete`,
				fields: {
					notes: `Concrete: ${result.volumeYd3.toFixed(2)} yd³ (${result.truckLoads.toFixed(1)} truck loads${wasteFactor > 0 ? `, +${wasteFactor}% waste` : ''})`
				}
			});
		} else {
			logDraft.clearFor('concrete-volume');
		}
	});
	onDestroy(() => logDraft.clearFor('concrete-volume'));
</script>

<CalcCard
	title="Concrete Volume"
	hideTitle
	purpose="Calculate volume needed for slabs, footings, or pads. Includes waste factor."
>
	<NumberField label="Length" unit="ft" bind:value={lengthFt} />
	<NumberField label="Width" unit="ft" bind:value={widthFt} />
	<NumberField label="Depth" unit="in" bind:value={depthIn} />

	<div class="waste-buttons">
		<button class:active={wasteFactor === 0} onclick={() => (wasteFactor = 0)}>No waste</button>
		<button class:active={wasteFactor === 5} onclick={() => (wasteFactor = 5)}>+5%</button>
		<button class:active={wasteFactor === 10} onclick={() => (wasteFactor = 10)}>+10%</button>
	</div>

	{#if result}
		<div class="results-grid">
			<div class="result-item">
				<div class="result-label">Volume (yd³)</div>
				<div class="result-value">{result.volumeYd3.toFixed(2)}</div>
			</div>
			<div class="result-item">
				<div class="result-label">Volume (ft³)</div>
				<div class="result-value">{result.volumeFt3.toFixed(1)}</div>
			</div>
			<div class="result-item">
				<div class="result-label">80lb Bags</div>
				<div class="result-value">{Math.ceil(result.bags80lb)}</div>
			</div>
			<div class="result-item">
				<div class="result-label">Truck Loads (9 yd³)</div>
				<div class="result-value">{result.truckLoads.toFixed(2)}</div>
			</div>
		</div>
	{:else}
		<ResultStat value={null} unit="cubic yards" />
	{/if}

	<ShowWork>
		<p>Concrete volume calculation:</p>
		<code
			>Volume (ft³) = Length × Width × (Depth / 12) = {lengthFt ?? '—'} × {widthFt ?? '—'} × ({depthIn ?? '—'} / 12) = {result ? (result.volumeFt3 / (1 + wasteFactor / 100)).toFixed(1) : '—'} ft³</code
		>
		<code>Volume (yd³) = Volume (ft³) / 27 = {result ? result.volumeYd3.toFixed(2) : '—'} yd³</code>
		<code
			>80lb Bags ≈ Volume (ft³) × 0.45 = {result ? Math.ceil(result.bags80lb) : '—'} bags</code
		>
		<code
			>Truck Loads = Volume (yd³) / 9 = {result ? result.truckLoads.toFixed(2) : '—'} loads</code
		>
		{#if wasteFactor > 0}
			<p>Waste factor of {wasteFactor}% applied to all results.</p>
		{/if}
		<p>Concrete volume calculation uses GDOT §500 Portland Cement Concrete Pavement (PCCP) methods. Standard mix design per §830 (portland cement, 94 lb/bag standard bag weight).</p>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.waste-buttons {
		display: flex;
		gap: var(--sp-2);
		margin: var(--sp-3) 0;
	}
	.waste-buttons button {
		flex: 1;
		padding: var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: var(--fs-sm);
		cursor: pointer;
		transition:
			background var(--dur) var(--ease),
			border-color var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.waste-buttons button.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: var(--fw-bold);
	}
</style>
