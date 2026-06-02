<script lang="ts">
	import { themeStore } from '$lib/stores/theme.svelte';
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
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="5"></circle>
				<line x1="12" y1="1" x2="12" y2="3"></line>
				<line x1="12" y1="21" x2="12" y2="23"></line>
				<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
				<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
				<line x1="1" y1="12" x2="3" y2="12"></line>
				<line x1="21" y1="12" x2="23" y2="12"></line>
				<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
				<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
			</svg>
		{:else if themeStore.mode === 'light'}
			<svg
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="6"></circle>
				<line x1="12" y1="0" x2="12" y2="3"></line>
				<line x1="12" y1="21" x2="12" y2="24"></line>
				<line x1="2.93" y1="2.93" x2="5.05" y2="5.05"></line>
				<line x1="18.95" y1="18.95" x2="21.07" y2="21.07"></line>
				<line x1="0" y1="12" x2="3" y2="12"></line>
				<line x1="21" y1="12" x2="24" y2="12"></line>
				<line x1="2.93" y1="21.07" x2="5.05" y2="18.95"></line>
				<line x1="18.95" y1="5.05" x2="21.07" y2="2.93"></line>
			</svg>
		{:else}
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
			</svg>
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
