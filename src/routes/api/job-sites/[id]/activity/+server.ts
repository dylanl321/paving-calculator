import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

interface AuditLogEntry {
	id: string;
	actor_user_id: string | null;
	actor_name: string | null;
	org_id: string;
	resource_type: string;
	resource_id: string;
	action: string;
	old_value: string | null;
	new_value: string | null;
	ip_address: string | null;
	user_agent: string | null;
	created_at: number;
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const d1 = event.platform!.env.DB;
		const jobSiteId = event.params.id!;

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		// verify job site belongs to org
		const jobSite = await d1
			.prepare('SELECT id, org_id FROM job_sites WHERE id = ? AND org_id = ?')
			.bind(jobSiteId, org.id)
			.first<{ id: string; org_id: string }>();

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		const url = event.url;
		const resourceType = url.searchParams.get('resource_type');
		const actorUserId = url.searchParams.get('actor_user_id');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);
		const before = url.searchParams.get('before') ? parseInt(url.searchParams.get('before')!) : null;

		// Build query: filter by org + (job site id OR related resource ids)
		// For simplicity, query org-wide and filter by resource_id = jobSiteId
		// OR resource_type in related types where resource_id is linked to this job site
		let query = `
			SELECT * FROM audit_log
			WHERE org_id = ?
			AND (
				resource_id = ?
				OR (resource_type = 'daily_log' AND resource_id IN (SELECT id FROM daily_logs WHERE job_site_id = ?))
				OR (resource_type = 'load' AND resource_id IN (SELECT id FROM load_entries WHERE log_id IN (SELECT id FROM daily_logs WHERE job_site_id = ?)))
				OR (resource_type = 'equipment' AND resource_id IN (SELECT id FROM equipment WHERE job_site_id = ?))
				OR (resource_type = 'milestone' AND resource_id IN (SELECT id FROM milestones WHERE job_site_id = ?))
			)
		`;
		const params: (string | number)[] = [org.id, jobSiteId, jobSiteId, jobSiteId, jobSiteId, jobSiteId];

		if (resourceType) {
			query += ' AND resource_type = ?';
			params.push(resourceType);
		}

		if (actorUserId) {
			query += ' AND actor_user_id = ?';
			params.push(actorUserId);
		}

		if (before) {
			query += ' AND created_at < ?';
			params.push(before);
		}

		query += ' ORDER BY created_at DESC LIMIT ?';
		params.push(limit + 1);

		const results = await d1.prepare(query).bind(...params).all<AuditLogEntry>();
		const entries = results.results || [];
		const hasMore = entries.length > limit;
		const returnedEntries = hasMore ? entries.slice(0, limit) : entries;

		// Collect unique actor names/ids for the filter dropdown
		const memberMap = new Map<string, string>();
		for (const entry of returnedEntries) {
			if (entry.actor_user_id && entry.actor_name) {
				memberMap.set(entry.actor_user_id, entry.actor_name);
			}
		}
		const members = Array.from(memberMap.entries()).map(([id, name]) => ({ id, name }));

		return json({
			entries: returnedEntries,
			next_cursor: hasMore ? returnedEntries[returnedEntries.length - 1].created_at : null,
			members
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get job site activity error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
