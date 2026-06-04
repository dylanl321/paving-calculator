import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const db = event.platform!.env.DB;
		const url = new URL(event.request.url);

		const user_id = url.searchParams.get('user_id');
		const org_id = url.searchParams.get('org_id');
		const event_type = url.searchParams.get('event_type');
		const from = url.searchParams.get('from');
		const to = url.searchParams.get('to');
		const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
		const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

		const conditions: string[] = [];
		const params: (string | number)[] = [];

		if (user_id) {
			conditions.push('user_id = ?');
			params.push(user_id);
		}
		if (org_id) {
			conditions.push('org_id = ?');
			params.push(org_id);
		}
		if (event_type) {
			conditions.push('event_type = ?');
			params.push(event_type);
		}
		if (from) {
			conditions.push('created_at >= ?');
			params.push(parseInt(from, 10));
		}
		if (to) {
			conditions.push('created_at <= ?');
			params.push(parseInt(to, 10));
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

		const countResult = await db
			.prepare(`SELECT COUNT(*) as total FROM admin_audit_log ${where}`)
			.bind(...params)
			.first<{ total: number }>();

		const total = countResult?.total ?? 0;

		const rows = await db
			.prepare(
				`SELECT id, user_id, org_id, event_type, ip_address, user_agent, metadata, created_at
				 FROM admin_audit_log ${where}
				 ORDER BY created_at DESC
				 LIMIT ? OFFSET ?`
			)
			.bind(...params, limit, offset)
			.all();

		const events = (rows.results ?? []).map((row) => {
			const r = row as Record<string, unknown>;
			return { ...r, metadata: r.metadata ? JSON.parse(r.metadata as string) : null };
		});

		return json({ events, total });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error fetching audit log:', error);
		return json({ error: 'Failed to fetch audit log' }, { status: 500 });
	}
}
