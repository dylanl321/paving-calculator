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
	{
		href: '/reference',
		label: 'Reference',
		icon: 'book',
		children: [{ href: '/reference/formulas', label: 'Formulas', icon: 'calc' }]
	},
	{ href: '/glossary', label: 'Glossary', icon: 'book' },
	{ href: '/dashboard/guides', label: 'Guides', icon: 'guide', authed: true },
	{ href: '/dashboard/completeness', label: 'Setup Status', icon: 'shield-check', authed: true, adminOnly: true },
	{ href: '/dashboard/import', label: 'Import', icon: 'upload', authed: true },
	{ href: '/dashboard/activity', label: 'Activity', icon: 'clock', authed: true, adminOnly: true },
	{ href: '/admin', label: 'Admin', icon: 'shield-check', authed: true, adminConsole: true, owns: ['/admin'] }
];
