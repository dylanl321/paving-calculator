<script lang="ts">
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import type { EmailPreviewResult, LogoUploadResult } from './shared';
	import { confirmStore } from '$lib/stores/confirm.svelte';

	let {
		canEdit,
		accentColor = $bindable(),
		useCustomAccent = $bindable(),
		emailFromName = $bindable(),
		emailReplyTo = $bindable(),
		hasLogo = $bindable(),
		logoFile = $bindable(),
		logoPreview = $bindable()
	}: {
		canEdit: boolean;
		accentColor: string;
		useCustomAccent: boolean;
		emailFromName: string;
		emailReplyTo: string;
		hasLogo: boolean;
		logoFile: File | null;
		logoPreview: string | null;
	} = $props();

	// --- Email preview ---
	let previewType = $state<'invitation' | 'verification' | 'password-reset'>('invitation');
	let previewHtml = $state('');
	let previewSubject = $state('');
	let previewFrom = $state('');
	let loadingPreview = $state(false);

	function onLogoChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		logoFile = file;
		if (logoPreview) URL.revokeObjectURL(logoPreview);
		logoPreview = file ? URL.createObjectURL(file) : null;
	}

	async function removeLogo() {
		const confirmed = await confirmStore.ask({
			title: 'Remove Logo',
			message: 'Remove the custom logo and revert to the default mark?',
			confirmLabel: 'Remove',
			destructive: true
		});
		if (!confirmed) return;
		const res = await fetch('/api/org/logo', { method: 'DELETE', credentials: 'include' });
		if (res.ok) {
			hasLogo = false;
			logoFile = null;
			if (logoPreview) URL.revokeObjectURL(logoPreview);
			logoPreview = null;
			orgSettingsStore.apply({ hasLogo: false });
		}
	}

	const currentLogoSrc = $derived(
		logoPreview ?? (hasLogo ? `/api/org/logo?t=${Date.now()}` : null)
	);

	async function loadPreview() {
		loadingPreview = true;
		try {
			const res = await fetch(`/api/org/email-preview?type=${previewType}`, {
				credentials: 'include'
			});
			if (!res.ok) {
				const error = await res.json();
				console.error('Preview error:', error);
				return;
			}
			const data = (await res.json()) as EmailPreviewResult;
			previewHtml = data.html;
			previewSubject = data.subject;
			previewFrom = data.from;
		} catch (e) {
			console.error('Failed to load preview:', e);
		} finally {
			loadingPreview = false;
		}
	}
</script>

<section class="card">
	<h3>Logo and brand color</h3>
	<p class="card-desc">Your company logo and brand color across the app.</p>

	<div class="field">
		<span class="field-label">Logo</span>
		<div class="logo-row">
			<div class="logo-preview">
				{#if currentLogoSrc}
					<img src={currentLogoSrc} alt="Org logo preview" />
				{:else}
					<img src="/logo-mark.png" alt="Default logo" />
					<span class="logo-hint">Default</span>
				{/if}
			</div>
			{#if canEdit}
				<div class="logo-actions">
					<label class="ghost-btn file-btn">
						{hasLogo || logoFile ? 'Replace logo' : 'Upload logo'}
						<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange={onLogoChange} />
					</label>
					{#if hasLogo}
						<button type="button" class="ghost-btn danger" onclick={removeLogo}>Remove</button>
					{/if}
					<p class="hint">PNG, JPEG, WebP, or SVG. Max 512 KB.</p>
				</div>
			{/if}
		</div>
	</div>

	<div class="field">
		<label class="checkbox-row">
			<input type="checkbox" bind:checked={useCustomAccent} disabled={!canEdit} />
			Use a custom brand accent color
		</label>
		{#if useCustomAccent}
			<div class="color-row">
				<input type="color" bind:value={accentColor} disabled={!canEdit} />
				<input type="text" class="color-hex" bind:value={accentColor} disabled={!canEdit} />
				<span class="swatch" style="background:{accentColor}"></span>
			</div>
		{/if}
	</div>
</section>

<!-- Email branding -->
<section class="card">
	<h3>Email Branding</h3>
	<p class="card-desc">Customize how emails from your organization appear to recipients.</p>

	<div class="field">
		<label for="emailFromName">From name</label>
		<input
			id="emailFromName"
			type="text"
			placeholder="PaveRate"
			bind:value={emailFromName}
			disabled={!canEdit}
			maxlength="100"
		/>
		<span class="hint">The name shown in the "From" field of emails (max 100 characters)</span>
	</div>

	<div class="field">
		<label for="emailReplyTo">Reply-To address</label>
		<input
			id="emailReplyTo"
			type="email"
			placeholder="support@yourcompany.com"
			bind:value={emailReplyTo}
			disabled={!canEdit}
		/>
		<span class="hint">Optional email address for replies</span>
	</div>

	<div class="preview-section">
		<h4 style="margin:0 0 12px;font-size:0.95rem;color:var(--text);">Email Preview</h4>
		<div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;">
			<select bind:value={previewType} style="flex:1;max-width:220px;" onchange={loadPreview}>
				<option value="invitation">Team Invitation</option>
				<option value="verification">Email Verification</option>
				<option value="password-reset">Password Reset</option>
			</select>
			<button type="button" class="ghost-btn" onclick={loadPreview} disabled={loadingPreview}>
				{loadingPreview ? 'Loading...' : 'Refresh Preview'}
			</button>
		</div>

		{#if previewHtml}
			<div class="preview-meta">
				<div><strong>From:</strong> {previewFrom}</div>
				<div><strong>Subject:</strong> {previewSubject}</div>
			</div>
			<div class="preview-frame">
				<iframe
					title="Email preview"
					srcDoc={previewHtml}
					style="width:100%;height:600px;border:none;background:var(--surface);border-radius:8px;"
				></iframe>
			</div>
		{:else}
			<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:0.9rem;">
				Click "Refresh Preview" to see how your emails will look
			</div>
		{/if}
	</div>
</section>

<style>
	.checkbox-row {
		flex-direction: row;
		align-items: center;
		gap: 10px;
		cursor: pointer;
		min-height: 44px;
		padding: 0 4px;
	}

	.checkbox-row input {
		width: 20px;
		min-height: 20px;
		height: 20px;
	}

	.color-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
	}

	.color-row input[type='color'] {
		width: 52px;
		min-height: 48px;
		padding: 4px;
		cursor: pointer;
	}

	.color-hex {
		max-width: 140px;
	}

	.swatch {
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 1px solid var(--border);
	}

	.logo-row {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		flex-wrap: wrap;
	}

	.logo-preview {
		width: 88px;
		height: 88px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--bg);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 4px;
		overflow: hidden;
	}

	.logo-preview img {
		max-width: 100%;
		max-height: 64px;
		object-fit: contain;
	}

	.logo-hint {
		font-size: 0.66rem;
		color: var(--text-muted);
	}

	.logo-actions {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: flex-start;
	}

	.file-btn {
		position: relative;
		overflow: hidden;
	}

	.file-btn input[type='file'] {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.preview-section {
		margin-top: 24px;
		padding-top: 24px;
		border-top: 1px solid var(--border);
	}

	.preview-meta {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px 14px;
		margin-bottom: 12px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.preview-meta div {
		margin: 4px 0;
	}

	.preview-meta strong {
		color: var(--text);
		font-weight: 600;
	}

	.preview-frame {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}
</style>
