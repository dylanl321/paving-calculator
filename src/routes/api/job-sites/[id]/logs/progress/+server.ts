import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const logDb = new DbLogHelper(platform!.env.DB);

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	// Today's date in YYYY-MM-DD format (UTC)
	const now = new Date();
	const today = now.toISOString().slice(0, 10);

	// Load all daily logs for this job site, with date
	const logsResult = await platform!.env.DB.prepare(
		'SELECT id, log_date FROM daily_logs WHERE job_site_id = ? ORDER BY log_date ASC'
	)
		.bind(params.id)
		.all<{ id: string; log_date: string }>();

	const logs = logsResult.results;

	// Collect all paving entries across all logs
	const progress: Array<{
		station_start: number | null;
		station_end: number | null;
		distance_ft: number | null;
		entry_type: string;
		lane: string | null;
		spread_rate_actual: number | null;
		tons_placed: number | null;
		log_date: string | null;
		lift: string | null;
	}> = [];

	let totalPavedFt = 0;
	let totalTons = 0;
	const datesWithData = new Set<string>();

	for (const log of logs) {
		const entries = await logDb.getLogEntries(log.id);
		for (const entry of entries) {
			if (entry.entry_type === 'paving') {
				const distFt = entry.distance_ft ?? null;
				const tons = entry.tons_placed ?? null;

				progress.push({
					station_start: entry.station_start,
					station_end: entry.station_end,
					distance_ft: distFt,
					entry_type: entry.entry_type,
					lane: entry.lane ?? null,
					spread_rate_actual: entry.spread_rate_actual ?? null,
					tons_placed: tons,
					log_date: log.log_date,
					lift: null // lift column not yet in schema
				});
				if (distFt) totalPavedFt += distFt;
				if (tons) totalTons += tons;
				datesWithData.add(log.log_date);
			}
		}
	}

	return json({
		progress,
		total_paved_ft: totalPavedFt,
		total_tons: totalTons,
		today,
		days_with_data: datesWithData.size
	});
};
