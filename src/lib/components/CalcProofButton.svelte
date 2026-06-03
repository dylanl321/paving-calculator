<script lang="ts">
	import { generateCalcProofPDF, type CalcProofData } from '$lib/utils/pdf-export';

	interface Props {
		title: string;
		getData: () => CalcProofData | null;
	}

	let { title, getData }: Props = $props();
	let isGenerating = $state(false);
	let message = $state<string | null>(null);

	async function handleClick() {
		const data = getData();

		if (!data) {
			message = 'Enter values first';
			setTimeout(() => { message = null; }, 2000);
			return;
		}

		isGenerating = true;
		message = null;

		try {
			await generateCalcProofPDF(data);
		} catch (err) {
			console.error('PDF generation failed:', err);
			message = 'PDF generation failed';
			setTimeout(() => { message = null; }, 3000);
		} finally {
			isGenerating = false;
		}
	}
</script>

<div class="proof-button-wrapper">
	<button
		type="button"
		class="proof-button"
		onclick={handleClick}
		disabled={isGenerating}
		aria-busy={isGenerating}
	>
		{#if isGenerating}
			<svg class="spinner" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="28 10" />
			</svg>
			Generating...
		{:else}
			<svg class="download-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M8 1V11M8 11L11 8M8 11L5 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M2 11V13C2 13.5304 2.21071 14.0391 2.58579 14.4142C2.96086 14.7893 3.46957 15 4 15H12C12.5304 15 13.0391 14.7893 13.4142 14.4142C13.7893 14.0391 14 13.5304 14 13V11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			Save proof PDF
		{/if}
	</button>
	{#if message}
		<span class="message">{message}</span>
	{/if}
</div>

<style>
	.proof-button-wrapper {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.proof-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		width: 100%;
		min-height: 48px;
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.proof-button:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--text-muted);
		color: var(--text);
	}
	.proof-button:active:not(:disabled) {
		transform: scale(0.98);
	}
	.proof-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.download-icon,
	.spinner {
		flex-shrink: 0;
	}
	.spinner {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
	.message {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-align: center;
		font-style: italic;
	}
</style>
