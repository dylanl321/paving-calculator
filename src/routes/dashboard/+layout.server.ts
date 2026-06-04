import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getDefaultView, getRedirectPath } from '$lib/server/role-views';

/**
 * Dashboard layout guard: redirect field-tier roles away from the dashboard.
 *
 * Field-tier roles (laborer, operator) should not land on /dashboard.
 * This is a UX routing guard, not a security boundary -- server-side API
 * routes retain their own auth gates.
 *
 * screed_man also does not need the full dashboard; redirect to /app.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	// locals.user is populated by hooks.server.ts if auth is wired up.
	// If not available (no hooks integration yet), skip the guard gracefully.
	const role = (locals as Record<string, unknown>).role as string | undefined;
	const preferredView = (locals as Record<string, unknown>).preferred_view as string | null | undefined;

	if (!role) {
		// Role not in locals -- the dashboard's own load functions handle auth redirects.
		return {};
	}

	const view = preferredView
		? preferredView
		: getDefaultView(role);

	// Only redirect non-dashboard tiers.
	if (view === 'field') {
		throw redirect(302, getRedirectPath('field'));
	}

	return {};
};
