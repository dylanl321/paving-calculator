import { json, type RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import { requireAuth } from '$lib/server/auth';

interface RouteRequestBody {
	waypoints?: Array<{ lat: number; lng: number }>;
}

function isRouteWaypoint(value: unknown): value is { lat: number; lng: number } {
	if (!value || typeof value !== 'object') return false;
	const waypoint = value as { lat?: unknown; lng?: unknown };
	return (
		typeof waypoint.lat === 'number' &&
		Number.isFinite(waypoint.lat) &&
		typeof waypoint.lng === 'number' &&
		Number.isFinite(waypoint.lng)
	);
}

function parseRouteWaypoints(raw: string, jobSiteId: string): Array<{ lat: number; lng: number }> {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed) && parsed.every(isRouteWaypoint)) {
			return parsed;
		}
		console.error('[job-site-route] Stored route has invalid waypoint shape', { jobSiteId });
	} catch (err) {
		console.error('[job-site-route] Stored route JSON could not be parsed', { jobSiteId, err });
	}

	return [];
}

function validateInputWaypoints(waypoints: unknown): Array<{ lat: number; lng: number }> | null {
	if (!Array.isArray(waypoints) || !waypoints.every(isRouteWaypoint)) {
		return null;
	}

	return waypoints;
}

async function loadAuthorizedJobSite(event: RequestEvent) {
	const user = await requireAuth(event);
	const db = new DbHelper(event.platform!.env.DB);
	const jobSiteId = event.params.id!;
	const jobSite = await db.getJobSiteById(jobSiteId);

	if (!jobSite) {
		return { response: json({ error: 'Job site not found' }, { status: 404 }) };
	}

	const role = await db.getUserRole(user.id, jobSite.org_id);
	if (!role) {
		return { response: json({ error: 'Access denied' }, { status: 403 }) };
	}

	return { db, jobSite, user };
}

export const GET: RequestHandler = async (event) => {
	try {
		const auth = await loadAuthorizedJobSite(event);
		if ('response' in auth) return auth.response;

		const route = await auth.db.getJobSiteRoute(event.params.id);

		return json({
			waypoints: route ? parseRouteWaypoints(route.waypoints, event.params.id) : []
		});
	} catch (err) {
		if (err instanceof Response) return err;
		console.error('[job-site-route] Failed to load route', { jobSiteId: event.params.id, err });
		return json({ error: 'Failed to load route', waypoints: [] }, { status: 500 });
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const auth = await loadAuthorizedJobSite(event);
		if ('response' in auth) return auth.response;

		const body = (await event.request.json()) as RouteRequestBody;
		const waypoints = validateInputWaypoints(body.waypoints);
		if (!waypoints) {
			return json({ error: 'Invalid waypoints' }, { status: 400 });
		}

		// Fetch old route for audit
		const oldRoute = await auth.db.getJobSiteRoute(event.params.id);

		await auth.db.upsertJobSiteRoute(event.params.id, waypoints);
		if (waypoints.length >= 2) {
			const center = waypoints[Math.floor(waypoints.length / 2)];
			await auth.db.updateJobSite(event.params.id, {
				latitude: center.lat,
				longitude: center.lng,
				location_source: 'manual',
				location_precision: 'route'
			});
		}

		await recordAudit(event.platform!.env.DB, {
			actorUserId: auth.user.id,
			actorName: auth.user.name,
			orgId: auth.jobSite.org_id,
			resourceType: 'route',
			resourceId: event.params.id,
			action: oldRoute ? 'update' : 'create',
			oldValue: oldRoute
				? { waypoints: parseRouteWaypoints(oldRoute.waypoints, event.params.id) }
				: undefined,
			newValue: { waypoints },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({
			success: true,
			location:
				waypoints.length >= 2
					? {
							latitude: waypoints[Math.floor(waypoints.length / 2)].lat,
							longitude: waypoints[Math.floor(waypoints.length / 2)].lng,
							location_source: 'manual',
							location_precision: 'route'
						}
					: null
		});
	} catch (err) {
		if (err instanceof Response) return err;
		console.error('[job-site-route] Failed to save route', { jobSiteId: event.params.id, err });
		return json({ error: 'Failed to save route' }, { status: 500 });
	}
};
