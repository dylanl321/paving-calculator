import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';

interface RouteRequestBody {
	waypoints?: Array<{ lat: number; lng: number }>;
}

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

	const body = (await request.json()) as RouteRequestBody;
	const { waypoints } = body;

	if (!Array.isArray(waypoints)) {
		throw error(400, 'Invalid waypoints');
	}

	for (const wp of waypoints) {
		if (typeof wp.lat !== 'number' || typeof wp.lng !== 'number') {
			throw error(400, 'Invalid waypoint format');
		}
	}

	// Fetch old route for audit
	const oldRoute = await db.getJobSiteRoute(params.id);

	await db.upsertJobSiteRoute(params.id, waypoints);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'route',
		resourceId: params.id,
		action: oldRoute ? 'update' : 'create',
		oldValue: oldRoute ? { waypoints: JSON.parse(oldRoute.waypoints) } : undefined,
		newValue: { waypoints },
		ipAddress:
			request.headers.get('cf-connecting-ip') ||
			request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: request.headers.get('user-agent') || undefined
	});

	return json({ success: true });
};
