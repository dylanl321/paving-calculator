import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { ingestGdot, ingestGdotConstructionProjects } from '$lib/server/dot';

/**
 * POST /api/admin/dot-ingest
 * Triggers GDOT data ingestion (Georgia only).
 * Runs both road-segment ingestion (GPAS) and active construction project ingestion (GeoPI).
 * Requires global admin authentication.
 */
export async function POST(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const db = new DbHelper(event.platform!.env.DB);

		console.log('[api:dot-ingest] Running GDOT ingestion pipeline');

		// Run both ingestion pipelines — road segments and construction projects
		const [roadsResult, constructionResult] = await Promise.allSettled([
			ingestGdot(db),
			ingestGdotConstructionProjects(db)
		]);

		return json({
			results: {
				GA: {
					roads:
						roadsResult.status === 'fulfilled'
							? roadsResult.value
							: { upserted: 0, errors: 1, error: String(roadsResult.reason) },
					construction:
						constructionResult.status === 'fulfilled'
							? constructionResult.value
							: { upserted: 0, skipped: 0, errors: 1, error: String(constructionResult.reason) }
				}
			}
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('[api:dot-ingest] Error:', error);
		return json({ error: 'Failed to run GDOT ingestion' }, { status: 500 });
	}
}

/**
 * GET /api/admin/dot-ingest
 * Returns the last GDOT sync status for both roads and construction pipelines.
 * Requires global admin authentication.
 */
export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const db = new DbHelper(event.platform!.env.DB);
		const [gdotSync, constructionSync] = await Promise.all([
			db.getLastDotSync('GA', 'gdot'),
			db.getLastDotSync('GA', 'gdot_construction')
		]);

		return json({
			lastSync: {
				GA: {
					roads: gdotSync,
					construction: constructionSync
				}
			}
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('[api:dot-ingest] Error fetching sync status:', error);
		return json({ error: 'Failed to fetch sync status' }, { status: 500 });
	}
}
