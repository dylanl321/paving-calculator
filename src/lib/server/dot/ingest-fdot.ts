/**
 * FDOT (Florida DOT) data ingestion pipeline.
 * Fetches RCI (Roadway Characteristics Inventory) data from ArcGIS FeatureServer.
 */

import { fetchArcgisFeatures } from './arcgis-fetch';
import { normaliseFdot } from './normalise';
import { DbHelper } from '$lib/server/db';
import type { FdotRciRaw } from '$lib/types/dot';

const FDOT_URL = 'https://services1.arcgis.com/O1JpcwDW8sjYuddV/ArcGIS/rest/services/FEAT_RCIT110_OVERALL_DESC/FeatureServer/0/query';
const MAX_RECORDS = 5000;

export interface IngestionResult {
	upserted: number;
	errors: number;
}

/**
 * Ingests FDOT road segment data from the RCI FeatureServer.
 */
export async function ingestFdot(db: DbHelper): Promise<IngestionResult> {
	console.log('[dot:fdot] Starting ingestion...');

	let upserted = 0;
	let errors = 0;

	try {
		// Fetch features from ArcGIS
		const features = await fetchArcgisFeatures(FDOT_URL, {}, MAX_RECORDS);
		console.log(`[dot:fdot] Fetched ${features.length} features`);

		// Process each feature
		for (const feature of features) {
			try {
				const raw = feature.attributes as FdotRciRaw;
				const normalized = normaliseFdot(raw, feature.geometry || null);
				await db.upsertDotSegment(normalized);
				upserted++;
			} catch (error) {
				console.error('[dot:fdot] Error upserting segment:', error);
				errors++;
			}
		}

		// Log sync result
		const status = errors === 0 ? 'success' : errors < features.length ? 'partial' : 'failed';
		await db.logDotSync('FL', 'fdot', status, upserted, errors > 0 ? `${errors} errors` : null);

		console.log(`[dot:fdot] Completed: ${upserted} upserted, ${errors} errors`);
		return { upserted, errors };
	} catch (error) {
		console.error('[dot:fdot] Fatal error:', error);
		await db.logDotSync('FL', 'fdot', 'failed', 0, String(error));
		throw error;
	}
}
