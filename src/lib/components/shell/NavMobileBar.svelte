<script lang="ts">
	import { Menu, Search } from 'lucide-svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';

	let {
		brandLogo,
		brandName,
		onOpenPalette,
		onOpenDrawer,
		isAuthenticated
	}: {
		brandLogo: string;
		brandName: string;
		onOpenPalette: () => void;
		onOpenDrawer: () => void;
		isAuthenticated: boolean;
	} = $props();
</script>

<header class="mobile-bar">
	<button class="hamburger" onclick={onOpenDrawer} aria-label="Open navigation">
		<Menu size={24} aria-hidden="true" />
	</button>
	<a href="/app" class="mobile-brand">
		<img src={brandLogo} alt="" />
		<span>{brandName}</span>
	</a>
	<div class="mobile-actions">
		<button
			class="cmd-trigger-btn"
			onclick={onOpenPalette}
			aria-label="Open command palette"
			title="Search (Ctrl+K)"
		>
			<Search size={20} aria-hidden="true" />
		</button>
		<ThemeToggle />
		{#if isAuthenticated}
			<UserMenu />
		{:else}
			<a href="/login" class="mobile-signin-btn">Sign In</a>
		{/if}
	</div>
</header>

<style>
	.mobile-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		background: var(--surface-alt);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 20;
	}

	.hamburger {
		min-width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 0;
		color: var(--text);
		cursor: pointer;
		border-radius: 10px;
		transition:
			background var(--dur-normal) var(--ease),
			transform var(--dur-fast) var(--ease);
	}

	.hamburger:hover {
		background: var(--surface-hover);
	}

	@media (prefers-reduced-motion: no-preference) {
		.hamburger:active {
			transform: scale(0.95);
		}
	}

	.mobile-brand {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		font-weight: 700;
		font-size: 1.1rem;
		letter-spacing: 0.5px;
	}

	.mobile-brand img {
		width: 34px;
		height: 34px;
		border-radius: 8px;
	}

	.mobile-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.mobile-signin-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 80px;
		min-height: 48px;
		padding: 0 16px;
		background: var(--accent);
		border-radius: 10px;
		color: var(--accent-text);
		font-weight: 700;
		font-size: 0.875rem;
		white-space: nowrap;
		transition:
			opacity var(--dur-normal) var(--ease),
			transform var(--dur-fast) var(--ease);
	}

	.mobile-signin-btn:hover {
		opacity: 0.9;
	}

	@media (prefers-reduced-motion: no-preference) {
		.mobile-signin-btn:active {
			transform: scale(0.96);
		}
	}

	.cmd-trigger-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		background: none;
		border: 0;
		color: var(--text);
		cursor: pointer;
		border-radius: 10px;
		transition: background var(--dur-normal) var(--ease);
	}

	.cmd-trigger-btn:hover {
		background: var(--surface-hover);
	}

	@media (min-width: 900px) {
		.mobile-bar {
			display: none;
		}
	}
</style>
