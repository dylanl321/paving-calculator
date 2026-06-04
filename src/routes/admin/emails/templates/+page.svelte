<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';

	interface TemplateData {
		key: string;
		source: 'system_default' | 'db_override';
		subject: string;
		body_html: string;
		body_text: string | null;
		updated_at: number | null;
		updated_by: string | null;
	}

	interface EditorState {
		key: string;
		subject: string;
		body_html: string;
		body_text: string;
	}

	let templates = $state<TemplateData[]>([]);
	let loading = $state(true);
	let editor = $state<EditorState | null>(null);
	let previewHtml = $state('');
	let saving = $state(false);
	let resetting = $state(false);
	let debounceTimer: number | null = null;

	const templateNames: Record<string, string> = {
		password_reset: 'Password Reset',
		admin_notification: 'Admin Notification',
		email_verification: 'Email Verification',
		invite: 'Invite',
		welcome: 'Welcome',
		eod_summary: 'End of Day Summary'
	};

	function fillSampleVars(html: string): string {
		const samples: Record<string, string> = {
			reset_link: 'https://example.com/reset/sample-token',
			expiry_hours: '24',
			alert_title: 'Sample Admin Alert',
			severity: 'medium',
			timestamp: new Date().toLocaleString(),
			message: 'This is a sample admin notification message.',
			details: 'org_id: sample-org\nuser_id: sample-user',
			org_name: 'Acme Paving Co.',
			user_email: 'admin@acme.com',
			invite_link: 'https://example.com/invite/sample-token',
			invited_by: 'Jane Smith',
			expiry_days: '7',
			accent_color: '#f5a623',
			logo_url: '',
			app_url: 'https://paverate.com',
			first_name: 'John',
			total_tons: '142.5',
			total_sqyd: '2847',
			total_loads: '23',
			mix_breakdown: 'Type A (9.5mm): 85.0 tons\nType B (12.5mm): 57.5 tons',
			crew_notes: 'Good day. Weather was clear. Finished ahead of schedule.',
			report_url: 'https://example.com/report/sample',
			date: new Date().toLocaleDateString(),
			name: 'John Doe',
			verify_link: 'https://example.com/verify/sample-token'
		};
		return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
			const lk = key.toLowerCase();
			const found = Object.keys(samples).find((k) => k.toLowerCase() === lk);
			return found ? samples[found] : `[${key}]`;
		});
	}

	function updatePreview(html: string) {
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = window.setTimeout(() => {
			previewHtml = fillSampleVars(html);
		}, 300);
	}

	async function fetchTemplates() {
		loading = true;
		try {
			const resp = await fetch('/api/admin/email-templates');
			if (!resp.ok) throw new Error('Failed to load templates');
			const data = (await resp.json()) as { templates: TemplateData[] };
			templates = data.templates;
		} catch (err) {
			toastStore.error('Failed to load templates');
		} finally {
			loading = false;
		}
	}

	function openEditor(template: TemplateData) {
		editor = {
			key: template.key,
			subject: template.subject,
			body_html: template.body_html,
			body_text: template.body_text || ''
		};
		updatePreview(template.body_html);
	}

	function closeEditor() {
		editor = null;
		previewHtml = '';
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	}

	async function saveTemplate() {
		if (!editor) return;
		saving = true;
		try {
			const resp = await fetch('/api/admin/email-templates', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					key: editor.key,
					subject: editor.subject,
					body_html: editor.body_html,
					body_text: editor.body_text || null
				})
			});
			if (!resp.ok) throw new Error('Failed to save template');
			toastStore.success('Template saved');
			closeEditor();
			await fetchTemplates();
		} catch (err) {
			toastStore.error('Failed to save template');
		} finally {
			saving = false;
		}
	}

	async function resetTemplate(key: string) {
		if (!confirm('Reset this template to the system default?')) return;
		resetting = true;
		try {
			const resp = await fetch(`/api/admin/email-templates?key=${encodeURIComponent(key)}`, {
				method: 'DELETE'
			});
			if (!resp.ok) throw new Error('Failed to reset template');
			toastStore.success('Template reset to default');
			await fetchTemplates();
		} catch (err) {
			toastStore.error('Failed to reset template');
		} finally {
			resetting = false;
		}
	}

	$effect(() => {
		fetchTemplates();
	});

	$effect(() => {
		if (editor) {
			updatePreview(editor.body_html);
		}
	});
</script>

<div class="page">
	<header class="admin-page-header">
		<div>
			<h1 class="admin-page-title">Email Templates</h1>
			<p class="admin-page-subtitle">Customize email templates sent by the system.</p>
		</div>
	</header>

	<nav class="email-subnav">
		<a href="/admin/emails" class="subnav-link">Log</a>
		<a href="/admin/emails/templates" class="subnav-link subnav-active">Templates</a>
	</nav>

	{#if loading}
		<div class="loading">Loading templates...</div>
	{:else}
		<div class="template-list">
			{#each templates as template}
				<div class="template-card">
					<div class="template-header">
						<div class="template-info">
							<h2 class="template-name">{templateNames[template.key] || template.key}</h2>
							<span class="badge" class:badge-custom={template.source === 'db_override'}>
								{template.source === 'db_override' ? 'Custom' : 'Default'}
							</span>
						</div>
						<div class="template-actions">
							<button class="btn btn-primary" onclick={() => openEditor(template)}>Edit</button>
							{#if template.source === 'db_override'}
								<button
									class="btn btn-secondary"
									onclick={() => resetTemplate(template.key)}
									disabled={resetting}
								>
									Reset to Default
								</button>
							{/if}
						</div>
					</div>
					{#if template.updated_at}
						<div class="template-meta">
							Last updated {new Date(template.updated_at * 1000).toLocaleString()}
							{#if template.updated_by}
								by {template.updated_by}
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if editor}
	<div class="modal-backdrop" onclick={closeEditor}></div>
	<div class="modal">
		<div class="modal-header">
			<h2 class="modal-title">Edit Template: {templateNames[editor.key] || editor.key}</h2>
			<button class="btn-close" onclick={closeEditor}>✕</button>
		</div>

		<div class="modal-body">
			<div class="editor-layout">
				<div class="editor-panel">
					<div class="field">
						<label class="field-label" for="subject">Subject</label>
						<input
							id="subject"
							type="text"
							class="field-input"
							bind:value={editor.subject}
						/>
					</div>

					<div class="field">
						<label class="field-label" for="body_html">HTML Body</label>
						<textarea
							id="body_html"
							class="field-textarea field-textarea-tall"
							bind:value={editor.body_html}
						></textarea>
					</div>

					<div class="field">
						<label class="field-label" for="body_text">Plain Text Body (optional)</label>
						<textarea
							id="body_text"
							class="field-textarea"
							bind:value={editor.body_text}
						></textarea>
					</div>
				</div>

				<div class="preview-panel">
					<div class="preview-header">Preview</div>
					<iframe class="preview-iframe" srcdoc={previewHtml} title="Email Preview"></iframe>
				</div>
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-secondary" onclick={closeEditor} disabled={saving}>Cancel</button>
			<button class="btn btn-primary" onclick={saveTemplate} disabled={saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	</div>
{/if}

<style>
	.page {
		width: 100%;
	}

	.email-subnav {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--border);
		padding-bottom: 0;
	}

	.subnav-link {
		padding: 0.625rem 1rem;
		font-size: 0.9375rem;
		font-weight: 500;
		color: var(--text-muted);
		text-decoration: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 0.15s, border-color 0.15s;
		min-height: 48px;
		display: flex;
		align-items: center;
	}

	.subnav-link:hover {
		color: var(--text);
	}

	.subnav-active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.loading {
		padding: 2rem;
		text-align: center;
		color: var(--text-muted);
	}

	.template-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.template-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem;
	}

	.template-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.template-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.template-name {
		font-size: 1.125rem;
		font-weight: 600;
		margin: 0;
		color: var(--text);
	}

	.badge {
		display: inline-block;
		padding: 0.25rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 600;
		border-radius: 0.25rem;
		background: var(--surface-alt);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}

	.badge-custom {
		background: #f5a623;
		color: #1a1a2e;
	}

	.template-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.template-meta {
		margin-top: 0.75rem;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: var(--touch);
		padding: 0 1.25rem;
		font-size: 0.9375rem;
		font-weight: 600;
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		transition: background-color 0.15s, opacity 0.15s;
		text-decoration: none;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background: var(--accent);
		color: #1a1a2e;
	}

	.btn-primary:hover:not(:disabled) {
		background: #ffb84d;
	}

	.btn-secondary {
		background: var(--surface-alt);
		color: var(--text);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		z-index: 1000;
	}

	.modal {
		position: fixed;
		inset: 5vh 5vw;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		display: flex;
		flex-direction: column;
		z-index: 1001;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	.modal-title {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0;
		color: var(--text);
	}

	.btn-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius);
		transition: background-color 0.15s;
	}

	.btn-close:hover {
		background: var(--surface-hover);
	}

	.modal-body {
		flex: 1;
		overflow: auto;
		padding: 1.5rem;
	}

	.editor-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		min-height: 100%;
	}

	.editor-panel {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text);
	}

	.field-input {
		min-height: var(--touch);
		padding: 0 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9375rem;
		font-family: inherit;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.field-textarea {
		min-height: 8rem;
		padding: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.875rem;
		font-family: 'Courier New', monospace;
		resize: vertical;
	}

	.field-textarea-tall {
		min-height: 24rem;
		flex: 1;
	}

	.field-textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.preview-panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		position: sticky;
		top: 0;
		max-height: calc(100vh - 20rem);
	}

	.preview-header {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text);
	}

	.preview-iframe {
		flex: 1;
		width: 100%;
		min-height: 30rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: #ffffff;
	}

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1.25rem 1.5rem;
		border-top: 1px solid var(--border);
		background: var(--surface);
	}

	@media (max-width: 1024px) {
		.editor-layout {
			grid-template-columns: 1fr;
		}

		.preview-panel {
			position: static;
			max-height: none;
		}

		.preview-iframe {
			min-height: 20rem;
		}
	}

	@media (max-width: 640px) {
		.modal {
			inset: 0;
			border-radius: 0;
		}

		:global(.admin-page-title) {
			font-size: 1.5rem;
		}

		.template-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.template-actions {
			width: 100%;
		}

		.template-actions .btn {
			flex: 1;
		}

		.modal-body {
			padding: 1rem;
		}

		.editor-layout {
			gap: 1rem;
		}
	}
</style>
