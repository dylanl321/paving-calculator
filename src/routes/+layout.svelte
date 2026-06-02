<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { config } from '$lib/config';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import '../app.css';

	let { children } = $props();

	// Auth pages (login/register) render full-bleed without the app shell chrome.
	const isStandalone = $derived(
		$page.url.pathname === '/login' || $page.url.pathname === '/register'
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

	onMount(async () => {
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
</div>
