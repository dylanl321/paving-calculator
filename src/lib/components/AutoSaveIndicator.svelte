<script lang="ts">
	export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

	let {
		status = 'idle',
		errorMessage = 'Failed to save',
		onRetry
	}: {
		status: SaveStatus;
		errorMessage?: string;
		onRetry?: () => void;
	} = $props();
</script>

{#if status !== 'idle'}
	<span class="autosave-indicator" class:saving={status === 'saving'} class:saved={status === 'saved'} class:error={status === 'error'} aria-live="polite">
		{#if status === 'saving'}
			<span class="autosave-dot saving-dot"></span>
			Saving…
		{:else if status === 'saved'}
			<span class="autosave-dot saved-dot"></span>
			Saved ✓
		{:else if status === 'error'}
			<span class="autosave-dot error-dot"></span>
			{errorMessage}
			{#if onRetry}
				<button class="retry-btn" onclick={onRetry} type="button">Retry</button>
			{/if}
		{/if}
	</span>
{/if}

<style>
	.autosave-indicator {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		transition: opacity 0.2s ease;
	}

	.autosave-indicator.saving {
		color: #94a3b8;
	}

	.autosave-indicator.saved {
		color: #4ade80;
	}

	.autosave-indicator.error {
		color: #f87171;
	}

	.autosave-dot {
		display: inline-block;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.saving-dot {
		background: #94a3b8;
		animation: pulse 1s ease-in-out infinite;
	}

	.saved-dot {
		background: #4ade80;
	}

	.error-dot {
		background: #f87171;
	}

	.retry-btn {
		background: none;
		border: 1px solid #f87171;
		color: #f87171;
		font-size: 0.7rem;
		padding: 0.125rem 0.375rem;
		border-radius: 0.2rem;
		cursor: pointer;
		margin-left: 0.25rem;
		min-height: 20px;
		line-height: 1;
	}

	.retry-btn:hover {
		background: rgba(248, 113, 113, 0.15);
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}
</style>
