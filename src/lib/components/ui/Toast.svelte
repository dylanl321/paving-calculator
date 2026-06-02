<script lang="ts">
	import { toastStore, type Toast } from '$lib/stores/toast';
	import { fly, fade } from 'svelte/transition';

	let toasts = $state<Toast[]>([]);

	toastStore.subscribe((value) => {
		toasts = value;
	});
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
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M20 6L9 17l-5-5" />
						</svg>
					{:else if toast.type === 'error'}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					{:else}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="16" x2="12" y2="12" />
							<line x1="12" y1="8" x2="12.01" y2="8" />
						</svg>
					{/if}
				</div>
				<p class="toast-message">{toast.message}</p>
				<button
					class="toast-dismiss"
					type="button"
					onclick={() => toastStore.dismiss(toast.id)}
					aria-label="Dismiss notification"
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
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

	.toast-icon svg {
		width: 100%;
		height: 100%;
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

	.toast-dismiss svg {
		width: 18px;
		height: 18px;
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
