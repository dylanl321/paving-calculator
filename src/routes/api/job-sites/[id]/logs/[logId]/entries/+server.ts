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

	// Auto-mark overlapping road sections as completed when a paving entry has station data
	let sectionsUpdated = 0;
	if (
		entry.entry_type === 'paving' &&
		entry.station_start != null &&
		entry.station_end != null
	) {
		const stationMin = Math.min(entry.station_start, entry.station_end);
		const stationMax = Math.max(entry.station_start, entry.station_end);

		// Overlap: section overlaps entry when section.station_start < entryMax AND section.station_end > entryMin
		const result = await platform!.env.DB.prepare(
			`UPDATE road_sections
			 SET status = 'completed', updated_at = unixepoch()
			 WHERE job_site_id = ?
			   AND status = 'active'
			   AND station_start IS NOT NULL
			   AND station_end IS NOT NULL
			   AND station_start < ?
			   AND station_end > ?`
		)
			.bind(log.job_site_id, stationMax, stationMin)
			.run();

		sectionsUpdated = result.meta?.changes ?? 0;
	}

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'log_entry',
		resourceId: entry.id,
		action: 'created',
		newValue: body
	});

	return json({ entry, sectionsUpdated }, { status: 201 });
};
