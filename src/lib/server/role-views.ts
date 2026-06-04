// Role-based view mapping for dashboard routing
// Server-side module - can be imported from server files and +page.server.ts

export type RoleView = 'full' | 'field' | 'office';

/**
 * Maps a role to its corresponding view level.
 * - screed_man, laborer -> 'field' (simplified field view)
 * - office -> 'office' (office-focused view)
 * - owner, admin, foreman, member, operator, inspector -> 'full' (full dashboard)
 */
export function getViewForRole(role: string): RoleView {
	switch (role) {
		case 'screed_man':
		case 'laborer':
			return 'field';
		case 'office':
			return 'office';
		case 'owner':
		case 'admin':
		case 'foreman':
		case 'member':
		case 'operator':
		case 'inspector':
			return 'full';
		default:
			return 'full';
	}
}

// Alias: getDefaultView for compatibility with task spec
export const getDefaultView = getViewForRole;

/**
 * Returns the redirect path for a given view level.
 * - 'full' -> '/dashboard'
 * - 'field' -> '/app/field'
 * - 'office' -> '/dashboard'
 */
export function getRedirectForView(view: RoleView): string {
	switch (view) {
		case 'field':
			return '/app/field';
		case 'office':
		case 'full':
			return '/dashboard';
	}
}

// Alias: getRedirectPath for compatibility with task spec
export const getRedirectPath = getRedirectForView;

/**
 * Returns the login redirect path based on role and optional preferred_view override.
 */
export function getLoginRedirect(role: string, preferredView?: string | null): string {
	const view = (preferredView as RoleView) || getViewForRole(role);
	return getRedirectForView(view);
}
