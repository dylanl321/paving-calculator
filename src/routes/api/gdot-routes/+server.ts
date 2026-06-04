import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GDOT GPAS MapServer Layer 5 — route reference data
// Fields: ROUTE_ID, ROAD_NAME, COUNTY, FUNCTION_TYPE, SYSTEM_CODE
const GDOT_LAYER_URL =
	'https://maps.georgia.gov/arcgis/rest/services/GDOT/GDOT_GPAS/MapServer/5/query';

export interface GdotRoute {
	route_id: string;
	road_name: string;
	county: string;
	function_type: string;
	system_code: string;
	/** GeoJSON LineString [lng,lat][] when geometry was requested and available. */
	geometry?: { type: 'LineString'; coordinates: [number, number][] } | null;
}

export const GET: RequestHandler = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim();
	const withGeometry = url.searchParams.get('geometry') === 'true';
	if (!q || q.length < 2) {
		return json({ routes: [] });
	}

	try {
		// Build a WHERE clause that searches ROUTE_ID and ROAD_NAME
		// Use LIKE for partial matching; escape single quotes
		const safe = q.replace(/'/g, "''");
		const where = `UPPER(ROUTE_ID) LIKE UPPER('%${safe}%') OR UPPER(ROAD_NAME) LIKE UPPER('%${safe}%')`;

		const params = new URLSearchParams({
			where,
			outFields: 'ROUTE_ID,ROAD_NAME,COUNTY,FUNCTION_TYPE,SYSTEM_CODE',
			returnGeometry: withGeometry ? 'true' : 'false',
			outSR: '4326',
			resultRecordCount: '20',
			orderByFields: 'ROUTE_ID ASC',
			f: 'json'
		});

		const resp = await fetch(`${GDOT_LAYER_URL}?${params}`, {
			signal: AbortSignal.timeout(5000)
		});

		if (!resp.ok) {
			return json({ routes: [], error: 'GDOT service unavailable' });
		}

		const data = (await resp.json()) as {
			features?: Array<{
				attributes: {
					ROUTE_ID: string;
					ROAD_NAME: string;
					COUNTY: string;
					FUNCTION_TYPE: string;
					SYSTEM_CODE: string;
				};
				geometry?: { paths?: number[][][] };
			}>;
			error?: { message: string };
		};

		if (data.error) {
			return json({ routes: [], error: data.error.message });
		}

		// Deduplicate by ROUTE_ID (MapServer can return duplicate segments)
		const seen = new Set<string>();
		const routes: GdotRoute[] = [];

		for (const f of data.features ?? []) {
			const a = f.attributes;
			const key = a.ROUTE_ID;
			if (!seen.has(key)) {
				seen.add(key);
				let geometry: GdotRoute['geometry'] = null;
				if (withGeometry && f.geometry?.paths?.[0]?.length) {
					geometry = {
						type: 'LineString',
						coordinates: f.geometry.paths[0].map((p) => [p[0], p[1]] as [number, number])
					};
				}
				routes.push({
					route_id: a.ROUTE_ID ?? '',
					road_name: a.ROAD_NAME ?? '',
					county: a.COUNTY ?? '',
					function_type: a.FUNCTION_TYPE ?? '',
					system_code: a.SYSTEM_CODE ?? '',
					...(withGeometry ? { geometry } : {})
				});
			}
		}

		return json({ routes });
	} catch (err) {
		// Network error or timeout — return empty rather than crashing
		console.error('[gdot-routes] fetch failed:', err);
		return json({ routes: [], error: 'Could not reach GDOT service' });
	}
};
