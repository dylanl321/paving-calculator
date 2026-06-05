/**
 * POST /api/job-sites/[id]/logs/[logId]/weather
 * Re-fetches a weather snapshot for the daily log's job site and patches the
 * log row. Used when the initial auto-fetch failed (offline) or when the user
 * wants to update conditions mid-shift.
 *
 * Returns 200 { log } with updated weather fields on success.
 * Returns 503 if the weather API is unreachable.
 * Returns 422 if the job site has no lat/lng.
 */
import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import { fetchWeatherSnapshot } from '$lib/server/weather-snapshot';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const logDb = new DbLogHelper(platform!.env.DB);

	const log = await logDb.getDailyLogById(params.logId);
	if (!log) {
		throw error(404, 'Daily log not found');
	}

	const jobSite = await db.getJobSiteById(log.job_site_id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	if (jobSite.latitude == null || jobSite.longitude == null) {
		throw error(422, 'Job site has no coordinates — set lat/lng in Configuration first');
	}

	try {
		const snap = await fetchWeatherSnapshot(jobSite.latitude, jobSite.longitude);
		await logDb.updateDailyLog(params.logId, snap);
		const updatedLog = await logDb.getDailyLogById(params.logId);
		return json({ log: updatedLog });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Unknown error';
		throw error(503, `Weather service unavailable: ${msg}`);
	}
};
