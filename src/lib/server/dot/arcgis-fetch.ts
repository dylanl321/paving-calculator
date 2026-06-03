/**
 * Generic ArcGIS FeatureServer JSON fetcher with pagination.
 * Handles resultOffset pagination and geometry extraction.
 */

import type { GeoJsonLineString } from '$lib/types/dot';

interface EsriPolyline {
	paths?: number[][][];
}

interface ArcGisFeature {
	attributes: Record<string, unknown>;
	geometry?: EsriPolyline;
}

interface ArcGisResponse {
	features?: ArcGisFeature[];
	exceededTransferLimit?: boolean;
}

export interface FetchedFeature {
	attributes: Record<string, unknown>;
	geometry?: GeoJsonLineString | null;
}

const DEFAULT_BATCH_SIZE = 1000;

/**
 * Fetches all features from an ArcGIS FeatureServer endpoint.
 * Uses resultOffset pagination to retrieve records in batches.
 *
 * @param url - Base URL of the ArcGIS FeatureServer endpoint
 * @param params - Additional query parameters
 * @param maxRecords - Maximum number of records to fetch (default: 5000)
 * @returns Array of features with attributes and GeoJSON LineString geometry
 */
export async function fetchArcgisFeatures(
	url: string,
	params: Record<string, string> = {},
	maxRecords = 5000
): Promise<FetchedFeature[]> {
	const allFeatures: FetchedFeature[] = [];
	let offset = 0;
	let hasMore = true;

	while (hasMore && allFeatures.length < maxRecords) {
		const queryParams = new URLSearchParams({
			f: 'json',
			outFields: '*',
			returnGeometry: 'true',
			outSR: '4326',
			resultOffset: offset.toString(),
			resultRecordCount: DEFAULT_BATCH_SIZE.toString(),
			...params
		});

		const fetchUrl = `${url}?${queryParams.toString()}`;

		try {
			const response = await fetch(fetchUrl);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as ArcGisResponse;

			if (!data.features || data.features.length === 0) {
				hasMore = false;
				break;
			}

			// Process features and extract geometry
			for (const feature of data.features) {
				const geometry = extractLineString(feature.geometry);
				allFeatures.push({
					attributes: feature.attributes,
					geometry
				});

				if (allFeatures.length >= maxRecords) {
					hasMore = false;
					break;
				}
			}

			// Check if there are more records
			if (!data.exceededTransferLimit || data.features.length < DEFAULT_BATCH_SIZE) {
				hasMore = false;
			} else {
				offset += data.features.length;
			}
		} catch (error) {
			console.error(`[arcgis-fetch] Error fetching from ${url} at offset ${offset}:`, error);
			throw error;
		}
	}

	return allFeatures;
}

/**
 * Extracts a GeoJSON LineString from an ESRI Polyline geometry.
 * Uses the first path if multiple paths exist.
 */
function extractLineString(geometry?: EsriPolyline): GeoJsonLineString | null {
	if (!geometry || !geometry.paths || geometry.paths.length === 0) {
		return null;
	}

	const firstPath = geometry.paths[0];
	if (!firstPath || firstPath.length === 0) {
		return null;
	}

	// ESRI paths are [x, y] pairs (longitude, latitude)
	const coordinates: [number, number][] = firstPath.map((point) => [point[0], point[1]]);

	return {
		type: 'LineString',
		coordinates
	};
}
