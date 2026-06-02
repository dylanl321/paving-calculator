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

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const userRole = await db.getUserRole(user.id, org.id);
		if (userRole !== 'owner' && userRole !== 'admin') {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const url = event.url;
		const resourceType = url.searchParams.get('resource_type');
		const resourceId = url.searchParams.get('resource_id');
		const actorUserId = url.searchParams.get('actor_user_id');
		const action = url.searchParams.get('action');
		const fromTs = url.searchParams.get('from_ts');
		const toTs = url.searchParams.get('to_ts');
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
		const before = url.searchParams.get('before')
			? parseInt(url.searchParams.get('before')!)
			: null;

		let query = 'SELECT * FROM audit_log WHERE org_id = ?';
		const params: (string | number)[] = [org.id];

		if (resourceType) {
			query += ' AND resource_type = ?';
			params.push(resourceType);
		}

		if (resourceId) {
			query += ' AND resource_id = ?';
			params.push(resourceId);
		}

		if (actorUserId) {
			query += ' AND actor_user_id = ?';
			params.push(actorUserId);
		}

		if (action) {
			query += ' AND action = ?';
			params.push(action);
		}

		if (fromTs) {
			const fromTimestamp = parseInt(fromTs);
			if (!isNaN(fromTimestamp)) {
				query += ' AND created_at >= ?';
				params.push(fromTimestamp);
			}
		}

		if (toTs) {
			const toTimestamp = parseInt(toTs);
			if (!isNaN(toTimestamp)) {
				query += ' AND created_at <= ?';
				params.push(toTimestamp);
			}
		}

		if (before) {
			query += ' AND created_at < ?';
			params.push(before);
		}

		query += ' ORDER BY created_at DESC LIMIT ?';
		params.push(limit + 1);

		const results = await event.platform!.env.DB.prepare(query)
			.bind(...params)
			.all<AuditLogEntry>();

		const entries = results.results || [];
		const hasMore = entries.length > limit;
		const returnedEntries = hasMore ? entries.slice(0, limit) : entries;

		event.platform!.env.DB.prepare(
			'DELETE FROM audit_log WHERE org_id = ? AND created_at < ?'
		)
			.bind(org.id, Math.floor(Date.now() / 1000) - 7776000)
			.run()
			.catch((err: unknown) => {
				console.error('Failed to prune old audit entries:', err);
			});

		return json({
			entries: returnedEntries,
			next_cursor: hasMore ? returnedEntries[returnedEntries.length - 1].created_at : null
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get audit log error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
