/**
 * ALDOT (Alabama DOT) data ingestion pipeline.
 * Fetches CPMS project location data from ArcGIS FeatureServer.
 */

import { fetchArcgisFeatures } from './arcgis-fetch';
import { normaliseAldot } from './normalise';
import { DbHelper } from '$lib/server/db';
import type { AldotCpmsRaw } from '$lib/types/dot';

const ALDOT_URL = 'https://maps.dot.state.al.us/arcgis/rest/services/HWY/CPMS/MapServer/0/query';
const MAX_RECORDS = 5000;

export interface IngestionResult {
	upserted: number;
	errors: number;
}

/**
 * Ingests ALDOT road segment data from the CPMS FeatureServer.
 */
export async function ingestAldot(db: DbHelper): Promise<IngestionResult> {
	console.log('[dot:aldot] Starting ingestion...');

	let upserted = 0;
	let errors = 0;

	try {
		// Fetch features from ArcGIS
		const features = await fetchArcgisFeatures(ALDOT_URL, {}, MAX_RECORDS);
		console.log(`[dot:aldot] Fetched ${features.length} features`);

		// Process each feature
		for (const feature of features) {
			try {
				const raw = feature.attributes as AldotCpmsRaw;
				const normalized = normaliseAldot(raw, feature.geometry || null);
				await db.upsertDotSegment(normalized);
				upserted++;
			} catch (error) {
				console.error('[dot:aldot] Error upserting segment:', error);
				errors++;
			}
		}

		// Log sync result
		const status = errors === 0 ? 'success' : errors < features.length ? 'partial' : 'failed';
		await db.logDotSync('AL', 'aldot', status, upserted, errors > 0 ? `${errors} errors` : null);

		console.log(`[dot:aldot] Completed: ${upserted} upserted, ${errors} errors`);
		return { upserted, errors };
	} catch (error) {
		console.error('[dot:aldot] Fatal error:', error);
		await db.logDotSync('AL', 'aldot', 'failed', 0, String(error));
		throw error;
	}
}
