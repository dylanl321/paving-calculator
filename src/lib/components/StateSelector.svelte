<script lang="ts">
	import { dotStateStore } from '$lib/stores/dotState.svelte';

	let { compact = false }: { compact?: boolean } = $props();

	const states = [
		{ code: 'AL' as const, label: 'ALDOT' },
		{ code: 'TX' as const, label: 'TxDOT' },
		{ code: 'GA' as const, label: 'GDOT' },
		{ code: 'FL' as const, label: 'FDOT' }
	];

	const selected = $derived(dotStateStore.selectedDotState);
</script>

<div class="state-selector" class:compact>
	{#each states as state}
		<button
			class="state-btn"
			class:active={selected === state.code}
			onclick={() => dotStateStore.setDotState(state.code)}
			aria-pressed={selected === state.code}
		>
			{state.label}
		</button>
	{/each}
</div>

<style>
	.state-selector {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.state-btn {
		flex: 1;
		min-width: 80px;
		min-height: 48px;
		padding: 0 16px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.state-btn:hover:not(.active) {
		background: var(--surface-alt);
		border-color: var(--text-muted);
	}

	.state-btn.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.state-selector.compact .state-btn {
		min-height: 40px;
		padding: 0 12px;
		font-size: 0.85rem;
	}

	@media (min-width: 640px) {
		.state-selector {
			flex-wrap: nowrap;
		}
	}
</style>
