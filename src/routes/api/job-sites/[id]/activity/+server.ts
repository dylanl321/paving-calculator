import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import type { RequestHandler } from './$types';

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

interface User {
	id: string;
	name: string;
}

export const GET: RequestHandler = async ({ params, locals, platform, url }) => {
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

	const resourceType = url.searchParams.get('resource_type');
	const actorUserId = url.searchParams.get('actor_user_id');
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '25'), 100);
	const before = url.searchParams.get('before')
		? parseInt(url.searchParams.get('before')!)
		: null;

	let query = 'SELECT * FROM audit_log WHERE org_id = ? AND resource_id = ?';
	const queryParams: (string | number)[] = [org.id, params.id];

	if (resourceType) {
		query += ' AND resource_type = ?';
		queryParams.push(resourceType);
	}

	if (actorUserId) {
		query += ' AND actor_user_id = ?';
		queryParams.push(actorUserId);
	}

	if (before) {
		query += ' AND created_at < ?';
		queryParams.push(before);
	}

	query += ' ORDER BY created_at DESC LIMIT ?';
	queryParams.push(limit + 1);

	const results = await platform!.env.DB.prepare(query)
		.bind(...queryParams)
		.all<AuditLogEntry>();

	const entries = results.results || [];
	const hasMore = entries.length > limit;
	const returnedEntries = hasMore ? entries.slice(0, limit) : entries;

	const actorIds = new Set<string>();
	for (const entry of returnedEntries) {
		if (entry.actor_user_id) {
			actorIds.add(entry.actor_user_id);
		}
	}

	const users: User[] = [];
	for (const actorId of actorIds) {
		const user = await db.getUserById(actorId);
		if (user) {
			users.push({ id: user.id, name: user.name });
		}
	}

	return json({
		entries: returnedEntries,
		next_cursor: hasMore ? returnedEntries[returnedEntries.length - 1].created_at : null,
		users
	});
};
