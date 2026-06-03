<script lang="ts">
	let {
		status,
		onRetry
	}: {
		status: 'idle' | 'saving' | 'saved' | 'error';
		onRetry?: () => void;
	} = $props();

	let visible = $state(false);
	let fadeOutTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (fadeOutTimer) {
			clearTimeout(fadeOutTimer);
			fadeOutTimer = null;
		}

		if (status === 'saved') {
			visible = true;
			fadeOutTimer = setTimeout(() => {
				visible = false;
			}, 2000);
		} else if (status === 'saving' || status === 'error') {
			visible = true;
		} else {
			visible = false;
		}
	});

	const shouldShow = $derived(visible && status !== 'idle');
</script>

{#if shouldShow}
	<div class="auto-save-status" class:fade-out={status === 'saved' && !visible}>
		{#if status === 'saving'}
			<svg class="spinner" width="12" height="12" viewBox="0 0 24 24" fill="none">
				<circle
					class="spinner-circle"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					stroke-width="3"
				/>
			</svg>
			<span>Saving...</span>
		{:else if status === 'saved'}
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none">
				<path
					d="M20 6L9 17l-5-5"
					stroke="#4ade80"
					stroke-width="3"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<span class="saved-text">Saved</span>
		{:else if status === 'error'}
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none">
				<path
					d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					stroke="#f87171"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<span class="error-text">Failed to save</span>
			{#if onRetry}
				<button class="retry-btn" onclick={onRetry} type="button">Retry</button>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.auto-save-status {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		min-height: 20px;
		color: var(--text-muted);
		transition: opacity 0.3s ease;
		opacity: 1;
	}

	.auto-save-status.fade-out {
		opacity: 0;
	}

	.spinner {
		animation: spin 0.8s linear infinite;
	}

	.spinner-circle {
		stroke-dasharray: 50;
		stroke-dashoffset: 25;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.saved-text {
		color: #4ade80;
	}

	.error-text {
		color: #f87171;
	}

	.retry-btn {
		background: transparent;
		border: none;
		color: #f87171;
		font-size: 0.75rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 8px 12px;
		min-height: 44px;
		margin-left: 2px;
	}

	.retry-btn:hover {
		color: #ef4444;
	}
</style>
