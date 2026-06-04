<script lang="ts">
	import { AlertCircle, RefreshCw } from 'lucide-svelte';

	type Props = {
		message?: string;
		type?: 'inline' | 'page' | 'retry';
		onRetry?: () => void;
	};

	let { message = 'Something went wrong', type = 'inline', onRetry }: Props = $props();
</script>

{#if type === 'inline'}
	<span class="error-inline" role="alert">
		<AlertCircle size={14} aria-hidden="true" />
		<span>{message}</span>
	</span>
{:else if type === 'page'}
	<div class="error-page" role="alert" aria-live="assertive">
		<div class="error-icon-circle">
			<AlertCircle size={40} aria-hidden="true" />
		</div>
		<h3>Something went wrong</h3>
		<p>{message}</p>
		{#if onRetry}
			<button type="button" class="btn-retry" onclick={onRetry}>
				<RefreshCw size={16} aria-hidden="true" />
				Try again
			</button>
		{/if}
	</div>
{:else if type === 'retry'}
	<div class="error-retry" role="alert" aria-live="assertive">
		<span class="error-retry-message">
			<AlertCircle size={15} aria-hidden="true" />
			<span>{message}</span>
		</span>
		{#if onRetry}
			<button type="button" class="btn-retry-inline" onclick={onRetry}>
				<RefreshCw size={14} aria-hidden="true" />
				Retry
			</button>
		{/if}
	</div>
{/if}

<style>
	/* ── inline ── */
	.error-inline {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.85rem;
		color: var(--bad, #e05252);
		line-height: 1.4;
	}

	/* ── page ── */
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 48px 24px;
		gap: 12px;
	}

	.error-icon-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--bad, #e05252) 12%, transparent);
		color: var(--bad, #e05252);
		flex-shrink: 0;
	}

	.error-page h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--text);
	}

	.error-page p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
		max-width: 360px;
		line-height: 1.5;
	}

	.btn-retry {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 24px;
		border-radius: 6px;
		border: 1px solid var(--bad, #e05252);
		background: transparent;
		color: var(--bad, #e05252);
		font-size: 0.95rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		margin-top: 8px;
	}

	.btn-retry:hover {
		background: color-mix(in srgb, var(--bad, #e05252) 10%, transparent);
	}

	/* ── retry (inline with button) ── */
	.error-retry {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.error-retry-message {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.875rem;
		color: var(--bad, #e05252);
		line-height: 1.4;
	}

	.btn-retry-inline {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-height: 32px;
		padding: 0 12px;
		border-radius: 5px;
		border: 1px solid var(--bad, #e05252);
		background: transparent;
		color: var(--bad, #e05252);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
	}

	.btn-retry-inline:hover {
		background: color-mix(in srgb, var(--bad, #e05252) 10%, transparent);
	}
</style>
