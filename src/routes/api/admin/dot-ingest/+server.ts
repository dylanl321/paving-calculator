import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import {
	runAllDotIngestion,
	ingestAldot,
	ingestTxdot,
	ingestGdot,
	ingestFdot
} from '$lib/server/dot';

interface PostRequestBody {
	states?: string[];
}

/**
 * POST /api/admin/dot-ingest
 * Triggers DOT data ingestion for specified states or all states.
 * Requires global admin authentication.
 */
export async function POST(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const db = new DbHelper(event.platform!.env.DB);
		const body = (await event.request.json().catch(() => ({}))) as PostRequestBody;
		const { states } = body;

		let results: Record<string, { upserted: number; errors: number }>;

		if (!states || states.length === 0) {
			// Run all states
			console.log('[api:dot-ingest] Running all DOT ingestion pipelines');
			results = await runAllDotIngestion(db);
		} else {
			// Run specific states
			console.log(`[api:dot-ingest] Running ingestion for states: ${states.join(', ')}`);
			results = {};

			for (const state of states) {
				const stateUpper = state.toUpperCase();
				try {
					switch (stateUpper) {
						case 'AL':
							results[stateUpper] = await ingestAldot(db);
							break;
						case 'TX':
							results[stateUpper] = await ingestTxdot(db);
							break;
						case 'GA':
							results[stateUpper] = await ingestGdot(db);
							break;
						case 'FL':
							results[stateUpper] = await ingestFdot(db);
							break;
						default:
							console.warn(`[api:dot-ingest] Unknown state: ${stateUpper}`);
							results[stateUpper] = { upserted: 0, errors: 1 };
					}
				} catch (error) {
					console.error(`[api:dot-ingest] Error ingesting ${stateUpper}:`, error);
					results[stateUpper] = { upserted: 0, errors: 1 };
				}
			}
		}

		return json({ results });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('[api:dot-ingest] Error:', error);
		return json({ error: 'Failed to run DOT ingestion' }, { status: 500 });
	}
}

/**
 * GET /api/admin/dot-ingest
 * Returns the last sync status for all DOT states.
 * Requires global admin authentication.
 */
export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);

		const db = new DbHelper(event.platform!.env.DB);

		const [aldotSync, txdotSync, gdotSync, fdotSync] = await Promise.all([
			db.getLastDotSync('AL', 'aldot'),
			db.getLastDotSync('TX', 'txdot'),
			db.getLastDotSync('GA', 'gdot'),
			db.getLastDotSync('FL', 'fdot')
		]);

		return json({
			lastSync: {
				AL: aldotSync,
				TX: txdotSync,
				GA: gdotSync,
				FL: fdotSync
			}
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('[api:dot-ingest] Error fetching sync status:', error);
		return json({ error: 'Failed to fetch sync status' }, { status: 500 });
	}
}
