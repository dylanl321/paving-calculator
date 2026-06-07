// Role-based view mapping for dashboard routing
// Server-side module - can be imported from server files and +page.server.ts

import { getUxRole } from '$lib/uxRole';

export type RoleView = 'full' | 'field' | 'office';

/**
 * Maps a role to its corresponding view level.
 *
 * The field-vs-non-field split for RECOGNIZED roles is DERIVED from the single
 * source of truth (`getUxRole` in `$lib/uxRole`): any recognized role whose UX
 * role is 'field_crew' gets the simplified 'field' view. This is why `operator`
 * now maps to 'field' (previously 'full') — operator is part of Field Crew.
 *
 * Unknown roles intentionally fall back to 'full' here (matching this module's
 * long-standing default + redirect behavior), even though `getUxRole` defaults
 * unknown roles to 'field_crew' for its own least-privileged landing. We keep
 * the field decision scoped to the known field DB roles so unrecognized roles
 * (and `member`) keep the existing full-dashboard behavior.
 *
 * - screed_man, laborer, operator -> 'field'  (UX role field_crew)
 * - office                        -> 'office'
 * - owner, admin, foreman, member, inspector, unknown -> 'full'
 */
export function getViewForRole(role: string): RoleView {
	const FIELD_DB_ROLES = new Set(['operator', 'laborer', 'screed_man']);
	if (FIELD_DB_ROLES.has(role) && getUxRole(role) === 'field_crew') {
		return 'field';
	}
	if (role === 'office') {
		return 'office';
	}
	return 'full';
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
