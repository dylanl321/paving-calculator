import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, platform }) => {
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

	const entries = await logDb.getLogEntries(params.logId);
	const summary = await logDb.getLogSummary(params.logId);

	return json({ log, entries, summary });
};

export const PATCH: RequestHandler = async ({ params, locals, platform, request }) => {
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

	// Check if log is locked
	if (log.closed_at) {
		const userRole = await db.getUserRole(locals.user.id, org.id);
		const isAdmin = userRole === 'owner' || userRole === 'admin' || locals.user.isGlobalAdmin;
		if (!isAdmin) {
			throw error(423, 'Log is locked after close-out. Contact an admin to unlock.');
		}
	}

	const body = await request.json();

	await logDb.updateDailyLog(params.logId, body);

	const updatedLog = await logDb.getDailyLogById(params.logId);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'daily_log',
		resourceId: params.logId,
		action: 'updated',
		oldValue: log,
		newValue: updatedLog
	});

	return json({ log: updatedLog });
};
