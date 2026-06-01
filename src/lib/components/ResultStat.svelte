<script lang="ts">
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
		<div class="value">{value}</div>
		<div class="unit-label">{unit}</div>
		{#if badge}<span class="badge {badge.kind}">{badge.text}</span>{/if}
		{#if secondary}<div class="secondary">{secondary}</div>{/if}
	{/if}
</div>

<style>
	.result {
		margin-top: 8px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px 16px;
		text-align: center;
	}
	.result.empty {
		padding: 16px;
	}
	.placeholder {
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.value {
		font-size: 2.8rem;
		font-weight: 800;
		line-height: 1;
		color: var(--accent);
	}
	.unit-label {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin-top: 6px;
	}
	.secondary {
		font-size: 0.82rem;
		color: var(--text-muted);
		margin-top: 8px;
	}
	.badge {
		display: inline-block;
		margin-top: 12px;
		padding: 5px 12px;
		border-radius: 999px;
		font-size: 0.8rem;
		font-weight: 700;
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
