/**
 * TxDOT (Texas DOT) data ingestion pipeline.
 * Fetches roadway inventory data from ArcGIS FeatureServer.
 */

import { fetchArcgisFeatures } from './arcgis-fetch';
import { normaliseTxdot } from './normalise';
import { DbHelper } from '$lib/server/db';
import type { TxdotRoadwayRaw } from '$lib/types/dot';

const TXDOT_URL = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadway_Inventory/FeatureServer/0/query';
const MAX_RECORDS = 5000;

export interface IngestionResult {
	upserted: number;
	errors: number;
}

/**
 * Ingests TxDOT road segment data from the Roadway Inventory FeatureServer.
 */
export async function ingestTxdot(db: DbHelper): Promise<IngestionResult> {
	console.log('[dot:txdot] Starting ingestion...');

	let upserted = 0;
	let errors = 0;

	try {
		// Fetch features from ArcGIS
		const features = await fetchArcgisFeatures(TXDOT_URL, {}, MAX_RECORDS);
		console.log(`[dot:txdot] Fetched ${features.length} features`);

		// Process each feature
		for (const feature of features) {
			try {
				const raw = feature.attributes as TxdotRoadwayRaw;
				const normalized = normaliseTxdot(raw, feature.geometry || null);
				await db.upsertDotSegment(normalized);
				upserted++;
			} catch (error) {
				console.error('[dot:txdot] Error upserting segment:', error);
				errors++;
			}
		}

		// Log sync result
		const status = errors === 0 ? 'success' : errors < features.length ? 'partial' : 'failed';
		await db.logDotSync('TX', 'txdot', status, upserted, errors > 0 ? `${errors} errors` : null);

		console.log(`[dot:txdot] Completed: ${upserted} upserted, ${errors} errors`);
		return { upserted, errors };
	} catch (error) {
		console.error('[dot:txdot] Fatal error:', error);
		await db.logDotSync('TX', 'txdot', 'failed', 0, String(error));
		throw error;
	}
}
