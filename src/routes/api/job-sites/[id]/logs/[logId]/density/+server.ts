import { json, error } from '@sveltejs/kit';
import { DbLogHelper } from '$lib/server/db-logs';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const dbLogs = new DbLogHelper(platform!.env.DB);

	const log = await dbLogs.getDailyLogById(params.logId);
	if (!log) {
		throw error(404, 'Daily log not found');
	}

	// Verify org access via job site
	const { DbHelper } = await import('$lib/server/db');
	const db = new DbHelper(platform!.env.DB);
	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const readings = await dbLogs.getDensityReadings(params.logId);

	return json({ readings });
};

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const dbLogs = new DbLogHelper(platform!.env.DB);

	const log = await dbLogs.getDailyLogById(params.logId);
	if (!log) {
		throw error(404, 'Daily log not found');
	}

	// Verify org access via job site
	const { DbHelper } = await import('$lib/server/db');
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

	if (typeof body.station_number !== 'number') {
		throw error(400, 'station_number is required and must be a number');
	}
	if (typeof body.wet_density_pcf !== 'number' || body.wet_density_pcf <= 0) {
		throw error(400, 'wet_density_pcf must be a positive number');
	}
	if (typeof body.moisture_pct !== 'number' || body.moisture_pct < 0) {
		throw error(400, 'moisture_pct must be a non-negative number');
	}

	const reading = await dbLogs.addDensityReading(params.logId, {
		station_number: body.station_number,
		lane: body.lane || null,
		reading_number: body.reading_number || 1,
		wet_density_pcf: body.wet_density_pcf,
		moisture_pct: body.moisture_pct,
		target_density_pcf: body.target_density_pcf || null,
		depth_in: body.depth_in || null,
		notes: body.notes || null
	});

	return json({ reading }, { status: 201 });
};
