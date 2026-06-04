<script lang="ts">
	import { confirmStore } from '$lib/stores/confirm.svelte';

	const open = $derived(confirmStore.open);
	const title = $derived(confirmStore.title);
	const message = $derived(confirmStore.message);
	const confirmLabel = $derived(confirmStore.confirmLabel);
	const cancelLabel = $derived(confirmStore.cancelLabel);
	const destructive = $derived(confirmStore.destructive);

	function handleConfirm() {
		confirmStore.confirm();
	}

	function handleCancel() {
		confirmStore.cancel();
	}

	function handleBackdropClick() {
		confirmStore.cancel();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			confirmStore.cancel();
		}
	}

	$effect(() => {
		if (open) {
			document.addEventListener('keydown', handleKeyDown);
			return () => {
				document.removeEventListener('keydown', handleKeyDown);
			};
		}
	});
</script>

{#if open}
	<div
		class="modal-overlay"
		role="button"
		tabindex="-1"
		aria-label="Close dialog"
		onclick={handleBackdropClick}
		onkeydown={(e) => { if (e.key === 'Escape') handleBackdropClick(); }}
	></div>
	<div class="modal-container" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
		<div class="modal-content">
			<h2 id="confirm-title" class="modal-title">{title}</h2>
			<p class="modal-message">{message}</p>
			<div class="modal-actions">
				<button class="btn-cancel" onclick={handleCancel}>
					{cancelLabel}
				</button>
				<button class="btn-confirm" class:destructive onclick={handleConfirm}>
					{confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 1100;
		animation: fadeIn 0.15s ease-out;
	}

	.modal-container {
		position: fixed;
		inset: 0;
		z-index: 1100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		animation: slideUp 0.2s ease-out;
	}

	.modal-content {
		background: var(--surface, #1e1e2e);
		border: 1px solid var(--border, #333);
		border-radius: 12px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 8px 24px rgba(0, 0, 0, 0.4);
		padding: 24px;
		max-width: 400px;
		width: 100%;
	}

	.modal-title {
		margin: 0 0 12px 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text, #fff);
	}

	.modal-message {
		margin: 0 0 24px 0;
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--text-muted, #a0a0a0);
	}

	.modal-actions {
		display: flex;
		gap: 12px;
	}

	.btn-cancel,
	.btn-confirm {
		flex: 1;
		min-height: 48px;
		padding: 12px 24px;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid var(--border, #333);
		color: var(--text, #fff);
	}

	.btn-cancel:hover {
		background: var(--surface-hover, #333);
	}

	.btn-confirm {
		background: var(--accent, #f59e0b);
		color: var(--accent-text, #000);
	}

	.btn-confirm.destructive {
		background: #ef4444;
		color: #fff;
	}

	.btn-confirm:hover {
		opacity: 0.9;
	}

	.btn-confirm.destructive:hover {
		background: #dc2626;
	}

	.btn-cancel:active,
	.btn-confirm:active {
		transform: scale(0.98);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 460px) {
		.modal-container {
			padding: 16px;
		}

		.modal-content {
			max-width: 100%;
		}
	}
</style>
