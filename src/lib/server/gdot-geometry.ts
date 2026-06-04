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

/** Escape a value for an ArcGIS SQL WHERE clause. */
function sqlEscape(v: string): string {
	return v.replace(/'/g, "''");
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

	const clauses = [
		`UPPER(ROUTE_ID) LIKE UPPER('%${sqlEscape(num)}%')`,
		`UPPER(ROAD_NAME) LIKE UPPER('%${sqlEscape(routeDesignation)}%')`
	];
	let where = `(${clauses.join(' OR ')})`;
	if (county) {
		where += ` AND UPPER(COUNTY) LIKE UPPER('%${sqlEscape(county)}%')`;
	}

	try {
		const features = await fetchArcgisFeatures(
			GDOT_GPAS_LAYER5,
			{ where, outFields: 'ROUTE_ID,ROAD_NAME,COUNTY' },
			500
		);

		const lines = features
			.map((f) => f.geometry)
			.filter((g): g is GeoJsonLineString => g != null && g.coordinates.length >= 2);

		if (lines.length === 0) return null;

		// Prefer the longest single path (most complete route segment).
		lines.sort((a, b) => b.coordinates.length - a.coordinates.length);
		return lines[0];
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
	source: 'gdot_route' | 'geocode' | 'none';
}

/**
 * Resolve a project's coordinates and (when possible) route geometry from the
 * parsed PDF fields. Priority: GDOT route polyline centroid → geocoded
 * location/county text. Returns nulls when nothing resolves.
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

	// Fallback: geocode the location description, then the county name.
	const geoQuery =
		opts.locationDescription && opts.county
			? `${opts.locationDescription}, ${opts.county} County, GA`
			: opts.county
				? `${opts.county} County, GA`
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

	return { latitude: null, longitude: null, routeGeometry: null, source: 'none' };
}
