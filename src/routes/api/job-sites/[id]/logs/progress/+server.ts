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

	// Load all daily logs for this job site
	const logsResult = await platform!.env.DB.prepare(
		'SELECT id FROM daily_logs WHERE job_site_id = ? ORDER BY log_date ASC'
	)
		.bind(params.id)
		.all<{ id: string }>();

	const logs = logsResult.results;

	// Collect all paving entries across all logs
	const progress: Array<{
		station_start: number | null;
		station_end: number | null;
		distance_ft: number | null;
		entry_type: string;
		lane: string | null;
	}> = [];

	let totalPavedFt = 0;
	let totalTons = 0;

	for (const log of logs) {
		const entries = await logDb.getLogEntries(log.id);
		for (const entry of entries) {
			if (entry.entry_type === 'paving') {
				progress.push({
					station_start: entry.station_start,
					station_end: entry.station_end,
					distance_ft: entry.distance_ft,
					entry_type: entry.entry_type,
					lane: entry.lane ?? null
				});
				if (entry.distance_ft) totalPavedFt += entry.distance_ft;
				if (entry.tons_placed) totalTons += entry.tons_placed;
			}
		}
	}

	return json({ progress, total_paved_ft: totalPavedFt, total_tons: totalTons });
};
