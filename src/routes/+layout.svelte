<script lang="ts">
	import { onMount } from 'svelte';
	import { theme } from '$lib/config';
	import '../app.css';

	let { children } = $props();

	const themeStyle = [
		`--bg:${theme.bg}`,
		`--surface:${theme.surface}`,
		`--surface-alt:${theme.surfaceAlt}`,
		`--border:${theme.border}`,
		`--text:${theme.text}`,
		`--text-muted:${theme.textMuted}`,
		`--accent:${theme.accent}`,
		`--accent-text:${theme.accentText}`,
		`--good:${theme.good}`,
		`--warn:${theme.warn}`,
		`--bad:${theme.bad}`
	].join(';');

	onMount(() => {
		// Apply theme tokens globally so background + scrollbars match.
		document.documentElement.setAttribute('style', themeStyle);
	});

	onMount(async () => {
		const { registerSW } = await import('virtual:pwa-register');
		registerSW({ immediate: true });
	});
</script>

<div class="app" style={themeStyle}>
	{@render children()}
</div>
