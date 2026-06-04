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
		LayoutDashboard,
		Building2,
		Users,
		Mail,
		ScrollText,
		Database,
		Activity,
		BarChart3,
		TrendingUp,
		ArrowLeft,
		ShieldCheck,
		FileText,
		AlertTriangle
	} from 'lucide-svelte';

	let {
		isGlobalAdmin = false,
		isOrgAdmin = false,
		orgName = null
	}: { isGlobalAdmin?: boolean; isOrgAdmin?: boolean; orgName?: string | null } = $props();

	let drawerOpen = $state(false);
	let sidebarEl = $state<HTMLElement | null>(null);

	const brandLogo = $derived(orgSettingsStore.logoUrl ?? '/icons/icon-192.png');

	interface AdminNavItem {
		href: string;
		label: string;
		icon: string;
		/** Extra path prefixes this item owns for active matching. */
		owns?: string[];
	}

	interface AdminNavGroup {
		id: string;
		label: string;
		visible: boolean;
		items: AdminNavItem[];
	}

	const groups = $derived<AdminNavGroup[]>([
		{
			id: 'organization',
			label: orgName ?? 'Organization',
			visible: isOrgAdmin,
			items: [
				{ href: '/admin/org/activity', label: 'Org Activity', icon: 'activity' },
				{ href: '/admin/org/crew-productivity', label: 'Crew Productivity', icon: 'chart' }
			]
		},
		{
			id: 'platform',
			label: 'Platform',
			visible: isGlobalAdmin,
			items: [
				{ href: '/admin', label: 'Overview', icon: 'overview' },
				{ href: '/admin/orgs', label: 'Organizations', icon: 'orgs' },
				{ href: '/admin/users', label: 'Users', icon: 'users' },
				{ href: '/admin/emails', label: 'Email', icon: 'mail', owns: ['/admin/emails/templates'] },
			{ href: '/admin/analytics', label: 'Analytics', icon: 'analytics' },
				{ href: '/admin/audit', label: 'Audit Log', icon: 'audit' },
				{ href: '/admin/logs', label: 'Logs', icon: 'logs' },
				{ href: '/admin/errors', label: 'Errors', icon: 'errors' }
			]
		}
	]);

	const visibleGroups = $derived(groups.filter((g) => g.visible && g.items.length > 0));

	const currentPath = $derived($page.url.pathname);

	function ownedPaths(item: AdminNavItem): string[] {
		return [item.href, ...(item.owns ?? [])];
	}

	function pathMatches(path: string, owned: string): boolean {
		return path === owned || path.startsWith(owned + '/');
	}

	/** Longest-prefix match guarantees mutually-exclusive highlighting. */
	const activeHref = $derived.by(() => {
		let bestHref: string | null = null;
		let bestLen = -1;
		for (const group of groups) {
			for (const item of group.items) {
				for (const owned of ownedPaths(item)) {
					if (pathMatches(currentPath, owned) && owned.length > bestLen) {
						bestLen = owned.length;
						bestHref = item.href;
					}
				}
			}
		}
		return bestHref;
	});

	function isActive(item: AdminNavItem): boolean {
		return activeHref === item.href;
	}

	// Reset the drawer whenever the route changes.
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
				const first = sidebarEl?.querySelector<HTMLElement>('a[href], button:not([disabled])');
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

{#snippet navIcon(icon: string)}
	{#if icon === 'overview'}
		<LayoutDashboard size={22} />
	{:else if icon === 'orgs'}
		<Building2 size={22} />
	{:else if icon === 'users'}
		<Users size={22} />
	{:else if icon === 'mail'}
		<Mail size={22} />
	{:else if icon === 'analytics'}
		<TrendingUp size={22} />
	{:else if icon === 'audit'}
		<ScrollText size={22} />
	{:else if icon === 'logs'}
		<FileText size={22} />
	{:else if icon === 'errors'}
		<AlertTriangle size={22} />
	{:else if icon === 'db'}
		<Database size={22} />
	{:else if icon === 'activity'}
		<Activity size={22} />
	{:else if icon === 'chart'}
		<BarChart3 size={22} />
	{/if}
{/snippet}

<!-- Mobile top bar -->
<header class="mobile-bar">
	<button class="hamburger" onclick={() => (drawerOpen = true)} aria-label="Open navigation">
		<Menu size={24} aria-hidden="true" />
	</button>
	<div class="mobile-brand">
		<span class="badge"><ShieldCheck size={16} aria-hidden="true" /></span>
		<span>{config.app.name} Admin</span>
	</div>
	<div class="mobile-actions">
		<ThemeToggle />
		<UserMenu />
	</div>
</header>

<!-- Drawer scrim (mobile) -->
{#if drawerOpen}
	<button
		class="scrim"
		onclick={() => (drawerOpen = false)}
		aria-label="Close navigation"
		transition:fade={{ duration: 280 }}
	></button>
{/if}

<nav
	class="sidebar"
	class:open={drawerOpen}
	aria-label="Admin"
	bind:this={sidebarEl}
>
	<a href="/admin" class="brand">
		<img src={brandLogo} alt="" />
		<div class="brand-text">
			<span class="brand-name">{config.app.name}</span>
			<span class="brand-tag"><ShieldCheck size={12} aria-hidden="true" /> Admin Console</span>
		</div>
	</a>

	<div class="nav-scroll">
		{#each visibleGroups as group (group.id)}
			<div class="nav-group">
				<span class="group-label">{group.label}</span>
				<ul class="nav-list">
					{#each group.items as item (item.href)}
						<li>
							<a
								href={item.href}
								class="nav-link"
								class:active={isActive(item)}
								title={item.label}
								aria-current={isActive(item) ? 'page' : undefined}
							>
								<span class="nav-icon" aria-hidden="true">{@render navIcon(item.icon)}</span>
								<span class="nav-label">{item.label}</span>
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>

	<div class="sidebar-footer">
		<a href="/dashboard" class="back-link" title="Back to app">
			<ArrowLeft size={18} aria-hidden="true" />
			<span class="back-label">Back to app</span>
		</a>
		<div class="footer-actions">
			<ThemeToggle />
			<UserMenu direction="up" align="left" />
		</div>
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
		transition: background var(--dur-normal) var(--ease);
	}

	.hamburger:hover {
		background: var(--surface-hover);
	}

	.mobile-brand {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: 0.4px;
	}

	.mobile-brand .badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: var(--accent);
		color: var(--accent-text);
		flex-shrink: 0;
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
		text-decoration: none;
		color: var(--text);
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
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.72rem;
		color: var(--accent);
		font-weight: 600;
		letter-spacing: 0.3px;
		line-height: 1.3;
	}

	.nav-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 12px 10px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.nav-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.group-label {
		padding: 0 14px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
		margin-bottom: 4px;
	}

	.nav-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
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
		text-decoration: none;
		transition:
			background var(--dur-normal) var(--ease),
			color var(--dur-normal) var(--ease);
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
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid var(--border);
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
		transition:
			background var(--dur-normal) var(--ease),
			color var(--dur-normal) var(--ease),
			border-color var(--dur-normal) var(--ease);
	}

	.back-link:hover {
		background: var(--surface-hover);
		color: var(--text);
		border-color: var(--accent);
	}

	.footer-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: space-between;
	}

	/* ---- Tablet: static icon rail ---- */
	@media (min-width: 900px) {
		.mobile-bar,
		.scrim {
			display: none;
		}

		.sidebar {
			position: sticky;
			top: 0;
			height: 100vh;
			align-self: start;
			transform: none;
			transition: none;
		}
	}

	@media (min-width: 900px) and (max-width: 1099px) {
		.sidebar {
			width: var(--sidebar-rail-w);
		}

		.brand {
			justify-content: center;
			padding: 18px 8px;
		}

		.brand-text {
			display: none;
		}

		.group-label {
			text-align: center;
			padding: 0;
			font-size: 0.6rem;
		}

		.nav-link {
			justify-content: center;
			padding: 0;
		}

		.nav-label {
			display: none;
		}

		.back-label {
			display: none;
		}

		.back-link {
			justify-content: center;
			padding: 0;
		}

		.footer-actions {
			flex-direction: column;
			gap: 10px;
		}
	}

	/* ---- Desktop: full labelled sidebar ---- */
	@media (min-width: 1100px) {
		.sidebar {
			width: var(--sidebar-w);
		}
	}
</style>
