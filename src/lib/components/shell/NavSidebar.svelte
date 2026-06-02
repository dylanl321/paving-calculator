<script lang="ts">
	import { page } from '$app/stores';
	import { config } from '$lib/config';
	import { authStore } from '$lib/stores/auth.svelte';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import { fade } from 'svelte/transition';

	let drawerOpen = $state(false);

	function closeDrawer() {
		drawerOpen = false;
	}

	const brandLogo = $derived(orgSettingsStore.logoUrl ?? '/icons/icon-192.png');
	const brandName = $derived(orgSettingsStore.orgName ?? config.app.name);

	interface NavItem {
		href: string;
		label: string;
		icon: string;
		authed?: boolean;
	}

	const navItems: NavItem[] = [
		{ href: '/app', label: 'Calculators', icon: 'calc' },
		{ href: '/reference', label: 'Reference', icon: 'book' },
		{ href: '/dashboard', label: 'Dashboard', icon: 'layout', authed: true }
	];

	const visibleItems = $derived(
		navItems.filter((item) => !item.authed || authStore.isAuthenticated)
	);

	const currentPath = $derived($page.url.pathname);

	function isActive(href: string): boolean {
		if (href === '/app') return currentPath === '/app' || currentPath === '/';
		return currentPath === href || currentPath.startsWith(href + '/');
	}
</script>

<!-- Mobile top bar (hidden on tablet+) -->
<header class="mobile-bar">
	<button class="hamburger" onclick={() => (drawerOpen = true)} aria-label="Open navigation">
		<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
			<line x1="3" y1="6" x2="21" y2="6"></line>
			<line x1="3" y1="12" x2="21" y2="12"></line>
			<line x1="3" y1="18" x2="21" y2="18"></line>
		</svg>
	</button>
	<a href="/app" class="mobile-brand">
		<img src={brandLogo} alt="" />
		<span>{brandName}</span>
	</a>
	<div class="mobile-actions">
		<ThemeToggle />
		<UserMenu />
	</div>
</header>

<!-- Drawer scrim (mobile) -->
{#if drawerOpen}
	<button
		class="scrim"
		onclick={closeDrawer}
		aria-label="Close navigation"
		transition:fade={{ duration: 280 }}
	></button>
{/if}

<!-- Sidebar / drawer -->
<nav class="sidebar" class:open={drawerOpen} aria-label="Primary">
	<div class="brand">
		<img src={brandLogo} alt={brandName} />
		<div class="brand-text">
			<span class="brand-name">{brandName}</span>
			<span class="brand-tag">{config.app.tagline}</span>
		</div>
	</div>

	<ul class="nav-list">
		{#each visibleItems as item (item.href)}
			<li>
				<a
					href={item.href}
					class="nav-link"
					class:active={isActive(item.href)}
					onclick={closeDrawer}
					title={item.label}
				>
					<span class="nav-icon" aria-hidden="true">
						{#if item.icon === 'calc'}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="8" y1="10" x2="8" y2="10"></line><line x1="12" y1="10" x2="12" y2="10"></line><line x1="16" y1="10" x2="16" y2="10"></line><line x1="8" y1="14" x2="8" y2="14"></line><line x1="12" y1="14" x2="12" y2="14"></line><line x1="16" y1="14" x2="16" y2="18"></line><line x1="8" y1="18" x2="12" y2="18"></line></svg>
						{:else if item.icon === 'grid'}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
						{:else if item.icon === 'book'}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
						{:else if item.icon === 'layout'}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
						{/if}
					</span>
					<span class="nav-label">{item.label}</span>
				</a>
			</li>
		{/each}
	</ul>

	<div class="sidebar-footer">
		<div class="footer-actions">
			<ThemeToggle />
			<UserMenu direction="up" align="left" />
		</div>
		{#if orgSettingsStore.orgName}
			<a href="/app" class="powered-by">
				<img src="/icons/icon-192.png" alt="" />
				<span>Powered by {config.app.name}</span>
			</a>
		{/if}
	</div>
</nav>

<style>
	/* ---- Mobile top bar ---- */
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

	/* ---- Scrim ---- */
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		border: 0;
		z-index: 30;
		cursor: pointer;
	}

	/* ---- Sidebar (mobile = off-canvas drawer) ---- */
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: min(82vw, var(--sidebar-w));
		background: var(--surface);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		transform: translateX(-100%);
		transition: transform var(--dur-slow) var(--ease);
		z-index: 40;
	}

	.sidebar.open {
		transform: translateX(0);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px 16px;
		border-bottom: 1px solid var(--border);
	}

	.brand img {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		flex-shrink: 0;
	}

	.brand-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.brand-name {
		font-weight: 700;
		font-size: 1.15rem;
		letter-spacing: 0.5px;
	}

	.brand-tag {
		font-size: 0.72rem;
		color: var(--text-muted);
		line-height: 1.3;
	}

	.nav-list {
		list-style: none;
		margin: 0;
		padding: 12px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		overflow-y: auto;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 14px;
		min-height: 48px;
		border-radius: 10px;
		color: var(--text-muted);
		font-weight: 600;
		font-size: 0.95rem;
		transition:
			background var(--dur-normal) var(--ease),
			color var(--dur-normal) var(--ease),
			transform var(--dur-fast) var(--ease);
	}

	@media (prefers-reduced-motion: no-preference) {
		.nav-link:active {
			transform: scale(0.98);
		}
	}

	.nav-link:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.nav-link.active {
		background: var(--accent);
		color: var(--accent-text);
	}

	.nav-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.nav-icon :global(svg) {
		width: 22px;
		height: 22px;
	}

	.sidebar-footer {
		margin-top: auto;
		border-top: 1px solid var(--border);
		padding: 12px;
	}

	.footer-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: space-between;
	}

	.powered-by {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-top: 10px;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.2px;
		text-decoration: none;
		transition: color var(--dur-normal) var(--ease);
	}

	.powered-by:hover {
		color: var(--text);
	}

	.powered-by img {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	/* ---- Tablet: static icon rail ---- */
	@media (min-width: 768px) {
		.mobile-bar,
		.scrim {
			display: none;
		}

		.sidebar {
			position: sticky;
			top: 0;
			height: 100vh;
			width: var(--sidebar-rail-w);
			transform: none;
			transition: none;
		}

		.brand {
			justify-content: center;
			padding: 18px 8px;
		}

		.brand-text {
			display: none;
		}

		.nav-link {
			justify-content: center;
			padding: 0;
		}

		.nav-label {
			display: none;
		}

		.footer-actions {
			flex-direction: column;
			gap: 10px;
		}

		.powered-by {
			justify-content: center;
		}

		.powered-by span {
			display: none;
		}
	}

	/* ---- Desktop: full labelled sidebar ---- */
	@media (min-width: 1100px) {
		.sidebar {
			width: var(--sidebar-w);
		}

		.brand {
			justify-content: flex-start;
			padding: 18px 16px;
		}

		.brand-text {
			display: flex;
		}

		.nav-link {
			justify-content: flex-start;
			padding: 0 14px;
		}

		.nav-label {
			display: inline;
		}

		.footer-actions {
			flex-direction: row;
		}

		.powered-by {
			justify-content: flex-start;
		}

		.powered-by span {
			display: inline;
		}
	}
</style>
