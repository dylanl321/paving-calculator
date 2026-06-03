<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import {
		OVERRIDABLE_CONSTANTS,
		constantDefault,
		type OrgOverrides
	} from '$lib/config/overrides';
	import type { RangeEntry } from '$lib/config';

	let { data } = $props();

	interface SettingsSaveResult {
		error?: string;
		hasLogo?: boolean;
		accentColor?: string | null;
		overrides?: OrgOverrides;
		org?: { name?: string } | null;
	}
	interface LogoUploadResult {
		error?: string;
	}
	interface NotificationPrefsResult {
		error?: string;
		prefs?: Record<string, boolean>;
	}
	interface EmailPreviewResult {
		html: string;
		subject: string;
		from: string;
	}

	const canEdit = $derived(data.settings?.role === 'owner' || data.settings?.role === 'admin');
	const machines = config.machines;
	const tackApplications = config.tack.field;
	const courseTypes = config.spreadTolerance;

	const ov: OrgOverrides = data.settings?.overrides ?? {};

	// --- Tab navigation ---
	type TabId = 'general' | 'defaults' | 'branding' | 'notifications';
	let activeTab = $state<TabId>('general');

	// --- Organization identity / branding ---
	const settingsOrg = data.settings?.org as
		| {
				name?: string;
				address?: string;
				superintendentEmail?: string;
				superintendentPhone?: string;
		  }
		| null
		| undefined;
	let orgName = $state(settingsOrg?.name ?? '');
	let orgAddress = $state(settingsOrg?.address ?? '');
	let superintendentEmail = $state(settingsOrg?.superintendentEmail ?? '');
	let superintendentPhone = $state(settingsOrg?.superintendentPhone ?? '');
	let accentColor = $state(data.settings?.accentColor ?? config.theme.dark.accent);
	let useCustomAccent = $state(!!data.settings?.accentColor);
	let hasLogo = $state(!!data.settings?.hasLogo);
	let logoFile = $state<File | null>(null);
	let logoPreview = $state<string | null>(null);

	// --- Email branding ---
	let emailFromName = $state(data.settings?.emailFromName ?? '');
	let emailReplyTo = $state(data.settings?.emailReplyTo ?? '');

	// --- Email preview ---
	let previewType = $state<'invitation' | 'verification' | 'password-reset'>('invitation');
	let previewHtml = $state('');
	let previewSubject = $state('');
	let previewFrom = $state('');
	let loadingPreview = $state(false);

	// --- Default job setup (seeded from YAML, overridden where present) ---
	let roadWidthFt = $state(ov.defaults?.roadWidthFt ?? config.defaults.roadWidthFt);
	let truckLoadTons = $state(ov.defaults?.truckLoadTons ?? config.defaults.truckLoadTons);
	let machine = $state(ov.defaults?.machine ?? config.defaults.machine);
	let wastePct = $state(ov.defaults?.wastePct ?? config.defaults.wastePct);
	let tackApplication = $state(ov.defaults?.tackApplication ?? config.defaults.tackApplication);
	let courseType = $state(ov.defaults?.courseType ?? config.defaults.courseType);
	let liftThicknessIn = $state(ov.defaults?.liftThicknessIn ?? 2);
	let mixType = $state(ov.defaults?.mixType ?? '');

	// --- Calculation constants ---
	const constantKeys = Object.keys(OVERRIDABLE_CONSTANTS);
	let constants = $state<Record<string, number>>(
		Object.fromEntries(
			constantKeys.map((k) => [k, ov.constants?.[k] ?? constantDefault(k)])
		)
	);

	// --- Tack presets ---
	function cloneRanges(src: RangeEntry[]): RangeEntry[] {
		return src.map((r) => ({ ...r }));
	}
	let tackField = $state<RangeEntry[]>(cloneRanges(ov.tack?.field ?? config.tack.field));
	let tackSpec = $state<RangeEntry[]>(cloneRanges(ov.tack?.spec ?? config.tack.spec));

	// --- Notification preferences ---
	let notificationPrefs = $state<Record<string, boolean>>(data.notificationPrefs ?? {});
	let savingNotifications = $state(false);
	let notificationMessage = $state('');
	let notificationMessageType = $state<'ok' | 'error'>('ok');

	let saving = $state(false);
	let message = $state('');
	let messageType = $state<'ok' | 'error'>('ok');

	function isConstOverridden(key: string): boolean {
		return constants[key] !== constantDefault(key);
	}
	function isDefaultOverridden(key: string, current: number | string): boolean {
		return current !== (config.defaults as Record<string, unknown>)[key];
	}

	function resetConstant(key: string) {
		constants[key] = constantDefault(key);
	}

	function onLogoChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		logoFile = file;
		if (logoPreview) URL.revokeObjectURL(logoPreview);
		logoPreview = file ? URL.createObjectURL(file) : null;
	}

	// Build a minimal overrides object: only include values that differ from YAML.
	function buildOverrides(): OrgOverrides {
		const out: OrgOverrides = {};

		const dOut: Record<string, number | string> = {};
		if (roadWidthFt !== config.defaults.roadWidthFt) dOut.roadWidthFt = roadWidthFt;
		if (truckLoadTons !== config.defaults.truckLoadTons) dOut.truckLoadTons = truckLoadTons;
		if (machine !== config.defaults.machine) dOut.machine = machine;
		if (wastePct !== config.defaults.wastePct) dOut.wastePct = wastePct;
		if (tackApplication !== config.defaults.tackApplication) dOut.tackApplication = tackApplication;
		if (courseType !== config.defaults.courseType) dOut.courseType = courseType;
		if (liftThicknessIn !== 2) dOut.liftThicknessIn = liftThicknessIn;
		if (mixType.trim()) dOut.mixType = mixType.trim();
		if (Object.keys(dOut).length) out.defaults = dOut;

		const cOut: Record<string, number> = {};
		for (const key of constantKeys) {
			if (constants[key] !== constantDefault(key)) cOut[key] = constants[key];
		}
		if (Object.keys(cOut).length) out.constants = cOut;

		const tOut: { field?: RangeEntry[]; spec?: RangeEntry[] } = {};
		if (JSON.stringify(tackField) !== JSON.stringify(config.tack.field)) tOut.field = tackField;
		if (JSON.stringify(tackSpec) !== JSON.stringify(config.tack.spec)) tOut.spec = tackSpec;
		if (tOut.field || tOut.spec) out.tack = tOut;

		return out;
	}

	async function save() {
		saving = true;
		message = '';
		try {
			const overrides = buildOverrides();
			const res = await fetch('/api/org/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					name: orgName.trim(),
					address: orgAddress.trim() || null,
					superintendentEmail: superintendentEmail.trim() || null,
					superintendentPhone: superintendentPhone.trim() || null,
					accentColor: useCustomAccent ? accentColor : null,
					emailFromName: emailFromName.trim() || null,
					emailReplyTo: emailReplyTo.trim() || null,
					overrides
				})
			});
			const result = (await res.json()) as SettingsSaveResult;
			if (!res.ok) {
				message = result.error || 'Failed to save settings';
				messageType = 'error';
				return;
			}

			// Upload logo if a new file was selected.
			if (logoFile) {
				const form = new FormData();
				form.append('logo', logoFile);
				const logoRes = await fetch('/api/org/logo', {
					method: 'POST',
					credentials: 'include',
					body: form
				});
				if (!logoRes.ok) {
					const lr = (await logoRes.json()) as LogoUploadResult;
					message = lr.error || 'Settings saved, but logo upload failed';
					messageType = 'error';
					hasLogo = result.hasLogo ?? hasLogo;
					orgSettingsStore.apply({
						accentColor: result.accentColor,
						overrides: result.overrides,
						orgName: result.org?.name
					});
					return;
				}
				hasLogo = true;
				logoFile = null;
				if (logoPreview) URL.revokeObjectURL(logoPreview);
				logoPreview = null;
			}

			orgSettingsStore.apply({
				accentColor: result.accentColor,
				hasLogo,
				overrides: result.overrides,
				orgName: result.org?.name
			});
			message = 'Settings saved';
			messageType = 'ok';
		} catch (e) {
			message = 'Network error while saving';
			messageType = 'error';
		} finally {
			saving = false;
		}
	}

	async function removeLogo() {
		if (!confirm('Remove the custom logo and revert to the default mark?')) return;
		const res = await fetch('/api/org/logo', { method: 'DELETE', credentials: 'include' });
		if (res.ok) {
			hasLogo = false;
			logoFile = null;
			if (logoPreview) URL.revokeObjectURL(logoPreview);
			logoPreview = null;
			orgSettingsStore.apply({ hasLogo: false });
		}
	}

	async function saveNotificationPrefs() {
		savingNotifications = true;
		notificationMessage = '';
		try {
			const res = await fetch('/api/user/notification-prefs', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ prefs: notificationPrefs })
			});
			const result = (await res.json()) as NotificationPrefsResult;
			if (!res.ok) {
				notificationMessage = result.error || 'Failed to save preferences';
				notificationMessageType = 'error';
				return;
			}
			notificationPrefs = result.prefs ?? notificationPrefs;
			notificationMessage = 'Notification preferences saved';
			notificationMessageType = 'ok';
		} catch (e) {
			notificationMessage = 'Network error while saving';
			notificationMessageType = 'error';
		} finally {
			savingNotifications = false;
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

<svelte:head>
	<title>Organization Settings — {config.app.name}</title>
</svelte:head>

<div class="settings-page">
	<header class="page-header">
		<div>
			<h2 class="page-title">Organization Settings</h2>
			<p class="page-subtitle">{orgName || data.settings?.org?.name}</p>
		</div>
		<a href="/dashboard" class="ghost-btn">Back to Dashboard</a>
	</header>

	{#if data.error}
		<div class="card error-card">
			<h3>Unable to load settings</h3>
			<p class="card-desc">{data.errorMessage}</p>
			<a href="/dashboard" class="ghost-btn">Back to Dashboard</a>
		</div>
	{:else}

	{#if !canEdit}
		<div class="notice">You have view-only access. Ask an owner or admin to change settings.</div>
	{/if}

	<!-- Tab navigation -->
	<div class="tabs">
		<button type="button" class="tab" class:active={activeTab === 'general'} onclick={() => activeTab = 'general'}>
			General
		</button>
		<button type="button" class="tab" class:active={activeTab === 'defaults'} onclick={() => activeTab = 'defaults'}>
			Defaults
		</button>
		<button type="button" class="tab" class:active={activeTab === 'branding'} onclick={() => activeTab = 'branding'}>
			Branding
		</button>
		<button type="button" class="tab" class:active={activeTab === 'notifications'} onclick={() => activeTab = 'notifications'}>
			Notifications
		</button>
	</div>

	<!-- General tab -->
	{#if activeTab === 'general'}
		<section class="card">
			<h3>General Information</h3>
			<p class="card-desc">Your organization's basic details.</p>

			<div class="field">
				<label for="orgName">Organization name</label>
				<input id="orgName" type="text" bind:value={orgName} disabled={!canEdit} />
			</div>

			<div class="field">
				<label for="orgAddress">Address</label>
				<textarea id="orgAddress" rows="3" bind:value={orgAddress} disabled={!canEdit} placeholder="Street, City, State ZIP"></textarea>
			</div>

			<div class="field">
				<label for="supEmail">Superintendent email</label>
				<input id="supEmail" type="email" bind:value={superintendentEmail} disabled={!canEdit} placeholder="superintendent@company.com" />
			</div>

			<div class="field">
				<label for="supPhone">Superintendent phone</label>
				<input id="supPhone" type="tel" bind:value={superintendentPhone} disabled={!canEdit} placeholder="(555) 123-4567" />
			</div>
		</section>
	{/if}

	<!-- Defaults tab -->
	{#if activeTab === 'defaults'}
		<section class="card">
			<h3>Default job setup</h3>
			<p class="card-desc">
				New jobs start from these values. They override the app defaults for your org.
			</p>

			<div class="grid">
				<div class="field">
					<label for="liftThickness">Lift thickness (in) {#if isDefaultOverridden('liftThicknessIn', liftThicknessIn)}<span class="badge">Overridden</span>{/if}</label>
					<input id="liftThickness" type="number" step="0.5" min="0.5" max="10" bind:value={liftThicknessIn} disabled={!canEdit} />
				</div>
				<div class="field">
					<label for="mixType">Mix type {#if mixType.trim()}<span class="badge">Set</span>{/if}</label>
					<input id="mixType" type="text" bind:value={mixType} disabled={!canEdit} placeholder="e.g. 9.5mm Superpave" />
				</div>
				<div class="field">
					<label for="roadWidth">Road width (ft) {#if isDefaultOverridden('roadWidthFt', roadWidthFt)}<span class="badge">Overridden</span>{/if}</label>
					<input id="roadWidth" type="number" step="0.5" min="1" max="60" bind:value={roadWidthFt} disabled={!canEdit} />
				</div>
				<div class="field">
					<label for="truckLoad">Truck load (tons) {#if isDefaultOverridden('truckLoadTons', truckLoadTons)}<span class="badge">Overridden</span>{/if}</label>
					<input id="truckLoad" type="number" step="0.5" min="1" max="40" bind:value={truckLoadTons} disabled={!canEdit} />
				</div>
				<div class="field">
					<label for="machine">Default machine {#if isDefaultOverridden('machine', machine)}<span class="badge">Overridden</span>{/if}</label>
					<select id="machine" bind:value={machine} disabled={!canEdit}>
						{#each machines as m (m.id)}
							<option value={m.id}>{m.label}</option>
						{/each}
					</select>
				</div>
				<div class="field">
					<label for="waste">Waste % {#if isDefaultOverridden('wastePct', wastePct)}<span class="badge">Overridden</span>{/if}</label>
					<input id="waste" type="number" step="1" min="0" max="50" bind:value={wastePct} disabled={!canEdit} />
				</div>
				<div class="field wide">
					<label for="tackApp">Default tack application {#if isDefaultOverridden('tackApplication', tackApplication)}<span class="badge">Overridden</span>{/if}</label>
					<select id="tackApp" bind:value={tackApplication} disabled={!canEdit}>
						{#each tackApplications as t (t.id)}
							<option value={t.id}>{t.label} ({t.min}–{t.max} {t.unit})</option>
						{/each}
					</select>
				</div>
				<div class="field wide">
					<label for="courseType">Default course type {#if isDefaultOverridden('courseType', courseType)}<span class="badge">Overridden</span>{/if}</label>
					<select id="courseType" bind:value={courseType} disabled={!canEdit}>
						{#each courseTypes as c (c.id)}
							<option value={c.id}>{c.label} (±{c.toleranceLbsSy} lbs/SY)</option>
						{/each}
					</select>
				</div>
			</div>
		</section>

		<!-- Calculation constants -->
		<section class="card">
			<h3>Calculation constants</h3>
			<p class="card-desc">
				Defaults are GDOT-derived. Only change these if your operation uses different values —
				they affect calculator results for everyone in your org.
			</p>

			<div class="grid">
				{#each constantKeys as key (key)}
					<div class="field">
						<label for={`const-${key}`}>
							{OVERRIDABLE_CONSTANTS[key].label}
							{#if isConstOverridden(key)}<span class="badge">Overridden</span>{/if}
						</label>
						<div class="const-row">
							<input
								id={`const-${key}`}
								type="number"
								step="0.05"
								min={OVERRIDABLE_CONSTANTS[key].min}
								max={OVERRIDABLE_CONSTANTS[key].max}
								bind:value={constants[key]}
								disabled={!canEdit}
							/>
							{#if canEdit && isConstOverridden(key)}
								<button type="button" class="reset-btn" onclick={() => resetConstant(key)}>Reset</button>
							{/if}
						</div>
						<span class="hint">Default {constantDefault(key)} · allowed {OVERRIDABLE_CONSTANTS[key].min}–{OVERRIDABLE_CONSTANTS[key].max}</span>
					</div>
				{/each}
			</div>
		</section>

		<!-- Tack presets -->
		<section class="card">
			<h3>Tack rate presets</h3>
			<p class="card-desc">Min/max shot-rate ranges (gal/SY) suggested in the tack calculator.</p>

			<div class="tack-group">
				<h4>Field ranges</h4>
				{#each tackField as t, i (t.id)}
					<div class="tack-row">
						<span class="tack-name">{t.label}</span>
						<label class="mini">min<input type="number" step="0.005" min="0" max="5" bind:value={tackField[i].min} disabled={!canEdit} /></label>
						<label class="mini">max<input type="number" step="0.005" min="0" max="5" bind:value={tackField[i].max} disabled={!canEdit} /></label>
					</div>
				{/each}
			</div>

			<div class="tack-group">
				<h4>Spec ranges</h4>
				{#each tackSpec as t, i (t.id)}
					<div class="tack-row">
						<span class="tack-name">{t.label}</span>
						<label class="mini">min<input type="number" step="0.005" min="0" max="5" bind:value={tackSpec[i].min} disabled={!canEdit} /></label>
						<label class="mini">max<input type="number" step="0.005" min="0" max="5" bind:value={tackSpec[i].max} disabled={!canEdit} /></label>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Branding tab -->
	{#if activeTab === 'branding'}
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
	{/if}

	<!-- Notifications tab -->
	{#if activeTab === 'notifications'}
		<section class="card">
			<h3>Notification Preferences</h3>
			<p class="card-desc">Control which notifications you receive for your account.</p>

			<div class="notification-group">
				<h4 class="group-heading">Email Notifications</h4>
				<label class="notification-toggle">
					<input
						type="checkbox"
						bind:checked={notificationPrefs.email_daily_summary}
					/>
					<div class="notification-info">
						<span class="notification-label">Daily Summary</span>
						<span class="notification-desc">Receive a daily email summary of job activity</span>
					</div>
				</label>
				<label class="notification-toggle">
					<input
						type="checkbox"
						bind:checked={notificationPrefs.email_invite}
					/>
					<div class="notification-info">
						<span class="notification-label">Organization Invites</span>
						<span class="notification-desc">Email notifications when invited to an organization</span>
					</div>
				</label>
				<label class="notification-toggle">
					<input
						type="checkbox"
						bind:checked={notificationPrefs.email_spec_alerts}
					/>
					<div class="notification-info">
						<span class="notification-label">Specification Alerts</span>
						<span class="notification-desc">Real-time alerts for spec violations via email</span>
					</div>
				</label>
				<label class="notification-toggle">
					<input
						type="checkbox"
						bind:checked={notificationPrefs.email_job_updates}
					/>
					<div class="notification-info">
						<span class="notification-label">Job Status Changes</span>
						<span class="notification-desc">Email when job site status changes</span>
					</div>
				</label>
			</div>

			<div class="notification-group">
				<h4 class="group-heading">Push Notifications</h4>
				<label class="notification-toggle">
					<input
						type="checkbox"
						bind:checked={notificationPrefs.push_spec_alerts}
					/>
					<div class="notification-info">
						<span class="notification-label">Specification Alerts</span>
						<span class="notification-desc">Browser push notifications for spec violations</span>
					</div>
				</label>
				<label class="notification-toggle">
					<input
						type="checkbox"
						bind:checked={notificationPrefs.push_job_updates}
					/>
					<div class="notification-info">
						<span class="notification-label">Job Updates</span>
						<span class="notification-desc">Browser push notifications for job site updates</span>
					</div>
				</label>
			</div>

			<div class="notification-save-bar">
				{#if notificationMessage}
					<span class="save-msg" class:error={notificationMessageType === 'error'}>{notificationMessage}</span>
				{/if}
				<button type="button" class="save-btn" onclick={saveNotificationPrefs} disabled={savingNotifications}>
					{savingNotifications ? 'Saving…' : 'Save Preferences'}
				</button>
			</div>
		</section>
	{/if}

	{#if canEdit && activeTab !== 'notifications'}
		<div class="save-bar">
			{#if message}
				<span class="save-msg" class:error={messageType === 'error'}>{message}</span>
			{/if}
			<button type="button" class="save-btn" onclick={save} disabled={saving}>
				{saving ? 'Saving…' : 'Save settings'}
			</button>
		</div>
	{/if}

	{/if}
</div>

<style>
	.settings-page {
		max-width: 880px;
		margin: 0 auto;
		padding: 16px;
		padding-bottom: 96px;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
	}

	.page-title {
		margin: 0;
		font-size: 1.5rem;
		color: var(--text);
	}

	.page-subtitle {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 0.95rem;
	}

	.notice {
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius);
		padding: 12px 16px;
		color: var(--text-muted);
		margin-bottom: 16px;
	}

	.tabs {
		display: flex;
		gap: 0;
		border-bottom: 1px solid var(--border);
		margin-bottom: 16px;
		overflow-x: auto;
	}

	.tab {
		min-height: 48px;
		padding: 0 20px;
		background: transparent;
		border: none;
		border-bottom: 3px solid transparent;
		color: var(--text-muted);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;
	}

	.tab:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.03);
	}

	.tab.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}

	.card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.error-card {
		border-left: 3px solid var(--bad);
	}
	.error-card h3 {
		color: var(--bad);
		margin: 0 0 4px;
	}

	.card h3 {
		margin: 0 0 4px;
		font-size: 1.15rem;
		color: var(--text);
	}

	.card-desc {
		margin: 0 0 16px;
		color: var(--text-muted);
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 14px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 14px;
	}

	.grid .field {
		margin-bottom: 0;
	}

	.field.wide {
		grid-column: 1 / -1;
	}

	.field label,
	.field-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
		display: flex;
		align-items: center;
		gap: 8px;
	}

	input[type='text'],
	input[type='email'],
	input[type='tel'],
	input[type='number'],
	select,
	textarea {
		width: 100%;
		min-height: 48px;
		padding: 0 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 1rem;
		font-family: inherit;
	}

	textarea {
		padding: 14px;
		resize: vertical;
		min-height: 80px;
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(242, 192, 55, 0.18);
	}

	input:disabled,
	select:disabled,
	textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.hint {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin: 0;
	}

	.badge {
		font-size: 0.66rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--accent-text);
		background: var(--accent);
		padding: 2px 7px;
		border-radius: 999px;
	}

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

	.ghost-btn {
		min-height: 48px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 16px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.92rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
	}

	.ghost-btn:hover {
		border-color: var(--accent);
	}

	.ghost-btn.danger:hover {
		border-color: var(--bad);
		color: var(--bad);
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

	.const-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.reset-btn {
		min-height: 48px;
		padding: 0 12px;
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.82rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.reset-btn:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.tack-group {
		margin-top: 14px;
	}

	.tack-group h4 {
		margin: 0 0 8px;
		font-size: 0.95rem;
		color: var(--text);
	}

	.tack-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-top: 1px solid var(--border);
	}

	.tack-name {
		flex: 1;
		min-width: 0;
		color: var(--text);
		font-size: 0.9rem;
	}

	.mini {
		flex-direction: row;
		align-items: center;
		gap: 6px;
		font-size: 0.78rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.mini input {
		width: 92px;
		min-height: 44px;
	}

	.save-bar {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 14px;
		padding: 14px 0;
		background: linear-gradient(180deg, transparent, var(--bg) 40%);
	}

	.save-msg {
		color: var(--good);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.save-msg.error {
		color: var(--bad);
	}

	.save-btn {
		min-height: 48px;
		padding: 0 28px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
	}

	.save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.notification-group {
		margin-bottom: 24px;
	}

	.notification-group:last-of-type {
		margin-bottom: 20px;
	}

	.group-heading {
		margin: 0 0 12px;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}

	.notification-toggle {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px;
		margin-bottom: 8px;
		border-radius: var(--radius);
		cursor: pointer;
		min-height: 48px;
		transition: background 0.15s;
	}

	.notification-toggle:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.notification-toggle input[type="checkbox"] {
		width: 20px;
		min-height: 20px;
		height: 20px;
		margin-top: 2px;
		flex-shrink: 0;
		cursor: pointer;
	}

	.notification-info {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.notification-label {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}

	.notification-desc {
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.notification-save-bar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 14px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
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

	@media (max-width: 640px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
