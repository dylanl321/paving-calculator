import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DbHelper } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const jobSite = await db.getJobSiteById(params.id);

	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const route = await db.getJobSiteRoute(params.id);

	if (!route) {
		return json({ waypoints: [] });
	}

	return json({
		waypoints: JSON.parse(route.waypoints)
	});
};

export const PUT: RequestHandler = async ({ params, platform, locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const jobSite = await db.getJobSiteById(params.id);

	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const body = await request.json();
	const { waypoints } = body;

	if (!Array.isArray(waypoints)) {
		throw error(400, 'Invalid waypoints');
	}

	for (const wp of waypoints) {
		if (typeof wp.lat !== 'number' || typeof wp.lng !== 'number') {
			throw error(400, 'Invalid waypoint format');
		}
	}

	await db.upsertJobSiteRoute(params.id, waypoints);

	return json({ success: true });
};
