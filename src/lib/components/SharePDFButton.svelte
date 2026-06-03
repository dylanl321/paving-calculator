<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		getPdfBlob: () => Promise<Blob>;
		filename: string;
		subject?: string;
		recipientCount?: number;
	}

	let { getPdfBlob, filename, subject, recipientCount = 0 }: Props = $props();

	let loading = $state(false);
	let message = $state('');
	let messageType = $state<'success' | 'error' | ''>('');

	async function blobToBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				const base64 = dataUrl.split(',')[1];
				resolve(base64);
			};
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}

	async function sharePDF() {
		if (recipientCount === 0) {
			message = 'No recipients configured';
			messageType = 'error';
			setTimeout(() => {
				message = '';
				messageType = '';
			}, 3000);
			return;
		}

		loading = true;
		message = '';
		messageType = '';

		try {
			const blob = await getPdfBlob();
			const base64 = await blobToBase64(blob);

			const response = await fetch('/api/org/share-pdf', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					pdfBase64: base64,
					filename,
					subject
				})
			});

			const result = (await response.json()) as { error?: string; sent?: number };

			if (!response.ok) {
				message = result.error || 'Failed to send';
				messageType = 'error';
				toastStore.error(message);
			} else {
				message = `Sent to ${result.sent} recipient${result.sent === 1 ? '' : 's'}`;
				messageType = 'success';
				toastStore.success(message);
			}
		} catch (error) {
			message = 'Network error';
			messageType = 'error';
			toastStore.error(message);
		} finally {
			loading = false;
			setTimeout(() => {
				message = '';
				messageType = '';
			}, 5000);
		}
	}
</script>

<button class="share-btn" onclick={sharePDF} disabled={loading || recipientCount === 0} title={recipientCount === 0 ? 'No recipients configured' : `Share with ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}>
	{#if loading}
		<div class="spinner"></div>
	{:else}
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
			<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
			<path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
		</svg>
	{/if}
	Share
</button>

{#if message}
	<span class="message" class:success={messageType === 'success'} class:error={messageType === 'error'}>
		{message}
	</span>
{/if}

<style>
	.share-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--accent);
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		color: var(--accent-text);
		font-size: 0.9rem;
		font-weight: 600;
		padding: 0 16px;
		height: 48px;
		cursor: pointer;
		white-space: nowrap;
		transition: opacity 0.2s;
	}

	.share-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.share-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.message {
		font-size: 0.82rem;
		font-weight: 600;
		padding: 0 4px;
	}

	.message.success {
		color: #22c55e;
	}

	.message.error {
		color: #ef4444;
	}
</style>
