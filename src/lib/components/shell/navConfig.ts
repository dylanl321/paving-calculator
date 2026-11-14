export interface NavItem {
	href: string;
	label: string;
	icon: string;
	authed?: boolean;
	adminOnly?: boolean;
	/** Visible to admin-console users (global admin or org owner/admin). */
	adminConsole?: boolean;
	/** Only field roles (operator, laborer, screed_man) see this item. */
	fieldOnly?: boolean;
	/** Field roles never see this item. */
	officeOnly?: boolean;
	/**
	 * `primary` items are the daily destinations (Today, Map, Jobs, Reports, Calc).
	 * `more` items (team, settings, reference, admin) render in a quieter group
	 * below them, so setup and reference stay out of the daily path.
	 */
	section?: 'primary' | 'more';
	/** Extra path prefixes this item owns (beyond `href`) for active matching. */
	owns?: string[];
	children?: NavItem[];
}

/** DB roles that use the field app (`/app/field`) instead of the dashboard. */
export const FIELD_ROLES = new Set(['operator', 'laborer', 'screed_man']);

export const navItems: NavItem[] = [
	// ── Daily destinations, named for the question they answer ──────────────
	{ href: '/dashboard', label: 'Today', icon: 'today', authed: true, officeOnly: true, section: 'primary' },
	{ href: '/app/field', label: 'Today', icon: 'today', authed: true, fieldOnly: true, section: 'primary' },
	{ href: '/dashboard/map', label: 'Map', icon: 'map', authed: true, officeOnly: true, section: 'primary' },
	{
		href: '/dashboard/projects',
		label: 'Jobs',
		icon: 'folder',
		authed: true,
		officeOnly: true,
		section: 'primary',
		owns: ['/dashboard/job-sites', '/dashboard/import']
	},
	{ href: '/dashboard/reports', label: 'Reports', icon: 'report', authed: true, officeOnly: true, section: 'primary' },
	{ href: '/app', label: 'Calc', icon: 'calc', section: 'primary' },

	// ── Everything else: setup, people, reference ────────────────────────────
	{ href: '/dashboard/team', label: 'Team', icon: 'users', authed: true, officeOnly: true, section: 'more' },
	{
		href: '/dashboard/settings',
		label: 'Settings',
		icon: 'settings',
		authed: true,
		officeOnly: true,
		section: 'more',
		owns: ['/dashboard/completeness', '/dashboard/activity']
	},
	{
		href: '/reference',
		label: 'Learn',
		icon: 'learn',
		section: 'more',
		owns: ['/reference', '/glossary', '/dashboard/guides']
	},
	{ href: '/admin', label: 'Admin', icon: 'shield-check', authed: true, adminConsole: true, section: 'more', owns: ['/admin'] }
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
 * - field roles (operator, laborer, screed_man) see only Today (`/app/field`) and Calc (`/app`)
 * - `item.authed` is hidden when logged out
 * - `item.adminConsole` requires admin-console access
 * - `item.adminOnly` requires org role `admin`/`owner`
 */
export function isItemVisible(item: NavItem, auth: NavAuthContext): boolean {
	const isField = !!auth.role && FIELD_ROLES.has(auth.role);
	if (isField) {
		// Field roles get Today (field app) and Calc only.
		return item.fieldOnly === true || item.href === '/app';
	}
	if (item.fieldOnly) return false;
	if (item.authed && !auth.isAuthenticated) return false;
	if (item.adminConsole) {
		return auth.canAccessAdmin;
	}
	if (item.adminOnly) {
		return auth.role === 'admin' || auth.role === 'owner';
	}
	return true;
}
