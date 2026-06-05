import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { DbRoadwayLogEvent } from '$lib/server/db-jobsites';
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

	const result = await platform!.env.DB.prepare(
		`SELECT * FROM roadway_log_events
		WHERE job_site_id = ?
		ORDER BY sort_order ASC, milepost ASC`
	)
		.bind(params.id)
		.all<DbRoadwayLogEvent>();

	return json({ events: result.results ?? [] });
};
