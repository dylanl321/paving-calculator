/**
 * Server-side geocoding + GDOT route geometry resolution for PDF imports.
 *
 * Two real, key-less sources are used (no invented data — every value comes
 * from an upstream response, and missing data stays missing):
 *  1. GDOT GPAS ArcGIS (MapServer Layer 5) — authoritative route polylines for
 *     a named state route, optionally filtered by county. This is the primary
 *     source: when a PDF names a route we draw the actual road geometry.
 *  2. US Census Geocoder (one-line address search) — address/location-text
 *     fallback to obtain an approximate point when no route geometry is found.
 *
 * All functions are best-effort: they return null on any failure so the import
 * still succeeds (the user can then place the pin / draw the route manually).
 */

import { fetchArcgisFeatures } from './dot/arcgis-fetch.js';
import type { GeoJsonLineString } from '$lib/types/dot';

const GDOT_GPAS_LAYER5 =
	'https://maps.georgia.gov/arcgis/rest/services/GDOT/GDOT_GPAS/MapServer/5/query';
const CENSUS_ONELINE =
	'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
// GDOT county boundary polygons (same MapServer used by gdot-boundaries.ts for
// point lookup). Querying by county NAME with geometry returned gives us an
// authoritative county polygon we can reduce to an approximate centroid — a
// real, key-less coordinate source for when no route designation is parsed.
const GDOT_COUNTY_LAYER =
	'https://maps.georgia.gov/arcgis/rest/services/GDOT/GDOT_Boundaries/MapServer/3/query';

/** Escape a value for an ArcGIS SQL WHERE clause. */
function sqlEscape(v: string): string {
	return v.replace(/'/g, "''");
}

/** Normalise a county name to the bare name GDOT stores (drops a "County" suffix). */
function normaliseCounty(county: string): string {
	return county.replace(/\s+county\b/i, '').trim();
}

interface EsriPolygon {
	rings?: number[][][];
}

/**
 * Approximate centroid of an ESRI polygon (average of the outer-ring vertices).
 * Returns [lat, lng] (rings are [lng, lat]). This is a coarse point-in-polygon
 * proxy — adequate for dropping an initial project pin, not for survey use.
 */
function polygonCentroid(poly: EsriPolygon): [number, number] | null {
	const ring = poly.rings?.[0];
	if (!ring || ring.length === 0) return null;
	let sx = 0;
	let sy = 0;
	let n = 0;
	for (const pt of ring) {
		if (typeof pt[0] === 'number' && typeof pt[1] === 'number') {
			sx += pt[0];
			sy += pt[1];
			n++;
		}
	}
	if (n === 0) return null;
	// rings are [lng, lat]; return [lat, lng].
	return [sy / n, sx / n];
}

/**
 * Resolve an approximate [lat, lng] for a Georgia county from the authoritative
 * GDOT county boundary polygons. Used as a real, key-less fallback when no route
 * designation is parsed and the free-text geocoder misses. Returns null on any
 * failure (never invents a coordinate).
 */
export async function fetchCountyCentroid(county: string | null): Promise<[number, number] | null> {
	const name = county?.trim();
	if (!name) return null;
	const bare = normaliseCounty(name);
	if (!bare) return null;

	// County polygons carry their name under one of several fields across GDOT
	// service revisions; OR them so a single query matches.
	const nameFields = ['NAME', 'COUNTY_NAME', 'COUNTYNAME', 'COUNTY'];
	const where = nameFields
		.map((f) => `UPPER(${f}) = UPPER('${sqlEscape(bare)}')`)
		.join(' OR ');

	const params = new URLSearchParams({
		where,
		outFields: 'NAME',
		returnGeometry: 'true',
		outSR: '4326',
		f: 'json'
	});

	try {
		const res = await fetch(`${GDOT_COUNTY_LAYER}?${params.toString()}`, {
			signal: AbortSignal.timeout(6000)
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			features?: Array<{ geometry?: EsriPolygon }>;
		};
		const geom = data.features?.[0]?.geometry;
		if (!geom) return null;
		return polygonCentroid(geom);
	} catch (err) {
		console.error('[gdot-geometry] county centroid fetch failed:', err);
		return null;
	}
}

/**
 * Resolve the GDOT route polyline for a route designation (e.g. "SR 13"),
 * optionally narrowed by county. Returns the longest matching LineString, or
 * null when nothing matches / the service is unavailable.
 */
export async function fetchGdotRouteGeometry(
	routeDesignation: string | null,
	county: string | null
): Promise<GeoJsonLineString | null> {
	if (!routeDesignation) return null;

	// Normalise "SR 13" / "I-85" / "US 23" into the numeric token GPAS stores.
	const num = routeDesignation.match(/(\d+[A-Z]?)/)?.[1];
	if (!num) return null;

	const routeClause = `(UPPER(ROUTE_ID) LIKE UPPER('%${sqlEscape(num)}%') OR UPPER(ROAD_NAME) LIKE UPPER('%${sqlEscape(routeDesignation)}%'))`;

	// Try the county-filtered query first (precise), then fall back to route-only.
	// GPAS COUNTY is often a numeric code rather than the county name, so a name
	// LIKE filter can wrongly exclude every row — the route-only retry guarantees
	// we still find the centerline when that happens.
	const wheres = county
		? [`${routeClause} AND UPPER(COUNTY) LIKE UPPER('%${sqlEscape(county)}%')`, routeClause]
		: [routeClause];

	try {
		for (const where of wheres) {
			const features = await fetchArcgisFeatures(
				GDOT_GPAS_LAYER5,
				{ where, outFields: 'ROUTE_ID,ROAD_NAME,COUNTY' },
				500
			);

			const lines = features
				.map((f) => f.geometry)
				.filter((g): g is GeoJsonLineString => g != null && g.coordinates.length >= 2);

			if (lines.length === 0) continue;

			// Prefer the longest single path (most complete route segment).
			lines.sort((a, b) => b.coordinates.length - a.coordinates.length);
			return lines[0];
		}
		return null;
	} catch (err) {
		console.error('[gdot-geometry] route geometry fetch failed:', err);
		return null;
	}
}

/** Approximate centroid (midpoint of the path) of a LineString as [lat, lng]. */
export function lineStringCentroid(line: GeoJsonLineString): [number, number] | null {
	const coords = line.coordinates;
	if (!coords || coords.length === 0) return null;
	const mid = coords[Math.floor(coords.length / 2)];
	// GeoJSON is [lng, lat] — return [lat, lng].
	return [mid[1], mid[0]];
}

/**
 * Geocode a free-text location/address using the US Census one-line geocoder.
 * Returns [lat, lng] or null. Used only as a fallback when GDOT route geometry
 * is unavailable.
 */
export async function geocodeAddress(query: string | null): Promise<[number, number] | null> {
	const q = query?.trim();
	if (!q) return null;

	const params = new URLSearchParams({
		address: q,
		benchmark: 'Public_AR_Current',
		format: 'json'
	});

	try {
		const res = await fetch(`${CENSUS_ONELINE}?${params.toString()}`, {
			signal: AbortSignal.timeout(6000)
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			result?: { addressMatches?: Array<{ coordinates?: { x: number; y: number } }> };
		};
		const match = data.result?.addressMatches?.[0]?.coordinates;
		if (!match || typeof match.x !== 'number' || typeof match.y !== 'number') return null;
		// Census returns x=lng, y=lat.
		return [match.y, match.x];
	} catch (err) {
		console.error('[gdot-geometry] census geocode failed:', err);
		return null;
	}
}

export interface ResolvedLocation {
	latitude: number | null;
	longitude: number | null;
	/** GDOT route LineString when a named route was matched. */
	routeGeometry: GeoJsonLineString | null;
	/** How the coordinates were obtained, for diagnostics. */
	source: 'gdot_route' | 'geocode' | 'county_centroid' | 'none';
}

export interface ImportRoutePreview {
	source: ResolvedLocation['source'] | 'manual';
	latitude: number | null;
	longitude: number | null;
	waypoints: Array<{ lat: number; lng: number }>;
	message?: string;
}

export async function buildImportRoutePreview(opts: {
	routeDesignation: string | null;
	county: string | null;
	locationDescription: string | null;
}): Promise<ImportRoutePreview> {
	const resolved = await resolveImportLocation(opts);
	const waypoints = resolved.routeGeometry
		? resolved.routeGeometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
		: [];

	let message: string;
	if (resolved.source === 'gdot_route') {
		message = 'GDOT route geometry found. Confirm the alignment or edit it on the map.';
	} else if (resolved.source === 'geocode') {
		message = 'Location was geocoded, but no route centerline was found.';
	} else if (resolved.source === 'county_centroid') {
		message = 'Only a county-level location was found. Draw or load the route before creating work zones.';
	} else {
		message = 'No route or location candidate was found from the reviewed fields.';
	}

	return {
		source: resolved.source,
		latitude: resolved.latitude,
		longitude: resolved.longitude,
		waypoints,
		message
	};
}

/**
 * Resolve a project's coordinates and (when possible) route geometry from the
 * parsed PDF fields. Priority:
 *   1. GDOT route polyline centroid (when a route designation parsed)
 *   2. US Census one-line geocode of the location/county text
 *   3. GDOT county boundary centroid (authoritative polygon → approximate point)
 *
 * Step 3 guarantees that a document which names only a county (no route, no
 * street-address-shaped location text — the common case for milling/resurfacing
 * contracts) still gets approximate coordinates so Work Zones / maps are usable.
 * Returns nulls only when there is genuinely no county/route/location to work
 * from. Never invents data — every coordinate comes from an upstream response.
 */
export async function resolveImportLocation(opts: {
	routeDesignation: string | null;
	county: string | null;
	locationDescription: string | null;
}): Promise<ResolvedLocation> {
	const routeGeometry = await fetchGdotRouteGeometry(opts.routeDesignation, opts.county);

	if (routeGeometry) {
		const centroid = lineStringCentroid(routeGeometry);
		if (centroid) {
			return {
				latitude: centroid[0],
				longitude: centroid[1],
				routeGeometry,
				source: 'gdot_route'
			};
		}
	}

	// Fallback A: geocode the most specific free-text we have. The one-line
	// geocoder matches street-address-shaped text best; a bare county usually
	// misses here, which is why fallback B exists.
	const geoQuery =
		opts.locationDescription && opts.county
			? `${opts.locationDescription}, ${normaliseCounty(opts.county)} County, GA`
			: opts.county
				? `${normaliseCounty(opts.county)} County, GA`
				: opts.locationDescription;
	const coords = await geocodeAddress(geoQuery);
	if (coords) {
		return {
			latitude: coords[0],
			longitude: coords[1],
			routeGeometry: null,
			source: 'geocode'
		};
	}

	// Fallback B: authoritative GDOT county polygon centroid. Always attempted
	// when a county is present, so a route-less, address-less document still
	// gets an approximate pin.
	const centroid = await fetchCountyCentroid(opts.county);
	if (centroid) {
		return {
			latitude: centroid[0],
			longitude: centroid[1],
			routeGeometry: null,
			source: 'county_centroid'
		};
	}

	return { latitude: null, longitude: null, routeGeometry: null, source: 'none' };
}
