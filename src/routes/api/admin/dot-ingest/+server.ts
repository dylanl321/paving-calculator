import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { ingestGdot } from '$lib/server/dot';

/**
 * POST /api/admin/dot-ingest
 * Triggers GDOT data ingestion (Georgia only).
 * Requires global admin authentication.
 */
export async function POST(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const db = new DbHelper(event.platform!.env.DB);

		console.log('[api:dot-ingest] Running GDOT ingestion pipeline');
		const result = await ingestGdot(db);

		return json({ results: { GA: result } });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('[api:dot-ingest] Error:', error);
		return json({ error: 'Failed to run GDOT ingestion' }, { status: 500 });
	}
}

/**
 * GET /api/admin/dot-ingest
 * Returns the last GDOT sync status.
 * Requires global admin authentication.
 */
export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const db = new DbHelper(event.platform!.env.DB);
		const gdotSync = await db.getLastDotSync('GA', 'gdot');

		return json({
			lastSync: {
				GA: gdotSync
			}
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('[api:dot-ingest] Error fetching sync status:', error);
		return json({ error: 'Failed to fetch sync status' }, { status: 500 });
	}
}
