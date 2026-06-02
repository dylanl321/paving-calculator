<script lang="ts">
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { today } from '$lib/stores/today.svelte';
	import type { Tool } from '$lib/workspace/tools';

	interface Props {
		tool: Tool;
		ongoToToday?: () => void;
	}
	let { tool, ongoToToday }: Props = $props();

	// Only show a live draft that belongs to the active tool.
	const draft = $derived(
		logDraft.current && logDraft.current.toolId === tool.id ? logDraft.current : null
	);

	let justLogged = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	function logIt() {
		if (!draft) return;
		today.addEntry({
			entry_type: draft.entryType,
			source_calc: tool.label,
			...draft.fields
		});
		justLogged = true;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => (justLogged = false), 3500);
	}
</script>

{#if tool.logsAs}
	<div class="log-bar">
		<div class="log-info">
			{#if draft}
				<span class="ready">Ready to log:</span>
				<span class="summary">{draft.summary}</span>
			{:else}
				<span class="hint">Enter a result to log it to Today</span>
			{/if}
		</div>
		<div class="log-actions">
			{#if justLogged}
				<span class="logged">✓ Added to Today</span>
				{#if ongoToToday}
					<button class="btn btn-subtle btn-sm" onclick={ongoToToday}>View day</button>
				{/if}
			{:else}
				<button class="btn btn-primary btn-sm" disabled={!draft} onclick={logIt}>
					Log to Today
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.log-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-top: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.log-info {
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}
	.ready {
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		font-weight: var(--fw-bold);
	}
	.summary {
		font-size: var(--fs-sm);
		color: var(--text);
		font-weight: var(--fw-semibold);
	}
	.hint {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.log-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
	}
	.logged {
		font-size: var(--fs-sm);
		color: var(--good);
		font-weight: var(--fw-bold);
	}
</style>
