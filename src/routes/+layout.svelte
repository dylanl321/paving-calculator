<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/stores';
	import { config } from '$lib/config';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import PwaInstallPrompt from '$lib/components/PwaInstallPrompt.svelte';
	import Toast from '$lib/components/ui/Toast.svelte';
	import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte';
	import OnboardingOverlay from '$lib/components/ui/OnboardingOverlay.svelte';
	import { offlineStore } from '$lib/stores/offline.svelte';
	import '../app.css';

	let { children } = $props();

	// Auth pages (login/register/forgot-password/reset-password) render full-bleed without the app shell chrome.
	const isStandalone = $derived(
		$page.url.pathname === '/' ||
			$page.url.pathname === '/login' ||
			$page.url.pathname === '/register' ||
			$page.url.pathname === '/forgot-password' ||
			$page.url.pathname === '/reset-password' ||
			$page.url.pathname === '/dashboard/onboarding'
	);

	const themeTokens = $derived(config.theme[themeStore.mode]);

	// Org branding can override the accent color. Derive a readable text color
	// from the accent's luminance so labels on accent buttons stay legible.
	function accentTextFor(hex: string): string {
		const m = hex.replace('#', '');
		const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
		const r = parseInt(full.slice(0, 2), 16);
		const g = parseInt(full.slice(2, 4), 16);
		const b = parseInt(full.slice(4, 6), 16);
		const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		return luminance > 0.6 ? '#1b2228' : '#ffffff';
	}

	const accent = $derived(orgSettingsStore.accentColor ?? themeTokens.accent);
	const accentText = $derived(
		orgSettingsStore.accentColor ? accentTextFor(orgSettingsStore.accentColor) : themeTokens.accentText
	);

	const themeStyle = $derived(
		[
			`--bg:${themeTokens.bg}`,
			`--surface:${themeTokens.surface}`,
			`--surface-alt:${themeTokens.surfaceAlt}`,
			`--surface-hover:${themeTokens.surfaceHover}`,
			`--border:${themeTokens.border}`,
			`--text:${themeTokens.text}`,
			`--text-muted:${themeTokens.textMuted}`,
			`--accent:${accent}`,
			`--accent-text:${accentText}`,
			`--good:${themeTokens.good}`,
			`--warn:${themeTokens.warn}`,
			`--bad:${themeTokens.bad}`,
			`--bad-rgb:${themeTokens.badRgb}`
		].join(';')
	);

	$effect(() => {
		// Apply theme tokens globally so background + scrollbars match.
		document.documentElement.setAttribute('style', themeStyle);
		document.documentElement.setAttribute('data-theme', themeStore.mode);
	});

	// Landing/auth pages and the app shell share this layout. SvelteKit can leave
	// window.scrollY from a long marketing page when opening /app, which hides the
	// mobile header and tool picker below the fold.
	onNavigate((navigation) => {
		const from = navigation.from?.url;
		const to = navigation.to?.url;
		if (!to) return;

		if (from?.pathname === to.pathname) return;

		return async () => {
			await tick();
			window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
		};
	});

	onMount(async () => {
		// Initialize offline store event listeners
		offlineStore.init();

		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });

		// Initialize auth state, then load org branding/overrides if signed in.
		await authStore.fetch();
		if (authStore.isAuthenticated) {
			await orgSettingsStore.fetch();
		}
	});
</script>

<div class="app-root" style={themeStyle}>
	{#if isStandalone}
		{@render children()}
	{:else}
		<AppShell {children} />
	{/if}
	<PwaInstallPrompt />
	<Toast />
	<ConfirmModal />
	<OnboardingOverlay />
</div>
