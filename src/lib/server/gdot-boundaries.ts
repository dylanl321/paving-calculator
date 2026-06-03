/**
 * GDOT Boundaries API integration
 * Queries the GDOT_Boundaries MapServer to determine county and district from GPS coordinates
 */

interface GdotFeature {
	attributes: Record<string, unknown>;
}

interface GdotQueryResponse {
	features?: GdotFeature[];
}

/**
 * Query a GDOT MapServer layer for point intersection
 */
async function queryGdotLayer(
	layerId: number,
	lat: number,
	lng: number
): Promise<Record<string, unknown> | null> {
	const baseUrl = 'https://maps.georgia.gov/arcgis/rest/services/GDOT/GDOT_Boundaries/MapServer';
	const geometry = JSON.stringify({
		x: lng,
		y: lat,
		spatialReference: { wkid: 4326 }
	});

	const params = new URLSearchParams({
		geometry,
		geometryType: 'esriGeometryPoint',
		spatialRel: 'esriSpatialRelIntersects',
		outFields: '*',
		returnGeometry: 'false',
		f: 'json'
	});

	try {
		const response = await fetch(`${baseUrl}/${layerId}/query?${params.toString()}`);
		if (!response.ok) {
			console.error(`GDOT API error for layer ${layerId}:`, response.status);
			return null;
		}

		const data = (await response.json()) as GdotQueryResponse;
		if (!data.features || data.features.length === 0) {
			return null;
		}

		return data.features[0].attributes;
	} catch (error) {
		console.error(`GDOT API request failed for layer ${layerId}:`, error);
		return null;
	}
}

/**
 * Extract county name from GDOT county layer attributes
 */
function extractCountyName(attributes: Record<string, unknown> | null): string | null {
	if (!attributes) return null;

	const possibleFields = ['NAME', 'COUNTY_NAME', 'COUNTYNAME', 'County', 'COUNTY'];
	for (const field of possibleFields) {
		const value = attributes[field];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}

	return null;
}

/**
 * Extract district name from GDOT district layer attributes
 */
function extractDistrictName(attributes: Record<string, unknown> | null): string | null {
	if (!attributes) return null;

	const possibleFields = ['DISTRICT', 'DISTRICT_NAME', 'DISTRICTNAME', 'District', 'DIST'];
	for (const field of possibleFields) {
		const value = attributes[field];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
		if (typeof value === 'number') {
			return String(value);
		}
	}

	return null;
}

/**
 * Look up GDOT county and district from GPS coordinates
 */
export async function lookupGdotBoundaries(
	lat: number,
	lng: number
): Promise<{ county: string | null; district: string | null }> {
	const COUNTY_LAYER = 3;
	const DISTRICT_LAYER = 4;

	const [countyAttrs, districtAttrs] = await Promise.all([
		queryGdotLayer(COUNTY_LAYER, lat, lng),
		queryGdotLayer(DISTRICT_LAYER, lat, lng)
	]);

	return {
		county: extractCountyName(countyAttrs),
		district: extractDistrictName(districtAttrs)
	};
}
