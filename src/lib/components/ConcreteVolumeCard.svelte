<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import { concreteVolume } from '$lib/config/formulas';

	let lengthFt = $state<number | null>(null);
	let widthFt = $state<number | null>(null);
	let depthIn = $state<number | null>(null);
	let wasteFactor = $state<number>(0);

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
</script>

<CalcCard
	title="Concrete Volume"
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
	</ShowWork>
</CalcCard>

<style>
	.waste-buttons {
		display: flex;
		gap: 8px;
		margin: 12px 0;
	}
	.waste-buttons button {
		flex: 1;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.waste-buttons button.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
		font-weight: 700;
	}
	.results-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
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
	@media (max-width: 460px) {
		.results-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
