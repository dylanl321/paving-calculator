/**
 * role-routing.ts
 *
 * Client-safe utilities for mapping roles to view tiers and redirect paths.
 * This is a UX routing helper only -- not a security boundary.
 * Server-side auth guards remain the actual access control.
 */

export type ViewTier = 'full' | 'field' | 'screed' | 'office';

/**
 * Returns the default view tier for a given role.
 */
export function viewTierForRole(role: string): ViewTier {
	switch (role) {
		case 'owner':
		case 'admin':
		case 'foreman':
		case 'member': // legacy fallback -- treat as full for now
			return 'full';

		case 'laborer':
		case 'operator':
			return 'field';

		case 'screed_man':
			return 'screed';

		case 'office':
		case 'inspector': // inspectors need dashboard for density log access
			return 'office';

		default:
			return 'full'; // safest fallback -- never silently hide data
	}
}

/**
 * Returns the URL path for a given view tier.
 * Note: field routes to /app while /app/field is not yet built.
 */
export function defaultRouteForTier(tier: ViewTier): string {
	switch (tier) {
		case 'full':
		case 'office':
			return '/dashboard';
		case 'field':
			// /app/field is planned but not yet built; use /app as interim
			return '/app';
		case 'screed':
			return '/app';
	}
}

/**
 * Convenience: returns the redirect path for a role, respecting an optional
 * per-user preferred_view override stored in org_members.preferred_view.
 */
export function getLoginRedirect(role: string, preferredView?: string | null): string {
	const validTiers: ViewTier[] = ['full', 'field', 'screed', 'office'];
	const effectiveTier: ViewTier =
		preferredView && (validTiers as string[]).includes(preferredView)
			? (preferredView as ViewTier)
			: viewTierForRole(role);
	return defaultRouteForTier(effectiveTier);
}
