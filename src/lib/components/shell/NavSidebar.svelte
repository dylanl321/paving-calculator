<script lang="ts">
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { config } from '$lib/config';
	import { authStore } from '$lib/stores/auth.svelte';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import { navCollapsedStore } from '$lib/stores/navCollapsed.svelte';
	import { fade } from 'svelte/transition';
	import { navItems, type NavItem } from './navConfig';
	import NavMobileBar from './NavMobileBar.svelte';
	import NavSidebarFooter from './NavSidebarFooter.svelte';
	import NavList from './NavList.svelte';
	import WeatherBar from '$lib/components/WeatherBar.svelte';

	let { onOpenPalette = () => {} }: { onOpenPalette?: () => void } = $props();

	let drawerOpen = $state(false);
	let sidebarEl = $state<HTMLElement | null>(null);

	const brandLogo = $derived(orgSettingsStore.logoUrl ?? '/icons/icon-192.png');
	const brandName = $derived(orgSettingsStore.orgName ?? config.app.name);

	function isItemVisible(item: NavItem): boolean {
		// screed_man sees only the standalone calculator link
		if (authStore.org?.role === 'screed_man') {
			return item.href === '/app';
		}
		if (item.authed && !authStore.isAuthenticated) return false;
		if (item.adminConsole) {
			return authStore.canAccessAdmin;
		}
		if (item.adminOnly) {
			const role = authStore.org?.role;
			return role === 'admin' || role === 'owner';
		}
		return true;
	}

	const visibleItems = $derived(
		navItems
			.filter(isItemVisible)
			.map((item) => ({
				...item,
				children: item.children?.filter(isItemVisible) ?? undefined
			}))
	);

	const currentPath = $derived($page.url.pathname);

	function ownedPaths(item: NavItem): string[] {
		const paths = [item.href, ...(item.owns ?? [])];
		for (const child of item.children ?? []) paths.push(...ownedPaths(child));
		return paths;
	}

	function pathMatches(path: string, owned: string): boolean {
		return path === owned || path.startsWith(owned + '/');
	}

	const activeHref = $derived.by(() => {
		let bestHref: string | null = null;
		let bestLen = -1;

		const consider = (items: NavItem[]) => {
			for (const item of items) {
				for (const owned of ownedPaths(item)) {
					if (pathMatches(currentPath, owned) && owned.length > bestLen) {
						bestLen = owned.length;
						bestHref = item.href;
					}
				}
				if (item.children?.length) consider(item.children);
			}
		};

		consider(navItems);
		return bestHref;
	});

	let expanded = $state<Record<string, boolean>>({});

	function toggleExpanded(item: NavItem) {
		expanded[item.href] = !expanded[item.href];
	}

	// Reset the drawer whenever the route changes.
	// svelte-ignore state_referenced_locally
	let lastPath = $state(currentPath);
	$effect(() => {
		if (currentPath !== lastPath) {
			lastPath = currentPath;
			drawerOpen = false;
		}
	});

	$effect(() => {
		if (!browser) return;
		if (drawerOpen) {
			const prevOverflow = document.body.style.overflow;
			document.body.style.overflow = 'hidden';
			tick().then(() => {
				const first = sidebarEl?.querySelector<HTMLElement>(
					'a[href], button:not([disabled])'
				);
				first?.focus();
			});
			return () => {
				document.body.style.overflow = prevOverflow;
			};
		}
	});

	function focusableInDrawer(): HTMLElement[] {
		if (!sidebarEl) return [];
		return Array.from(
			sidebarEl.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => el.offsetParent !== null);
	}

	function handleDrawerKeydown(event: KeyboardEvent) {
		if (!drawerOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			drawerOpen = false;
		} else if (event.key === 'Tab') {
			const focusable = focusableInDrawer();
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement as HTMLElement | null;
			if (event.shiftKey && active === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}
</script>

<svelte:window onkeydown={handleDrawerKeydown} />

<NavMobileBar
	{brandLogo}
	{brandName}
	{onOpenPalette}
	onOpenDrawer={() => (drawerOpen = true)}
	isAuthenticated={authStore.isAuthenticated}
/>

{#if drawerOpen}
	<button class="scrim" onclick={() => (drawerOpen = false)} aria-label="Close navigation" transition:fade={{ duration: 280 }}></button>
{/if}

<nav class="sidebar" class:open={drawerOpen} class:nav-collapsed={navCollapsedStore.collapsed} aria-label="Primary" bind:this={sidebarEl}>
	<div class="brand">
		<img src={brandLogo} alt={brandName} />
		<div class="brand-text">
			<span class="brand-name">{brandName}</span>
			<span class="brand-tag">{config.app.tagline}</span>
		</div>
	</div>

	{#if !authStore.isAuthenticated && !authStore.loading}
		<div class="signin-cta">
			<a href="/login" class="signin-cta-btn">Sign In</a>
			<a href="/register" class="signin-cta-link">Create account</a>
		</div>
	{/if}

	<NavList items={visibleItems} {activeHref} {expanded} onToggleExpanded={toggleExpanded} />
	<WeatherBar />
	<NavSidebarFooter {onOpenPalette} isAuthenticated={authStore.isAuthenticated} isCollapsed={navCollapsedStore.collapsed} orgName={orgSettingsStore.orgName} />
</nav>

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		border: 0;
		z-index: 30;
		cursor: pointer;
	}

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
	.sidebar.open { transform: translateX(0); }

	.brand {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px 16px;
		border-bottom: 1px solid var(--border);
	}
	.brand img { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; }
	.brand-text { display: flex; flex-direction: column; min-width: 0; }
	.brand-name { font-weight: 700; font-size: 1.15rem; letter-spacing: 0.5px; }
	.brand-tag { font-size: 0.72rem; color: var(--text-muted); line-height: 1.3; }

	.signin-cta {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
	}
	.signin-cta-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		background: var(--accent);
		border-radius: 10px;
		color: var(--accent-text);
		font-weight: 700;
		font-size: 0.9375rem;
		transition: opacity var(--dur-normal) var(--ease);
	}
	.signin-cta-btn:hover { opacity: 0.9; }
	.signin-cta-link {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		border-radius: 10px;
		color: var(--text-muted);
		font-size: 0.875rem;
		transition: color var(--dur-normal) var(--ease);
	}
	.signin-cta-link:hover { color: var(--text); }

	@media (min-width: 900px) {
		.scrim { display: none; }
		.sidebar { position: sticky; top: 0; height: 100vh; align-self: start; transform: none; transition: none; }
	}

	@media (min-width: 900px) and (max-width: 1099px) {
		.sidebar { width: var(--sidebar-rail-w); }
		.brand { justify-content: center; padding: 18px 8px; }
		.brand-text { display: none; }
	}

	@media (min-width: 1100px) {
		.sidebar { width: var(--sidebar-w); }
		.brand { justify-content: flex-start; padding: 18px 16px; }
		.brand-text { display: flex; }
	}

	@media (min-width: 1100px) {
		.sidebar.nav-collapsed { width: var(--sidebar-rail-w); }
		.sidebar.nav-collapsed .brand { justify-content: center; padding: 18px 8px; }
		.sidebar.nav-collapsed .brand-text { display: none; }
	}

	@media (max-height: 760px) and (min-width: 900px) {
		.brand {
			padding: 12px 14px;
		}

		.brand img {
			width: 34px;
			height: 34px;
			border-radius: 8px;
		}

		.brand-tag {
			display: none;
		}
	}

	@media (max-height: 640px) and (min-width: 900px) {
		.brand {
			padding: 8px;
		}

		.brand img {
			width: 30px;
			height: 30px;
		}
	}
</style>
