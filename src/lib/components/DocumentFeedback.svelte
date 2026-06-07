<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';

	interface ParsingReport {
		detected_type: string | null;
		confidence: number;
		extractable_fields: string[];
		missing_fields: string[];
		suggestions: string[];
		is_supported: boolean;
	}

	const DOCUMENT_TYPES = [
		{ value: 'gdot_contract_summary', label: 'GDOT Contract Summary' },
		{ value: 'gdot_job_setup', label: 'GDOT Job Setup' },
		{ value: 'gdot_roadway_log', label: 'GDOT Roadway Log' },
		{ value: 'weight_ticket', label: 'Weight Ticket' },
		{ value: 'material_certification', label: 'Material Certification' },
		{ value: 'plan_sheet', label: 'Plan Sheet' },
		{ value: 'inspection_report', label: 'Inspection Report' },
		{ value: 'change_order', label: 'Change Order' },
		{ value: 'daily_report', label: 'Daily Report' },
		{ value: 'other', label: 'Other / Unknown' }
	];

	let {
		report,
		filename
	}: {
		report: ParsingReport;
		filename: string;
	} = $props();

	let selectedType = $state('');
	let submitting = $state(false);
	let submitted = $state(false);
	// One-time snapshot of the prop into editable UI state (the panel can be
	// toggled after mount); it should not re-derive from `report`.
	// svelte-ignore state_referenced_locally
	let expanded = $state(!report.is_supported);

	async function submitFeedback() {
		if (!selectedType) return;
		submitting = true;
		try {
			const res = await fetch('/api/import/document-feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					filename,
					detected_type: report.detected_type,
					user_corrected_type: selectedType
				})
			});
			if (!res.ok) throw new Error('Failed to submit');
			submitted = true;
			toastStore.success('Thanks for the feedback!');
		} catch {
			toastStore.error('Could not submit feedback. Please try again.');
		} finally {
			submitting = false;
		}
	}
</script>

<div class="doc-feedback" class:unsupported={!report.is_supported}>
	<button
		class="feedback-header"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
		type="button"
	>
		<span class="feedback-icon">
			{#if report.is_supported}
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
				</svg>
			{:else}
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
				</svg>
			{/if}
		</span>
		<span class="feedback-title">
			{#if report.is_supported}
				{report.extractable_fields.length} of {report.extractable_fields.length + report.missing_fields.length} fields extracted
			{:else}
				{report.detected_type ? 'Unsupported document type' : 'Document type not recognized'}
			{/if}
		</span>
		<span class="feedback-chevron" class:open={expanded}>
			<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
				<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
			</svg>
		</span>
	</button>

	{#if expanded}
		<div class="feedback-body">
			{#if report.extractable_fields.length > 0}
				<div class="field-group">
					<p class="field-group-label extracted">
						<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
							<path fill-rule="evenodd" d="M13.854 3.646a.5.5 0 010 .708l-7 7a.5.5 0 01-.708 0l-3.5-3.5a.5.5 0 11.708-.708L6.5 10.293l6.646-6.647a.5.5 0 01.708 0z" clip-rule="evenodd"/>
						</svg>
						Extracted ({report.extractable_fields.length})
					</p>
					<div class="field-chips">
						{#each report.extractable_fields as field}
							<span class="chip chip-ok">{field}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if report.missing_fields.length > 0}
				<div class="field-group">
					<p class="field-group-label missing">
						<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
							<path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0 1A8 8 0 108 0a8 8 0 000 16z"/>
							<path d="M7.002 11a1 1 0 112 0 1 1 0 01-2 0zM7.1 4.995a.905.905 0 111.8 0l-.35 3.507a.552.552 0 01-1.1 0L7.1 4.995z"/>
						</svg>
						Could not find ({report.missing_fields.length})
					</p>
					<div class="field-chips">
						{#each report.missing_fields as field}
							<span class="chip chip-missing">{field}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if report.suggestions.length > 0}
				<div class="suggestions">
					<p class="suggestions-label">Suggestions</p>
					<ul class="suggestions-list">
						{#each report.suggestions as suggestion}
							<li>{suggestion}</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if !submitted}
				<div class="user-feedback">
					<p class="user-feedback-label">What type of document is this?</p>
					<div class="user-feedback-row">
						<select bind:value={selectedType} class="type-select" disabled={submitting}>
							<option value="">Select document type...</option>
							{#each DOCUMENT_TYPES as dt}
								<option value={dt.value}>{dt.label}</option>
							{/each}
						</select>
						<button
							type="button"
							class="btn-submit-feedback"
							onclick={submitFeedback}
							disabled={!selectedType || submitting}
						>
							{submitting ? 'Sending...' : 'Submit'}
						</button>
					</div>
					<p class="user-feedback-hint">Helps us add support for more document types.</p>
				</div>
			{:else}
				<div class="feedback-thanks">
					<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
						<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
					</svg>
					Feedback submitted — thank you!
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.doc-feedback {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		margin-top: 12px;
	}

	.doc-feedback.unsupported {
		border-color: var(--warn);
	}

	.feedback-header {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 14px 16px;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--text);
		font-size: 14px;
		text-align: left;
		min-height: 48px;
	}

	.feedback-header:hover {
		background: var(--surface-hover);
	}

	.feedback-icon {
		flex-shrink: 0;
		color: var(--good);
	}

	.unsupported .feedback-icon {
		color: var(--warn);
	}

	.feedback-title {
		flex: 1;
		font-weight: 500;
	}

	.feedback-chevron {
		flex-shrink: 0;
		color: var(--text-muted);
		transition: transform 0.2s;
	}

	.feedback-chevron.open {
		transform: rotate(180deg);
	}

	.feedback-body {
		padding: 0 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.field-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.field-group-label {
		display: flex;
		align-items: center;
		gap: 5px;
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.field-group-label.extracted {
		color: var(--good);
	}

	.field-group-label.missing {
		color: var(--warn);
	}

	.field-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		display: inline-block;
		padding: 3px 9px;
		border-radius: 99px;
		font-size: 12px;
		font-weight: 500;
	}

	.chip-ok {
		background: color-mix(in srgb, var(--good) 20%, transparent);
		color: var(--good);
		border: 1px solid color-mix(in srgb, var(--good) 30%, transparent);
	}

	.chip-missing {
		background: color-mix(in srgb, var(--warn) 20%, transparent);
		color: var(--warn);
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
	}

	.suggestions {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.suggestions-label {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.suggestions-list {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.suggestions-list li {
		font-size: 13px;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.user-feedback {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 4px;
		border-top: 1px solid var(--border);
	}

	.user-feedback-label {
		margin: 0;
		font-size: 13px;
		font-weight: 500;
		color: var(--text);
	}

	.user-feedback-row {
		display: flex;
		gap: 8px;
	}

	.type-select {
		flex: 1;
		height: 48px;
		padding: 0 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 14px;
		cursor: pointer;
	}

	.type-select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.btn-submit-feedback {
		height: 48px;
		padding: 0 18px;
		background: var(--accent);
		border: none;
		border-radius: 8px;
		color: var(--accent-text);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.btn-submit-feedback:hover:not(:disabled) {
		filter: brightness(1.05);
	}

	.btn-submit-feedback:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.user-feedback-hint {
		margin: 0;
		font-size: 11px;
		color: var(--text-muted);
	}

	.feedback-thanks {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 0;
		font-size: 13px;
		color: var(--good);
		border-top: 1px solid var(--border);
	}
</style>
