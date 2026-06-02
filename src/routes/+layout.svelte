<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { config } from '$lib/config';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import '../app.css';

	let { children } = $props();

	// Auth pages (login/register) render full-bleed without the app shell chrome.
	const isStandalone = $derived(
		$page.url.pathname === '/login' || $page.url.pathname === '/register'
	);

	const themeTokens = $derived(config.theme[themeStore.mode]);

	const themeStyle = $derived(
		[
			`--bg:${themeTokens.bg}`,
			`--surface:${themeTokens.surface}`,
			`--surface-alt:${themeTokens.surfaceAlt}`,
			`--surface-hover:${themeTokens.surfaceHover}`,
			`--border:${themeTokens.border}`,
			`--text:${themeTokens.text}`,
			`--text-muted:${themeTokens.textMuted}`,
			`--accent:${themeTokens.accent}`,
			`--accent-text:${themeTokens.accentText}`,
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

		// Initialize auth state
		await authStore.fetch();
	});
</script>

<div class="app-root" style={themeStyle}>
	{#if isStandalone}
		{@render children()}
	{:else}
		<AppShell {children} />
	{/if}
</div>
