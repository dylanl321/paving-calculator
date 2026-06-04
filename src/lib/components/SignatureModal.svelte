<script lang="ts">
	import SignaturePad from './SignaturePad.svelte';

	let {
		onConfirm = () => {},
		onCancel = () => {}
	}: {
		onConfirm: (signatureDataUrl: string) => void;
		onCancel: () => void;
	} = $props();

	let signaturePad: any = $state();
	let signatureDataUrl = $state<string | null>(null);
	let isSignatureEmpty = $derived(!signatureDataUrl);

	function handleSignatureChange(dataUrl: string | null) {
		signatureDataUrl = dataUrl;
	}

	function handleClear() {
		signaturePad?.clear();
		signatureDataUrl = null;
	}

	function handleConfirm() {
		if (signatureDataUrl) {
			onConfirm(signatureDataUrl);
		}
	}
</script>

<div
	class="modal-overlay"
	role="button"
	tabindex="-1"
	aria-label="Close dialog"
	onclick={onCancel}
	onkeydown={(e) => { if (e.key === 'Escape') onCancel(); }}
>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h3>Sign Report</h3>
			<button class="btn-close" onclick={onCancel} aria-label="Close">✕</button>
		</div>

		<div class="modal-body">
			<p class="instruction">Use your finger or stylus to sign below</p>
			<SignaturePad
				bind:this={signaturePad}
				onSignatureChange={handleSignatureChange}
				width={400}
				height={200}
			/>
		</div>

		<div class="modal-footer">
			<button class="btn-secondary" onclick={handleClear}>Clear</button>
			<button class="btn-primary" onclick={handleConfirm} disabled={isSignatureEmpty}>
				Sign & Export PDF
			</button>
		</div>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		padding: 16px;
	}

	.modal {
		width: 100%;
		max-width: 500px;
		background: var(--bg);
		border-radius: var(--radius);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		display: flex;
		flex-direction: column;
		max-height: 90vh;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid var(--border);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.3rem;
		color: var(--text);
	}

	.btn-close {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.5rem;
		cursor: pointer;
		padding: 4px 8px;
		min-width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.2s;
	}

	.btn-close:hover {
		color: var(--accent);
	}

	.modal-body {
		padding: 24px 20px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
		align-items: center;
	}

	.instruction {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text-muted);
		text-align: center;
	}

	.modal-footer {
		display: flex;
		gap: 12px;
		padding: 20px;
		border-top: 1px solid var(--border);
	}

	.btn-secondary {
		flex: 1;
		min-height: 48px;
		padding: 0 20px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-secondary:hover {
		background: var(--surface-alt);
	}

	.btn-primary {
		flex: 2;
		min-height: 48px;
		padding: 0 20px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (max-width: 500px) {
		.modal {
			max-width: 100%;
			max-height: 100%;
			border-radius: 0;
		}

		.modal-overlay {
			padding: 0;
		}
	}
</style>
