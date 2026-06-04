import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';

const RANGE_TO_SECONDS: Record<string, number> = {
	'1h': 3600,
	'6h': 21600,
	'24h': 86400,
	'7d': 604800,
	'30d': 2592000
};

interface ErrorSummary {
	fingerprint: string;
	count: number;
	first_seen: number;
	last_seen: number;
	sample_message: string;
	sample_stack: string | null;
	affected_routes: string[];
	affected_users_count: number;
}

interface TrendBucket {
	hour: string;
	count: number;
}

export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const db = event.platform!.env.DB;
		const kv = event.platform!.env.KV;
		const url = new URL(event.request.url);

		const range = url.searchParams.get('range') ?? '24h';
		const sort = url.searchParams.get('sort') ?? 'count';
		const page = parseInt(url.searchParams.get('page') ?? '1', 10);
		const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

		const rangeSeconds = RANGE_TO_SECONDS[range] ?? RANGE_TO_SECONDS['24h'];
		const cutoffTimestamp = Math.floor(Date.now() / 1000) - rangeSeconds;

		// Get resolved errors from KV
		let resolvedFingerprints: string[] = [];
		try {
			const resolvedData = await kv.get('admin:resolved_errors', 'text');
			if (resolvedData) {
				resolvedFingerprints = JSON.parse(resolvedData);
			}
		} catch {
			// Ignore KV errors
		}

		// Query errors with fingerprint grouping
		// fingerprint = first line of error_message + '|' + path
		const fingerprintExpr = `substr(error_message, 1, CASE
			WHEN instr(error_message, char(10)) > 0
			THEN instr(error_message, char(10)) - 1
			ELSE length(error_message)
		END) || '|' || COALESCE(path, '')`;

		const groupedQuery = `
			SELECT
				${fingerprintExpr} as fingerprint,
				COUNT(*) as count,
				MIN(timestamp) as first_seen,
				MAX(timestamp) as last_seen,
				MAX(error_message) as sample_message,
				MAX(error_stack) as sample_stack
			FROM app_logs
			WHERE level = 'error' AND timestamp > ?
			GROUP BY fingerprint
			ORDER BY ${sort === 'recent' ? 'last_seen DESC' : 'count DESC'}
		`;

		const groupedRows = await db.prepare(groupedQuery).bind(cutoffTimestamp).all();

		let errors: ErrorSummary[] = [];

		for (const row of groupedRows.results ?? []) {
			const r = row as Record<string, unknown>;
			const fingerprint = r.fingerprint as string;

			// Filter out resolved errors
			if (resolvedFingerprints.includes(fingerprint)) {
				continue;
			}

			// Get affected routes for this fingerprint
			const routesQuery = `
				SELECT DISTINCT path
				FROM app_logs
				WHERE level = 'error'
					AND timestamp > ?
					AND ${fingerprintExpr} = ?
					AND path IS NOT NULL
			`;
			const routesResult = await db.prepare(routesQuery).bind(cutoffTimestamp, fingerprint).all();
			const affected_routes = (routesResult.results ?? []).map((rr) => (rr as { path: string }).path);

			// Get affected users count
			const usersQuery = `
				SELECT COUNT(DISTINCT user_id) as count
				FROM app_logs
				WHERE level = 'error'
					AND timestamp > ?
					AND ${fingerprintExpr} = ?
					AND user_id IS NOT NULL
			`;
			const usersResult = await db
				.prepare(usersQuery)
				.bind(cutoffTimestamp, fingerprint)
				.first<{ count: number }>();
			const affected_users_count = usersResult?.count ?? 0;

			errors.push({
				fingerprint,
				count: r.count as number,
				first_seen: r.first_seen as number,
				last_seen: r.last_seen as number,
				sample_message: r.sample_message as string,
				sample_stack: (r.sample_stack as string | null) ?? null,
				affected_routes,
				affected_users_count
			});
		}

		// Pagination
		const offset = (page - 1) * limit;
		const paginatedErrors = errors.slice(offset, offset + limit);

		// Summary stats
		const totalErrorsQuery = `SELECT COUNT(*) as total FROM app_logs WHERE level = 'error' AND timestamp > ?`;
		const totalResult = await db
			.prepare(totalErrorsQuery)
			.bind(cutoffTimestamp)
			.first<{ total: number }>();
		const total_errors = totalResult?.total ?? 0;
		const unique_errors = errors.length;

		// Error rate (errors per total requests in range)
		const totalRequestsQuery = `SELECT COUNT(*) as total FROM app_logs WHERE timestamp > ?`;
		const totalRequestsResult = await db
			.prepare(totalRequestsQuery)
			.bind(cutoffTimestamp)
			.first<{ total: number }>();
		const total_requests = totalRequestsResult?.total ?? 1;
		const error_rate = total_requests > 0 ? (total_errors / total_requests) * 100 : 0;

		// Trend: last 24 hours in 1-hour buckets
		const trendCutoff = Math.floor(Date.now() / 1000) - 86400;
		const trendQuery = `
			SELECT
				strftime('%Y-%m-%dT%H:00:00', datetime(timestamp, 'unixepoch')) as hour,
				COUNT(*) as count
			FROM app_logs
			WHERE level = 'error' AND timestamp > ?
			GROUP BY hour
			ORDER BY hour
		`;
		const trendResult = await db.prepare(trendQuery).bind(trendCutoff).all();
		const trend: TrendBucket[] = (trendResult.results ?? []).map((t) => {
			const tr = t as Record<string, unknown>;
			return {
				hour: tr.hour as string,
				count: tr.count as number
			};
		});

		return json({
			summary: {
				total_errors,
				unique_errors,
				error_rate: Math.round(error_rate * 100) / 100
			},
			errors: paginatedErrors,
			trend
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error fetching error tracking data:', error);
		return json({ error: 'Failed to fetch error tracking data' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const kv = event.platform!.env.KV;
		const body = await event.request.json();
		const { fingerprint } = body as { fingerprint?: string };

		if (!fingerprint || typeof fingerprint !== 'string') {
			return json({ error: 'Invalid fingerprint' }, { status: 400 });
		}

		// Get current resolved list
		let resolvedFingerprints: string[] = [];
		try {
			const resolvedData = await kv.get('admin:resolved_errors', 'text');
			if (resolvedData) {
				resolvedFingerprints = JSON.parse(resolvedData);
			}
		} catch {
			// Ignore
		}

		// Add to resolved list if not already there
		if (!resolvedFingerprints.includes(fingerprint)) {
			resolvedFingerprints.push(fingerprint);
			await kv.put('admin:resolved_errors', JSON.stringify(resolvedFingerprints));
		}

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error resolving error:', error);
		return json({ error: 'Failed to resolve error' }, { status: 500 });
	}
}
