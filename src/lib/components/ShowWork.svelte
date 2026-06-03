<script lang="ts">
	import type { Snippet } from 'svelte';
	import { slide } from 'svelte/transition';
	interface Props {
		children: Snippet;
		stepCount?: number;
	}
	let { children, stepCount }: Props = $props();
	let open = $state(false);
</script>

<div class="show-work">
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
