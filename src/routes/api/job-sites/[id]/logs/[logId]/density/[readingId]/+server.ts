import { json, error } from '@sveltejs/kit';
import { DbLogHelper } from '$lib/server/db-logs';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
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

	await dbLogs.deleteDensityReading(params.readingId);

	return json({ success: true });
};
