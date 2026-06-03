import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DbLogHelper } from '$lib/server/db-logs';
import { DbHelper } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const logDb = new DbLogHelper(platform!.env.DB);

	// Load log
	const log = await logDb.getDailyLogById(params.logId);
	if (!log) {
		throw error(404, 'Log not found');
	}

	// Verify site access
	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	if (log.job_site_id !== params.id) {
		throw error(400, 'Log does not belong to this job site');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	// Load all entries for this log, sorted by timestamp (already sorted ASC by getLogEntries)
	const allEntries = await logDb.getLogEntries(log.id);

	// Return ALL entry types, including paving, milling, tack, break, delay, note
	const entries = allEntries.map((e) => ({
		id: e.id,
		timestamp: e.timestamp,
		station_start: e.station_start,
		station_end: e.station_end,
		distance_ft: e.distance_ft,
		lane: e.lane,
		tons_placed: e.tons_placed,
		spread_rate_actual: e.spread_rate_actual,
		entry_type: e.entry_type,
		notes: e.notes
	}));

	let totalTons = 0;
	let totalDistance = 0;
	for (const entry of entries) {
		if (entry.tons_placed) totalTons += entry.tons_placed;
		if (entry.distance_ft) totalDistance += entry.distance_ft;
	}

	return json({
		entries,
		log_date: log.log_date,
		total_paved_ft: totalDistance,
		total_tons: totalTons
	});
};
