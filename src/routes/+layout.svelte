<script lang="ts">
	import { onMount } from 'svelte';
	import { config } from '$lib/config';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import '../app.css';

	let { children } = $props();

	const themeTokens = $derived(config.theme[themeStore.mode]);

	const themeStyle = $derived(
		[
			`--bg:${themeTokens.bg}`,
			`--surface:${themeTokens.surface}`,
			`--surface-alt:${themeTokens.surfaceAlt}`,
			`--border:${themeTokens.border}`,
			`--text:${themeTokens.text}`,
			`--text-muted:${themeTokens.textMuted}`,
			`--accent:${themeTokens.accent}`,
			`--accent-text:${themeTokens.accentText}`,
			`--good:${themeTokens.good}`,
			`--warn:${themeTokens.warn}`,
			`--bad:${themeTokens.bad}`
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

<div class="app" style={themeStyle}>
	{@render children()}
</div>
