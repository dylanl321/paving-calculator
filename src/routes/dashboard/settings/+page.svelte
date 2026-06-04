<script lang="ts">
	import { config } from '$lib/config';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import {
		OVERRIDABLE_CONSTANTS,
		constantDefault,
		type OrgOverrides
	} from '$lib/config/overrides';
	import type { RangeEntry } from '$lib/config';
	import './_components/settings.css';
	import { type TabId, type SettingsSaveResult, type LogoUploadResult } from './_components/shared';
	import GeneralTab from './_components/GeneralTab.svelte';
	import DefaultsTab from './_components/DefaultsTab.svelte';
	import BrandingTab from './_components/BrandingTab.svelte';
	import NotificationsTab from './_components/NotificationsTab.svelte';
	import ReportsTab from './_components/ReportsTab.svelte';
	import MaterialsTab from './_components/MaterialsTab.svelte';
	import MixLibraryTab from './_components/MixLibraryTab.svelte';
	import FeatureDiscovery from '$lib/components/FeatureDiscovery.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';

	let { data } = $props();

	const canEdit = $derived(data.settings?.role === 'owner' || data.settings?.role === 'admin');

	// One-time snapshots of loaded settings, used to seed the editable form state
	// below; intentionally not re-derived from `data`.
	// svelte-ignore state_referenced_locally
	const ov: OrgOverrides = data.settings?.overrides ?? {};

	// --- Tab navigation ---
	let activeTab = $state<TabId>('general');

	// --- Organization identity / branding ---
	// svelte-ignore state_referenced_locally
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
	// svelte-ignore state_referenced_locally
	let accentColor = $state(data.settings?.accentColor ?? config.theme.dark.accent);
	// svelte-ignore state_referenced_locally
	let useCustomAccent = $state(!!data.settings?.accentColor);
	// svelte-ignore state_referenced_locally
	let hasLogo = $state(!!data.settings?.hasLogo);
	let logoFile = $state<File | null>(null);
	let logoPreview = $state<string | null>(null);

	// --- Email branding ---
	// svelte-ignore state_referenced_locally
	let emailFromName = $state(data.settings?.emailFromName ?? '');
	// svelte-ignore state_referenced_locally
	let emailReplyTo = $state(data.settings?.emailReplyTo ?? '');

	// --- Default job setup (seeded from YAML, overridden where present) ---
	let roadWidthFt = $state(ov.defaults?.roadWidthFt ?? config.defaults.roadWidthFt);
	let truckLoadTons = $state(ov.defaults?.truckLoadTons ?? config.defaults.truckLoadTons);
	let machine = $state(ov.defaults?.machine ?? config.defaults.machine);
	let wastePct = $state(ov.defaults?.wastePct ?? config.defaults.wastePct);
	let tackApplication = $state(ov.defaults?.tackApplication ?? config.defaults.tackApplication);
	let courseType = $state(ov.defaults?.courseType ?? config.defaults.courseType);
	let liftThicknessIn = $state(ov.defaults?.liftThicknessIn ?? 2);
	let mixType = $state(ov.defaults?.mixType ?? '');
	let defaultPlant = $state(ov.defaults?.defaultPlant ?? '');
	let defaultCrewSize = $state(ov.defaults?.defaultCrewSize ?? 3);
	let pavingWindowStart = $state(ov.defaults?.pavingWindowStart ?? '06:00');
	let pavingWindowEnd = $state(ov.defaults?.pavingWindowEnd ?? '18:00');
	let minPavingTempF = $state(ov.defaults?.minPavingTempF ?? 40);
	let maxPavingTempF = $state(ov.defaults?.maxPavingTempF ?? 100);
	let minMatTempF = $state(ov.defaults?.minMatTempF ?? 275);
	let defaultCompactionPasses = $state(ov.defaults?.defaultCompactionPasses ?? 3);

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

	// --- Spread tolerances ---
	let spreadTolerances = $state<Record<string, number>>(ov.spreadTolerances ?? {});

	let saving = $state(false);
	let message = $state('');
	let messageType = $state<'ok' | 'error'>('ok');

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
		if (defaultPlant.trim()) dOut.defaultPlant = defaultPlant.trim();
		if (defaultCrewSize !== 3) dOut.defaultCrewSize = defaultCrewSize;
		if (pavingWindowStart !== '06:00') dOut.pavingWindowStart = pavingWindowStart;
		if (pavingWindowEnd !== '18:00') dOut.pavingWindowEnd = pavingWindowEnd;
		if (minPavingTempF !== 40) dOut.minPavingTempF = minPavingTempF;
		if (maxPavingTempF !== 100) dOut.maxPavingTempF = maxPavingTempF;
		if (minMatTempF !== 275) dOut.minMatTempF = minMatTempF;
		if (defaultCompactionPasses !== 3) dOut.defaultCompactionPasses = defaultCompactionPasses;
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

		const stOut: Record<string, number> = {};
		for (const entry of config.spreadTolerance) {
			const val = spreadTolerances[entry.id];
			if (val !== undefined && val !== entry.toleranceLbsSy) {
				stOut[entry.id] = val;
			}
		}
		if (Object.keys(stOut).length) out.spreadTolerances = stOut;

		return out;
	}

	async function save() {
		saving = true;
		message = '';
		try {
			const overrides = buildOverrides();
			const result = await api.put<SettingsSaveResult>('/api/org/settings', {
				name: orgName.trim(),
				address: orgAddress.trim() || null,
				superintendentEmail: superintendentEmail.trim() || null,
				superintendentPhone: superintendentPhone.trim() || null,
				accentColor: useCustomAccent ? accentColor : null,
				emailFromName: emailFromName.trim() || null,
				emailReplyTo: emailReplyTo.trim() || null,
				overrides
			});

			// Upload logo if a new file was selected.
			if (logoFile) {
				const form = new FormData();
				form.append('logo', logoFile);
				try {
					await api.post('/api/org/logo', form);
					hasLogo = true;
					logoFile = null;
					if (logoPreview) URL.revokeObjectURL(logoPreview);
					logoPreview = null;
					toastStore.success('Logo uploaded successfully');
				} catch {
					message = 'Settings saved, but logo upload failed';
					messageType = 'error';
					toastStore.error(message);
					hasLogo = result.hasLogo ?? hasLogo;
					orgSettingsStore.apply({
						accentColor: result.accentColor,
						overrides: result.overrides,
						orgName: result.org?.name
					});
					return;
				}
			}

			orgSettingsStore.apply({
				accentColor: result.accentColor,
				hasLogo,
				overrides: result.overrides,
				orgName: result.org?.name
			});
			message = 'Settings saved';
			messageType = 'ok';
			toastStore.success('Settings saved successfully');
		} catch (e) {
			message = 'Network error while saving';
			messageType = 'error';
		} finally {
			saving = false;
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

	<FeatureDiscovery feature="notifications" condition={true} />

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
		{#if canEdit}
			<button type="button" class="tab" class:active={activeTab === 'reports'} onclick={() => activeTab = 'reports'}>
				Reports
			</button>
			<button type="button" class="tab" class:active={activeTab === 'materials'} onclick={() => activeTab = 'materials'}>
				Materials
			</button>
			<button type="button" class="tab" class:active={activeTab === 'mixes'} onclick={() => activeTab = 'mixes'}>
				Mix Library
			</button>
		{/if}
	</div>

	{#if activeTab === 'general'}
		<GeneralTab
			{canEdit}
			bind:orgName
			bind:orgAddress
			bind:superintendentEmail
			bind:superintendentPhone
		/>
	{:else if activeTab === 'defaults'}
		<DefaultsTab
			{canEdit}
			bind:roadWidthFt
			bind:truckLoadTons
			bind:machine
			bind:wastePct
			bind:tackApplication
			bind:courseType
			bind:liftThicknessIn
			bind:mixType
			bind:defaultPlant
			bind:defaultCrewSize
			bind:pavingWindowStart
			bind:pavingWindowEnd
			bind:minPavingTempF
			bind:maxPavingTempF
			bind:minMatTempF
			bind:defaultCompactionPasses
			bind:constants
			bind:tackField
			bind:tackSpec
			bind:spreadTolerances
		/>
	{:else if activeTab === 'branding'}
		<BrandingTab
			{canEdit}
			bind:accentColor
			bind:useCustomAccent
			bind:emailFromName
			bind:emailReplyTo
			bind:hasLogo
			bind:logoFile
			bind:logoPreview
		/>
	{:else if activeTab === 'notifications'}
		<NotificationsTab initialPrefs={data.notificationPrefs ?? {}} />
	{:else if activeTab === 'reports'}
		<ReportsTab initialSchedules={data.emailReportSchedules ?? []} />
	{:else if activeTab === 'materials'}
		<MaterialsTab {canEdit} />
	{:else if activeTab === 'mixes'}
		<MixLibraryTab {canEdit} initialPresets={data.mixPresets ?? []} />
	{/if}

	{#if canEdit && activeTab !== 'notifications' && activeTab !== 'reports' && activeTab !== 'materials' && activeTab !== 'mixes'}
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
