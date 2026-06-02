<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
	import { Sun, Moon } from 'lucide-svelte';
	import { fade } from 'svelte/transition';

	const modeLabel = $derived(
		themeStore.mode === 'dark' ? 'Dark' : themeStore.mode === 'light' ? 'Light' : 'Sun'
	);

	const nextMode = $derived(
		themeStore.mode === 'dark' ? 'light' : themeStore.mode === 'light' ? 'sunlight' : 'dark'
	);

	const nextModeLabel = $derived(
		nextMode === 'dark' ? 'Dark' : nextMode === 'light' ? 'Light' : 'Sunlight'
	);
</script>

<button
	class="theme-toggle"
	onclick={() => themeStore.toggle()}
	aria-label="Toggle theme"
	title="{modeLabel} mode — click for {nextModeLabel}"
>
	<div class="icon-wrapper">
		{#if themeStore.mode === 'dark'}
			<Sun size={20} aria-hidden="true" />
		{:else if themeStore.mode === 'light'}
			<Sun size={24} aria-hidden="true" />
		{:else}
			<Moon size={20} aria-hidden="true" />
		{/if}
	</div>
	<span class="mode-label">{modeLabel}</span>
</button>

<style>
	.theme-toggle {
		min-width: 48px;
		min-height: 48px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text);
		cursor: pointer;
		transition:
			background var(--dur-normal) var(--ease),
			transform var(--dur-fast) var(--ease);
		padding: 4px 8px;
	}

	.theme-toggle:hover {
		background: var(--surface-alt);
	}

	@media (prefers-reduced-motion: no-preference) {
		.theme-toggle:active {
			transform: scale(0.96);
		}
	}
	.icon-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.mode-label {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}
</style>
