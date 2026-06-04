import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireGlobalAdmin } from '$lib/server/auth';

interface LogRow {
	id: string;
	timestamp: string;
	level: string;
	method: string | null;
	path: string | null;
	status: number | null;
	latencyMs: number | null;
	userId: string | null;
	orgId: string | null;
	ip: string | null;
	userAgent: string | null;
	cfRay: string | null;
	errorMessage: string | null;
	errorStack: string | null;
	metadata: unknown | null;
}

interface LogsResponse {
	logs: LogRow[];
	total: number;
}

export const GET: RequestHandler = async (event) => {
	await requireGlobalAdmin(event);

	const db = event.platform!.env.DB;

	// Parse query params
	const level = event.url.searchParams.get('level');
	const path = event.url.searchParams.get('path');
	const userId = event.url.searchParams.get('user_id');
	const dateFrom = event.url.searchParams.get('date_from');
	const dateTo = event.url.searchParams.get('date_to');
	const limitParam = event.url.searchParams.get('limit');
	const offsetParam = event.url.searchParams.get('offset');

	const limit = Math.min(Math.max(1, parseInt(limitParam || '50', 10)), 200);
	const offset = Math.max(0, parseInt(offsetParam || '0', 10));

	// Build WHERE clauses
	const whereClauses: string[] = [];
	const params: unknown[] = [];

	if (level && level !== 'all') {
		whereClauses.push('level = ?');
		params.push(level);
	}

	if (path) {
		whereClauses.push('path LIKE ?');
		params.push(path + '%');
	}

	if (userId) {
		whereClauses.push('user_id = ?');
		params.push(userId);
	}

	if (dateFrom) {
		const fromUnix = Math.floor(new Date(dateFrom).getTime() / 1000);
		whereClauses.push('timestamp >= ?');
		params.push(fromUnix);
	}

	if (dateTo) {
		const toUnix = Math.floor(new Date(dateTo).getTime() / 1000);
		whereClauses.push('timestamp <= ?');
		params.push(toUnix);
	}

	const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

	// Count query
	const countQuery = `SELECT COUNT(*) as count FROM app_logs ${whereClause}`;
	const countResult = await db.prepare(countQuery).bind(...params).first<{ count: number }>();
	const total = countResult?.count ?? 0;

	// Data query
	const dataQuery = `
		SELECT
			id,
			timestamp,
			level,
			method,
			path,
			status,
			latency_ms,
			user_id,
			org_id,
			ip,
			user_agent,
			cf_ray,
			error_message,
			error_stack,
			metadata
		FROM app_logs
		${whereClause}
		ORDER BY timestamp DESC
		LIMIT ? OFFSET ?
	`;

	const dataParams = [...params, limit, offset];
	const result = await db.prepare(dataQuery).bind(...dataParams).all<{
		id: string;
		timestamp: number;
		level: string;
		method: string | null;
		path: string | null;
		status: number | null;
		latency_ms: number | null;
		user_id: string | null;
		org_id: string | null;
		ip: string | null;
		user_agent: string | null;
		cf_ray: string | null;
		error_message: string | null;
		error_stack: string | null;
		metadata: string | null;
	}>();

	// Transform to camelCase response
	const logs: LogRow[] = (result.results ?? []).map((row) => ({
		id: row.id,
		timestamp: new Date(row.timestamp * 1000).toISOString(),
		level: row.level,
		method: row.method,
		path: row.path,
		status: row.status,
		latencyMs: row.latency_ms,
		userId: row.user_id,
		orgId: row.org_id,
		ip: row.ip,
		userAgent: row.user_agent,
		cfRay: row.cf_ray,
		errorMessage: row.error_message,
		errorStack: row.error_stack,
		metadata: row.metadata ? JSON.parse(row.metadata) : null
	}));

	const response: LogsResponse = {
		logs,
		total
	};

	return json(response);
};
