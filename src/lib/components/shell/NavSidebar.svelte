<script lang="ts">
	import { page } from '$app/stores';
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { config } from '$lib/config';
	import { authStore } from '$lib/stores/auth.svelte';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import { fade } from 'svelte/transition';
	import {
		Menu,
		Calculator,
		BookOpen,
		BookMarked,
		LayoutDashboard,
		Clock,
		Upload,
		Users,
		Settings,
		Map,
		ChevronDown
	} from 'lucide-svelte';

	let drawerOpen = $state(false);
	let sidebarEl = $state<HTMLElement | null>(null);

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
		adminOnly?: boolean;
		/** Extra path prefixes this item owns (beyond `href`) for active matching. */
		owns?: string[];
		children?: NavItem[];
	}

	const navItems: NavItem[] = [
		{
			href: '/dashboard',
			label: 'Projects',
			icon: 'layout',
			authed: true,
			owns: ['/dashboard/job-sites'],
			children: [
				{ href: '/dashboard/map', label: 'Map', icon: 'map', authed: true },
				{ href: '/dashboard/team', label: 'Team', icon: 'users', authed: true },
				{ href: '/dashboard/settings', label: 'Settings', icon: 'settings', authed: true }
			]
		},
		{ href: '/app', label: 'Quick Calc', icon: 'calc' },
		{ href: '/reference', label: 'Reference', icon: 'book' },
		{ href: '/dashboard/guides', label: 'Guides', icon: 'guide', authed: true },
		{ href: '/dashboard/import', label: 'Import', icon: 'upload', authed: true },
		{ href: '/dashboard/activity', label: 'Activity', icon: 'clock', authed: true, adminOnly: true }
	];

	function isItemVisible(item: NavItem): boolean {
		// screed_man sees only the standalone calculator link
		if (authStore.org?.role === 'screed_man') {
			return item.href === '/app';
		}
		if (item.authed && !authStore.isAuthenticated) return false;
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

	/** Every path prefix (including children) that a nav item can claim. */
	function ownedPaths(item: NavItem): string[] {
		const paths = [item.href, ...(item.owns ?? [])];
		for (const child of item.children ?? []) {
			paths.push(...ownedPaths(child));
		}
		return paths;
	}

	/** Does `path` match `owned`: exact, or a descendant segment (`/owned/...`)? */
	function pathMatches(path: string, owned: string): boolean {
		return path === owned || path.startsWith(owned + '/');
	}

	/**
	 * Single source of truth: the href whose owned paths best (longest-prefix)
	 * match the current path. Guarantees mutually-exclusive highlighting.
	 */
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

	function isActive(item: NavItem): boolean {
		return activeHref === item.href;
	}

	/** A parent is highlighted-on-child when one of its descendants is active. */
	function hasActiveChild(item: NavItem): boolean {
		return (item.children ?? []).some(
			(child) => isActive(child) || hasActiveChild(child)
		);
	}

	// Track which expandable parents are manually toggled open.
	let expanded = $state<Record<string, boolean>>({});

	function isExpanded(item: NavItem): boolean {
		// Auto-expand when a child is active, unless the user collapsed it.
		if (item.href in expanded) return expanded[item.href];
		return hasActiveChild(item);
	}

	function toggleExpanded(item: NavItem) {
		expanded[item.href] = !isExpanded(item);
	}

	// --- Mobile drawer behaviour: scroll lock + central reset on navigation ---

	// Reset the drawer whenever the route changes (replaces per-link onclick=closeDrawer).
	let lastPath = $state(currentPath);
	$effect(() => {
		if (currentPath !== lastPath) {
			lastPath = currentPath;
			drawerOpen = false;
		}
	});

	// Lock body scroll while the drawer is open and move focus into it.
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
			return;
		}
		// Basic focus trap (only meaningful in the mobile off-canvas state).
		if (event.key === 'Tab') {
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

<!-- Mobile top bar (hidden on tablet+) -->
<header class="mobile-bar">
	<button class="hamburger" onclick={() => (drawerOpen = true)} aria-label="Open navigation">
		<Menu size={24} aria-hidden="true" />
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
<nav
	class="sidebar"
	class:open={drawerOpen}
	aria-label="Primary"
	bind:this={sidebarEl}
>
	<div class="brand">
		<img src={brandLogo} alt={brandName} />
		<div class="brand-text">
			<span class="brand-name">{brandName}</span>
			<span class="brand-tag">{config.app.tagline}</span>
		</div>
	</div>

	{#snippet navIcon(icon: string)}
		{#if icon === 'calc'}
			<Calculator size={22} />
		{:else if icon === 'book'}
			<BookOpen size={22} />
		{:else if icon === 'guide'}
			<BookMarked size={22} />
		{:else if icon === 'layout'}
			<LayoutDashboard size={22} />
		{:else if icon === 'upload'}
			<Upload size={22} />
		{:else if icon === 'clock'}
			<Clock size={22} />
		{:else if icon === 'map'}
			<Map size={22} />
		{:else if icon === 'users'}
			<Users size={22} />
		{:else if icon === 'settings'}
			<Settings size={22} />
		{/if}
	{/snippet}

	<ul class="nav-list">
		{#each visibleItems as item (item.href)}
			{@const childrenVisible = item.children && item.children.length > 0}
			<li>
				{#if childrenVisible}
					<div class="nav-row">
						<a
							href={item.href}
							class="nav-link"
							class:active={isActive(item)}
							class:active-child={!isActive(item) && hasActiveChild(item)}
							title={item.label}
							aria-current={isActive(item) ? 'page' : undefined}
						>
							<span class="nav-icon" aria-hidden="true">
								{@render navIcon(item.icon)}
							</span>
							<span class="nav-label">{item.label}</span>
						</a>
						<button
							type="button"
							class="nav-expand"
							class:expanded={isExpanded(item)}
							onclick={() => toggleExpanded(item)}
							aria-expanded={isExpanded(item)}
							aria-label={`${isExpanded(item) ? 'Collapse' : 'Expand'} ${item.label}`}
						>
							<ChevronDown size={18} aria-hidden="true" />
						</button>
					</div>
					{#if isExpanded(item)}
						<ul class="nav-sublist">
							{#each item.children ?? [] as child (child.href)}
								<li>
									<a
										href={child.href}
										class="nav-link nav-sublink"
										class:active={isActive(child)}
										title={child.label}
										aria-current={isActive(child) ? 'page' : undefined}
									>
										<span class="nav-icon" aria-hidden="true">
											{@render navIcon(child.icon)}
										</span>
										<span class="nav-label">{child.label}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				{:else}
					<a
						href={item.href}
						class="nav-link"
						class:active={isActive(item)}
						title={item.label}
						aria-current={isActive(item) ? 'page' : undefined}
					>
						<span class="nav-icon" aria-hidden="true">
							{@render navIcon(item.icon)}
						</span>
						<span class="nav-label">{item.label}</span>
					</a>
				{/if}
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

	/* Parent whose child is active: subtle highlight, no full accent fill. */
	.nav-link.active-child {
		color: var(--text);
		background: var(--surface-hover);
	}

	.nav-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.nav-row .nav-link {
		flex: 1;
		min-width: 0;
	}

	.nav-expand {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		background: none;
		border: 0;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: 10px;
		transition:
			background var(--dur-normal) var(--ease),
			color var(--dur-normal) var(--ease);
	}

	.nav-expand:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.nav-expand :global(svg) {
		transition: transform var(--dur-normal) var(--ease);
	}

	.nav-expand.expanded :global(svg) {
		transform: rotate(180deg);
	}

	.nav-sublist {
		list-style: none;
		margin: 4px 0 4px 0;
		padding: 0 0 0 18px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-left: 2px solid var(--border);
	}

	.nav-sublink {
		min-height: 44px;
		font-size: 0.9rem;
		font-weight: 500;
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
	}

	@media (min-width: 768px) and (max-width: 1099px) {
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

		/* The icon rail has no room for labels/expansion: collapse the
		   parent/expander row and render children as flat centered icons so
		   their active state is still visible. */
		.nav-row {
			gap: 0;
		}

		.nav-expand {
			display: none;
		}

		.nav-sublist {
			margin: 4px 0;
			padding: 0;
			border-left: 0;
			gap: 4px;
		}

		.nav-sublink {
			min-height: 48px;
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
