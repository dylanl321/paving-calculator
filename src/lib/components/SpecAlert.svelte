<script lang="ts">
	interface Props {
		status: 'pass' | 'warn' | 'fail' | 'good' | 'bad';
		message: string;
		clause?: string;
		clauseTitle?: string;
		guidance?: string;
	}

	let { status, message, clause, clauseTitle, guidance }: Props = $props();

	const statusMap = {
		pass: 'good',
		good: 'good',
		warn: 'warn',
		fail: 'bad',
		bad: 'bad'
	} as const;

	const resolvedStatus = $derived(statusMap[status]);
</script>

<div class="spec-alert" class:good={resolvedStatus === 'good'} class:warn={resolvedStatus === 'warn'} class:bad={resolvedStatus === 'bad'}>
	<div class="alert-content">
		<div class="alert-message">{message}</div>
		{#if guidance && (resolvedStatus === 'warn' || resolvedStatus === 'bad')}
			<div class="alert-guidance">→ {guidance}</div>
		{/if}
		{#if clause}
			<div class="clause-pill" title={clauseTitle || clause}>
				{clause}
			</div>
		{/if}
	</div>
</div>

<style>
	.spec-alert {
		margin: var(--sp-3) 0;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-sm);
		border-left: var(--sp-1) solid currentColor;
		font-size: var(--fs-sm);
		line-height: 1.4;
	}
	.spec-alert.good {
		background: color-mix(in srgb, var(--good) 14%, transparent);
		color: var(--good);
		border-color: var(--good);
	}
	.spec-alert.warn {
		background: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn);
		border-color: var(--warn);
	}
	.spec-alert.bad {
		background: color-mix(in srgb, var(--bad) 14%, transparent);
		color: var(--bad);
		border-color: var(--bad);
	}
	.alert-content {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.alert-message {
		font-weight: var(--fw-medium);
	}
	.alert-guidance {
		font-size: var(--fs-xs);
		font-style: italic;
		opacity: 0.85;
		line-height: 1.3;
		margin-top: var(--sp-1);
	}
	.clause-pill {
		display: inline-block;
		align-self: flex-start;
		padding: var(--sp-1) var(--sp-3);
		background: color-mix(in srgb, var(--surface) 70%, currentColor 10%);
		border-radius: var(--radius-sm);
		font-size: var(--fs-2xs);
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
		font-weight: var(--fw-semibold);
		color: color-mix(in srgb, currentColor 90%, transparent);
		cursor: help;
	}
</style>
