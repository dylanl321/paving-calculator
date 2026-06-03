import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import type { DbDotRoadSegment } from '$lib/server/db';

export async function GET(event: RequestEvent) {
	await requireAuth(event);

	if (!event.platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 503 });
	}

	const url = new URL(event.request.url);
	const state = url.searchParams.get('state') || 'AL';
	const limit = parseInt(url.searchParams.get('limit') || '50', 10);
	const offset = parseInt(url.searchParams.get('offset') || '0', 10);

	// Validate state
	if (!['AL', 'TX', 'GA', 'FL'].includes(state)) {
		return json({ error: 'Invalid state DOT' }, { status: 400 });
	}

	// Validate limit
	if (limit < 1 || limit > 500) {
		return json({ error: 'Limit must be between 1 and 500' }, { status: 400 });
	}

	try {
		// Check if the table exists yet (migration may not have been applied to remote)
		const tableCheck = await event.platform.env.DB
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dot_road_segments'")
			.first<{ name: string }>();

		if (!tableCheck) {
			// Migration not yet applied - return empty data instead of crashing
			return json({
				segments: [],
				total: 0,
				state,
				limit,
				offset,
				migration_pending: true
			});
		}

		// Get total count
		const countResult = await event.platform.env.DB
			.prepare('SELECT COUNT(*) as count FROM dot_road_segments WHERE state_dot = ?')
			.bind(state)
			.first<{ count: number }>();

		const total = countResult?.count ?? 0;

		// Get paginated segments
		const segments = await event.platform.env.DB
			.prepare(
				`SELECT * FROM dot_road_segments
				 WHERE state_dot = ?
				 ORDER BY road_name, route_id
				 LIMIT ? OFFSET ?`
			)
			.bind(state, limit, offset)
			.all<DbDotRoadSegment>()
			.then((r) => r.results);

		return json({
			segments,
			total,
			state,
			limit,
			offset
		});
	} catch (err) {
		console.error('Error fetching DOT segments:', err);
		return json({ error: 'Failed to fetch DOT segments' }, { status: 500 });
	}
}
