<script lang="ts">
	interface Props {
		status: 'pass' | 'warn' | 'fail' | 'good' | 'bad';
		message: string;
		clause?: string;
		clauseTitle?: string;
	}

	let { status, message, clause, clauseTitle }: Props = $props();

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
		{#if clause}
			<div class="clause-pill" title={clauseTitle || clause}>
				{clause}
			</div>
		{/if}
	</div>
</div>

<style>
	.spec-alert {
		margin: 10px 0;
		padding: 12px 14px;
		border-radius: 10px;
		border-left: 4px solid currentColor;
		font-size: 0.85rem;
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
		gap: 8px;
	}
	.alert-message {
		font-weight: 500;
	}
	.clause-pill {
		display: inline-block;
		align-self: flex-start;
		padding: 4px 10px;
		background: color-mix(in srgb, var(--surface) 70%, currentColor 10%);
		border-radius: 6px;
		font-size: 0.7rem;
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
		font-weight: 600;
		color: color-mix(in srgb, currentColor 90%, transparent);
		cursor: help;
	}
</style>
