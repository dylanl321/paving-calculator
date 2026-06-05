/**
 * GET /api/gdot-routes?bbox=minLng,minLat,maxLng,maxLat
 *   Returns a GeoJSON FeatureCollection of road segments from dot_road_segments
 *   whose bounding box overlaps the requested area. Used by roadSnap.ts to snap
 *   user clicks to the nearest real road centerline stored locally.
 *
 * GET /api/gdot-routes?q=SR+13[&geometry=true]  (legacy — route search via GDOT ArcGIS)
 *   Returns a JSON array of matching GDOT route records (route name/id lookup).
 *   Kept for backward compatibility with the import-route-preview flow.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { DbHelper } from '$lib/server/db';

// GDOT GPAS MapServer Layer 5 — route reference data (legacy search path)
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

export const GET: RequestHandler = async ({ url, platform }) => {
	const bboxParam = url.searchParams.get('bbox');

	// ── Bbox path: query local dot_road_segments ─────────────────────────────
	if (bboxParam) {
		const parts = bboxParam.split(',').map(Number);
		if (parts.length !== 4 || parts.some(isNaN)) {
			return json({ error: 'bbox must be minLng,minLat,maxLng,maxLat' }, { status: 400 });
		}
		const [minLng, minLat, maxLng, maxLat] = parts;

		if (!platform?.env?.DB) {
			// D1 not available (e.g. static preview) — return empty so client falls back to OSRM.
			return json({ type: 'FeatureCollection', features: [] });
		}

		try {
			const db = new DbHelper(platform.env.DB);
			const rows = await db.getDotSegmentsByBbox(minLng, minLat, maxLng, maxLat, 'GA', 200);

			const features = rows
				.filter((r) => r.geometry_geojson)
				.map((r) => {
					let geometry: { type: string; coordinates: [number, number][] } | null = null;
					try {
						geometry = JSON.parse(r.geometry_geojson as string) as typeof geometry;
					} catch {
						return null;
					}
					return {
						type: 'Feature' as const,
						properties: {
							id: r.id,
							road_name: r.road_name,
							route_id: r.route_id,
							functional_class: r.functional_class,
							lanes: r.lanes,
							county_code: r.county_code
						},
						geometry
					};
				})
				.filter((f): f is NonNullable<typeof f> => f !== null && f.geometry !== null);

			return json({ type: 'FeatureCollection', features });
		} catch (err) {
			console.error('[gdot-routes/bbox] DB error:', err);
			return json({ type: 'FeatureCollection', features: [] });
		}
	}

	// ── Legacy search path: q= query against GDOT ArcGIS MapServer ───────────
	const q = url.searchParams.get('q')?.trim();
	const withGeometry = url.searchParams.get('geometry') === 'true';
	if (!q || q.length < 2) {
		return json({ routes: [] });
	}

	try {
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
		console.error('[gdot-routes] fetch failed:', err);
		return json({ routes: [], error: 'Could not reach GDOT service' });
	}
};
