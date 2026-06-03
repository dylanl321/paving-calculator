import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import { recordAudit } from '$lib/server/audit';
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

	if (jobSite.id !== params.id) {
		throw error(400, 'Log does not belong to this job site');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	// Verify user is admin/owner
	const userRole = await db.getUserRole(locals.user.id, org.id);
	const isAdmin = userRole === 'owner' || userRole === 'admin' || locals.user.isGlobalAdmin;
	if (!isAdmin) {
		throw error(403, 'Only administrators can unlock logs');
	}

	await logDb.reopenDailyLog(params.logId);

	const updatedLog = await logDb.getDailyLogById(params.logId);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'daily_log',
		resourceId: params.logId,
		action: 'reopened',
		oldValue: { closed_at: log.closed_at }
	});

	return json({ log: updatedLog });
};
