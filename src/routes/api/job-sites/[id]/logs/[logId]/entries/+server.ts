import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import type { DbLogEntry } from '$lib/server/db-logs';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

interface LogEntryCreateBody {
	entry_type: DbLogEntry['entry_type'];
	timestamp: string;
	station_start?: number | null;
	station_end?: number | null;
	distance_ft?: number | null;
	tons_placed?: number | null;
	loads_count?: number | null;
	truck_tickets?: string[] | null;
	spread_rate_actual?: number | null;
	tack_gallons?: number | null;
	lane?: string | null;
	notes?: string | null;
}

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
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

	const body = (await request.json()) as LogEntryCreateBody;

	const entry = await logDb.createLogEntry(params.logId, body);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'log_entry',
		resourceId: entry.id,
		action: 'created',
		newValue: body
	});

	return json({ entry }, { status: 201 });
};
