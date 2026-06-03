/**
 * DOT data ingestion pipeline — Georgia only.
 */

import { DbHelper } from '$lib/server/db';
import { ingestGdot } from './ingest-gdot';

export { ingestGdot } from './ingest-gdot';

export interface StateIngestionResult {
	upserted: number;
	errors: number;
}

/**
 * Runs GDOT ingestion pipeline.
 */
export async function runGdotIngestion(db: DbHelper): Promise<StateIngestionResult> {
	console.log('[dot:ingest] Running GDOT ingestion pipeline...');
	return ingestGdot(db);
}
