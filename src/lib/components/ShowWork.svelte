<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	import InspectorView, { type InspectorStat } from './InspectorView.svelte';

	interface Props {
		children: Snippet;
		stepCount?: number;
		inspectorStats?: InspectorStat[];
		inspectorTitle?: string;
	}
	let { children, stepCount, inspectorStats, inspectorTitle }: Props = $props();
	let open = $state(false);
	let inspectorOpen = $state(false);
</script>

<div class="show-work">
	{#if inspectorStats && inspectorTitle}
		<button
			class="inspector-button tap-scale"
			onclick={() => (inspectorOpen = true)}
		>
			<svg class="inspector-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M1 10C1 10 4 4 10 4C16 4 19 10 19 10C19 10 16 16 10 16C4 16 1 10 1 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				<circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="2"/>
			</svg>
			Show to Inspector
		</button>
		<InspectorView
			bind:open={inspectorOpen}
			onclose={() => (inspectorOpen = false)}
			title={inspectorTitle}
			stats={inspectorStats}
		/>
	{/if}

	<button class="toggle-link tap-scale" onclick={() => (open = !open)} aria-expanded={open}>
		{open ? '▾' : '▸'} Show the math
		{#if stepCount && stepCount > 0}
			<span class="step-badge">{stepCount}</span>
		{/if}
	</button>
	{#if open}
		<div class="work-body" transition:slide={{ duration: 280 }}>
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.show-work {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.inspector-button {
		width: 100%;
		min-height: var(--touch);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		padding: var(--sp-3) var(--sp-4);
		background: var(--accent);
		color: var(--bg);
		border: 0;
		border-radius: var(--radius-md);
		font-size: var(--fs-base);
		font-weight: var(--fw-bold);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.inspector-button:hover {
		background: color-mix(in srgb, var(--accent) 90%, black);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.inspector-button:active {
		transform: translateY(0);
	}

	.inspector-icon {
		flex-shrink: 0;
	}

	.toggle-link {
		background: none;
		border: 0;
		color: var(--text-muted);
		font-size: 0.85rem;
		padding: 4px 0;
		cursor: pointer;
		transition: color var(--dur-normal) var(--ease);
		min-height: var(--touch);
		display: flex;
		align-items: center;
	}

	.toggle-link:hover {
		color: var(--text);
	}
	.step-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		height: 20px;
		padding: 0 6px;
		margin-left: 6px;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 0.7rem;
		font-weight: var(--fw-bold);
		color: var(--accent);
	}
	.work-body {
		margin-top: 8px;
		padding: 12px 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.work-body :global(code) {
		display: block;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		color: var(--text);
		background: var(--surface);
		padding: 8px 10px;
		border-radius: 8px;
		margin: 6px 0;
		white-space: pre-wrap;
	}
	.work-body :global(.src-row) {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 6px;
	}
	.work-body :global(.src-note) {
		font-size: 0.78rem;
		color: var(--text-muted);
		border-left: 2px solid var(--border);
		padding-left: 8px;
		margin-top: 8px;
	}
</style>
