import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
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

	const log = await logDb.getDailyLogById(params.logId);
	if (!log) {
		throw error(404, 'Daily log not found');
	}

	if (log.job_site_id !== params.id) {
		throw error(403, 'Log does not belong to this job site');
	}

	const body = (await request.json()) as { foreman_name?: string };
	const foremanName = body.foreman_name?.trim();

	if (!foremanName) {
		throw error(400, 'Foreman name is required');
	}

	await logDb.closeDailyLog(params.logId, foremanName);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'daily_log',
		resourceId: log.id,
		action: 'closed',
		newValue: { foreman_name: foremanName, closed_at: Math.floor(Date.now() / 1000) }
	});

	const updatedLog = await logDb.getDailyLogById(params.logId);

	return json({ log: updatedLog });
};
