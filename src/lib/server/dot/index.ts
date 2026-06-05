/**
 * DOT data ingestion pipeline — Georgia only.
 */

import { DbHelper } from '$lib/server/db';
import { ingestGdot } from './ingest-gdot';
import { ingestGdotConstructionProjects } from './ingest-gdot-construction';

export { ingestGdot } from './ingest-gdot';
export { ingestGdotConstructionProjects } from './ingest-gdot-construction';

export interface StateIngestionResult {
	upserted: number;
	errors: number;
}

export interface FullIngestionResult {
	roads: StateIngestionResult;
	construction: { upserted: number; skipped: number; errors: number };
}

/**
 * Runs full GDOT ingestion: road segments + active construction projects.
 */
export async function runGdotIngestion(db: DbHelper): Promise<FullIngestionResult> {
	console.log('[dot:ingest] Running full GDOT ingestion pipeline...');
	const [roads, construction] = await Promise.allSettled([
		ingestGdot(db),
		ingestGdotConstructionProjects(db)
	]);

	return {
		roads: roads.status === 'fulfilled' ? roads.value : { upserted: 0, errors: 1 },
		construction:
			construction.status === 'fulfilled'
				? construction.value
				: { upserted: 0, skipped: 0, errors: 1 }
	};
}

