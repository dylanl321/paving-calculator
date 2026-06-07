export interface NavItem {
	href: string;
	label: string;
	icon: string;
	authed?: boolean;
	adminOnly?: boolean;
	/** Visible to admin-console users (global admin or org owner/admin). */
	adminConsole?: boolean;
	/** Extra path prefixes this item owns (beyond `href`) for active matching. */
	owns?: string[];
	children?: NavItem[];
}

export const navItems: NavItem[] = [
	{ href: '/dashboard', label: 'Home', icon: 'layout', authed: true },
	{
		href: '/dashboard/projects',
		label: 'Projects',
		icon: 'folder',
		authed: true,
		owns: ['/dashboard/job-sites']
	},
	{ href: '/app', label: 'Quick Calc', icon: 'calc' },
	{ href: '/dashboard/map', label: 'Map', icon: 'map', authed: true },
	{
		href: '/dashboard/import',
		label: 'Import',
		icon: 'upload',
		authed: true,
		children: [
			{ href: '/dashboard/job-sites/import', label: 'Project from PDF', icon: 'upload', authed: true },
			{ href: '/dashboard/import', label: 'Historical logs (CSV)', icon: 'upload', authed: true }
		]
	},
	{
		href: '/dashboard/team',
		label: 'Organization',
		icon: 'org',
		authed: true,
		children: [
			{ href: '/dashboard/team', label: 'Team', icon: 'users', authed: true },
			{ href: '/dashboard/settings', label: 'Settings', icon: 'settings', authed: true },
			{ href: '/dashboard/activity', label: 'Activity', icon: 'clock', authed: true, adminOnly: true },
			{ href: '/dashboard/completeness', label: 'Setup Status', icon: 'shield-check', authed: true, adminOnly: true }
		]
	},
	{
		href: '/reference',
		label: 'Learn',
		icon: 'learn',
		owns: ['/reference'],
		children: [
			{ href: '/reference', label: 'Reference', icon: 'book' },
			{ href: '/reference/formulas', label: 'Formulas', icon: 'calc' },
			{ href: '/glossary', label: 'Glossary', icon: 'book' },
			{ href: '/dashboard/guides', label: 'Guides', icon: 'guide', authed: true }
		]
	},
	{ href: '/admin', label: 'Admin', icon: 'shield-check', authed: true, adminConsole: true, owns: ['/admin'] }
];

/**
 * Auth context consumed by {@link isItemVisible}. Mirrors the fields the nav
 * needs from the auth store so the predicate stays pure/testable and the
 * sidebar + command palette can never drift on visibility rules.
 */
export interface NavAuthContext {
	role: string | null | undefined;
	isAuthenticated: boolean;
	canAccessAdmin: boolean;
}

/**
 * Single source of truth for nav visibility. Keep in sync with the rules the
 * sidebar and command palette both rely on:
 * - `screed_man` sees ONLY the standalone calculator (`/app`)
 * - `item.authed` is hidden when logged out
 * - `item.adminConsole` requires admin-console access
 * - `item.adminOnly` requires org role `admin`/`owner`
 */
export function isItemVisible(item: NavItem, auth: NavAuthContext): boolean {
	if (auth.role === 'screed_man') {
		return item.href === '/app';
	}
	if (item.authed && !auth.isAuthenticated) return false;
	if (item.adminConsole) {
		return auth.canAccessAdmin;
	}
	if (item.adminOnly) {
		return auth.role === 'admin' || auth.role === 'owner';
	}
	return true;
}
