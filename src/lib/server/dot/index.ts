/**
 * DOT data ingestion pipeline exports.
 * Provides individual state ingest functions and a unified runner.
 */

import { DbHelper } from '$lib/server/db';
import { ingestAldot } from './ingest-aldot';
import { ingestTxdot } from './ingest-txdot';
import { ingestGdot } from './ingest-gdot';
import { ingestFdot } from './ingest-fdot';

export { ingestAldot } from './ingest-aldot';
export { ingestTxdot } from './ingest-txdot';
export { ingestGdot } from './ingest-gdot';
export { ingestFdot } from './ingest-fdot';

export interface StateIngestionResult {
	upserted: number;
	errors: number;
}

export type AllIngestionResults = Record<string, StateIngestionResult>;

/**
 * Runs all DOT ingestion pipelines in parallel.
 * Returns a map of state codes to ingestion results.
 */
export async function runAllDotIngestion(db: DbHelper): Promise<AllIngestionResults> {
	console.log('[dot:ingest] Running all DOT ingestion pipelines...');

	const [aldotResult, txdotResult, gdotResult, fdotResult] = await Promise.allSettled([
		ingestAldot(db),
		ingestTxdot(db),
		ingestGdot(db),
		ingestFdot(db)
	]);

	const results: AllIngestionResults = {};

	if (aldotResult.status === 'fulfilled') {
		results.AL = aldotResult.value;
	} else {
		console.error('[dot:ingest] ALDOT ingestion failed:', aldotResult.reason);
		results.AL = { upserted: 0, errors: 1 };
	}

	if (txdotResult.status === 'fulfilled') {
		results.TX = txdotResult.value;
	} else {
		console.error('[dot:ingest] TxDOT ingestion failed:', txdotResult.reason);
		results.TX = { upserted: 0, errors: 1 };
	}

	if (gdotResult.status === 'fulfilled') {
		results.GA = gdotResult.value;
	} else {
		console.error('[dot:ingest] GDOT ingestion failed:', gdotResult.reason);
		results.GA = { upserted: 0, errors: 1 };
	}

	if (fdotResult.status === 'fulfilled') {
		results.FL = fdotResult.value;
	} else {
		console.error('[dot:ingest] FDOT ingestion failed:', fdotResult.reason);
		results.FL = { upserted: 0, errors: 1 };
	}

	console.log('[dot:ingest] All pipelines completed:', results);
	return results;
}
