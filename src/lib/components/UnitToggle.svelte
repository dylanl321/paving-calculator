<script lang="ts">
	import { unitsStore } from '$lib/stores/units.svelte';
</script>

<div class="unit-toggle">
	<button
		class="chip"
		class:active={unitsStore.system === 'imperial'}
		onclick={() => (unitsStore.system = 'imperial')}
		aria-label="Switch to imperial units"
	>
		Imperial
	</button>
	<button
		class="chip"
		class:active={unitsStore.system === 'metric'}
		onclick={() => (unitsStore.system = 'metric')}
		aria-label="Switch to metric units"
	>
		Metric
	</button>
</div>

<style>
	.unit-toggle {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.chip {
		min-height: var(--chip-h);
		padding: 0 16px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s,
			border-color 0.2s;
	}

	.chip:hover {
		background: var(--surface-alt);
	}

	.chip.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.chip:active {
		transform: scale(0.96);
	}
</style>
