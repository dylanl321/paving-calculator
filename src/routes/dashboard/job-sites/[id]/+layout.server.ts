import { error, redirect } from '@sveltejs/kit';
import { jobSiteAccessDecision } from '$lib/server/job-site-access';
import type { LayoutServerLoad } from './$types';

/** Server gate for the project page, today's log, and log history. */
export const load: LayoutServerLoad = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}
	if (!event.platform?.env?.DB) return {};
	const decision = await jobSiteAccessDecision(
		event.platform.env.DB,
		event.locals.user.id,
		event.params.id
	);
	if (!decision.ok) {
		throw error(decision.status, decision.error);
	}
	return {};
};
