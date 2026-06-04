<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
	import { fly, fade } from 'svelte/transition';
	import { CheckCircle2, AlertCircle, Info, X } from 'lucide-svelte';

	const toasts = $derived(toastStore.toasts);
</script>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div
				class="toast toast-{toast.type}"
				role={toast.type === 'error' ? 'alert' : 'status'}
				aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
				in:fly={{ y: 20, duration: 280 }}
				out:fade={{ duration: 160 }}
			>
				<div class="toast-icon" aria-hidden="true">
					{#if toast.type === 'success'}
						<CheckCircle2 size={22} />
					{:else if toast.type === 'error'}
						<AlertCircle size={22} />
					{:else}
						<Info size={22} />
					{/if}
				</div>
				<p class="toast-message">{toast.message}</p>
				<button
					class="toast-dismiss"
					type="button"
					onclick={() => toastStore.dismiss(toast.id)}
					aria-label="Dismiss notification"
				>
					<X size={18} />
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 12px;
		pointer-events: none;
		width: calc(100vw - 32px);
		max-width: 420px;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border-radius: var(--radius-md);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.12);
		pointer-events: auto;
		min-height: 48px;
	}

	.toast-success {
		background: color-mix(in srgb, var(--good) 15%, var(--surface));
		border: 1px solid var(--good);
		color: var(--text);
	}

	.toast-error {
		background: color-mix(in srgb, var(--bad) 15%, var(--surface));
		border: 1px solid var(--bad);
		color: var(--text);
	}

	.toast-info {
		background: color-mix(in srgb, var(--accent) 15%, var(--surface));
		border: 1px solid var(--accent);
		color: var(--text);
	}

	.toast-icon {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toast-success .toast-icon {
		color: var(--good);
	}

	.toast-error .toast-icon {
		color: var(--bad);
	}

	.toast-info .toast-icon {
		color: var(--accent);
	}

	.toast-message {
		flex: 1;
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.4;
	}

	.toast-dismiss {
		flex-shrink: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: currentColor;
		opacity: 0.7;
		cursor: pointer;
		transition: opacity 0.2s, background 0.2s;
	}

	.toast-dismiss:hover {
		opacity: 1;
		background: rgba(0, 0, 0, 0.15);
	}

	.toast-dismiss:active {
		transform: scale(0.95);
	}

	/* Desktop: position bottom-right */
	@media (min-width: 768px) {
		.toast-container {
			left: auto;
			right: 24px;
			bottom: 24px;
			transform: none;
			width: auto;
			max-width: 400px;
		}
	}
</style>
