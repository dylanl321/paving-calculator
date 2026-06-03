/**
 * GDOT (Georgia DOT) data ingestion pipeline.
 * Fetches GPAS roads data from Enterprise GIS ArcGIS REST service.
 */

import { fetchArcgisFeatures } from './arcgis-fetch';
import { normaliseGdot } from './normalise';
import { DbHelper } from '$lib/server/db';
import type { GdotGpasRoadRaw } from '$lib/types/dot';

const GDOT_URL = 'https://enterprisegis.dot.ga.gov/hosting/rest/services/GPAS/GPAS/MapServer/5/query';
const MAX_RECORDS = 5000;

export interface IngestionResult {
	upserted: number;
	errors: number;
}

/**
 * Ingests GDOT road segment data from the GPAS MapServer.
 */
export async function ingestGdot(db: DbHelper): Promise<IngestionResult> {
	console.log('[dot:gdot] Starting ingestion...');

	let upserted = 0;
	let errors = 0;

	try {
		// Fetch features from ArcGIS
		const features = await fetchArcgisFeatures(GDOT_URL, {}, MAX_RECORDS);
		console.log(`[dot:gdot] Fetched ${features.length} features`);

		// Process each feature
		for (const feature of features) {
			try {
				const raw = feature.attributes as GdotGpasRoadRaw;
				const normalized = normaliseGdot(raw, feature.geometry || null);
				await db.upsertDotSegment(normalized);
				upserted++;
			} catch (error) {
				console.error('[dot:gdot] Error upserting segment:', error);
				errors++;
			}
		}

		// Log sync result
		const status = errors === 0 ? 'success' : errors < features.length ? 'partial' : 'failed';
		await db.logDotSync('GA', 'gdot', status, upserted, errors > 0 ? `${errors} errors` : null);

		console.log(`[dot:gdot] Completed: ${upserted} upserted, ${errors} errors`);
		return { upserted, errors };
	} catch (error) {
		console.error('[dot:gdot] Fatal error:', error);
		await db.logDotSync('GA', 'gdot', 'failed', 0, String(error));
		throw error;
	}
}
