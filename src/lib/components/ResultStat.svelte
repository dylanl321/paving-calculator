<script lang="ts">
	import { fade } from 'svelte/transition';

	interface Badge {
		kind: 'good' | 'warn' | 'bad';
		text: string;
	}
	interface Props {
		value: string | number | null;
		unit: string;
		badge?: Badge | null;
		secondary?: string | null;
	}
	let { value, unit, badge = null, secondary = null }: Props = $props();
</script>

<div class="result" class:empty={value == null}>
	{#if value == null}
		<div class="placeholder">Enter values above to see the result</div>
	{:else}
		{#key value}
			<div class="value" in:fade={{ duration: 160 }}>{value}</div>
		{/key}
		<div class="unit-label">{unit}</div>
		{#if badge}<span class="badge {badge.kind}">{badge.text}</span>{/if}
		{#if secondary}<div class="secondary">{secondary}</div>{/if}
	{/if}
</div>

<style>
	.result {
		margin-top: var(--sp-2);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--sp-6) var(--sp-4);
		text-align: center;
	}
	.result.empty {
		padding: var(--sp-4);
	}
	.placeholder {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.value {
		font-size: var(--fs-result);
		font-weight: var(--fw-heavy);
		line-height: 1;
		color: var(--accent);
		letter-spacing: -0.5px;
	}
	.unit-label {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-top: var(--sp-2);
	}
	.secondary {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-top: var(--sp-2);
	}
	.badge {
		display: inline-block;
		margin-top: var(--sp-3);
		padding: 5px 12px;
		border-radius: var(--radius-pill);
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
	}
	.badge.good {
		background: color-mix(in srgb, var(--good) 22%, transparent);
		color: var(--good);
	}
	.badge.warn {
		background: color-mix(in srgb, var(--warn) 22%, transparent);
		color: var(--warn);
	}
	.badge.bad {
		background: color-mix(in srgb, var(--bad) 22%, transparent);
		color: var(--bad);
	}
</style>
