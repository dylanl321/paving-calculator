import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import type { DbLogEntry } from '$lib/server/db-logs';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

type LogEntryUpdateBody = Partial<
	Pick<
		DbLogEntry,
		| 'timestamp'
		| 'station_start'
		| 'station_end'
		| 'distance_ft'
		| 'tons_placed'
		| 'loads_count'
		| 'truck_tickets'
		| 'spread_rate_actual'
		| 'tack_gallons'
		| 'lane'
		| 'notes'
	>
>;

export const PATCH: RequestHandler = async ({ params, locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const logDb = new DbLogHelper(platform!.env.DB);

	const entry = await logDb.getLogEntryById(params.entryId);
	if (!entry) {
		throw error(404, 'Log entry not found');
	}

	const log = await logDb.getDailyLogById(entry.daily_log_id);
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

	const body = (await request.json()) as LogEntryUpdateBody;

	await logDb.updateLogEntry(params.entryId, body);

	const updatedEntry = await logDb.getLogEntryById(params.entryId);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'log_entry',
		resourceId: params.entryId,
		action: 'updated',
		oldValue: entry,
		newValue: updatedEntry
	});

	return json({ entry: updatedEntry });
};

export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const logDb = new DbLogHelper(platform!.env.DB);

	const entry = await logDb.getLogEntryById(params.entryId);
	if (!entry) {
		throw error(404, 'Log entry not found');
	}

	const log = await logDb.getDailyLogById(entry.daily_log_id);
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

	await logDb.deleteLogEntry(params.entryId);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'log_entry',
		resourceId: params.entryId,
		action: 'deleted',
		oldValue: entry
	});

	return json({ success: true });
};
