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
import { assessRoadwayLogAnchoring } from './roadway-log-anchoring.js';
import { feetToCoordinate, polylineLengthFt, stationToFeet } from '$lib/services/mapUtils';
import { routeAlongRoads } from '$lib/services/roadSnap';
import { parseTerminus, type ParsedTerminus } from './terminus-parser.js';
import {
	calibrationToRouteMeasure,
	measureToPoint,
	type LrsRoute,
	type RouteCalibration
} from './dot/lrs-route.js';
import {
	resolveRouteFromPlanWithEvents,
	type RouteSourceDetail
} from './plan-route-resolver.js';
import type { StructuredContract, ContractSegment, SegmentKind, MeasureAxis } from './pdf/structured-contract.js';
import type { FieldConfidence } from './pdf/confidence.js';

export type { RouteSourceDetail };

const GDOT_GPAS_LAYER5 =
	'https://maps.georgia.gov/arcgis/rest/services/GDOT/GDOT_GPAS/MapServer/5/query';
const CENSUS_ONELINE =
	'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
// GDOT county boundary polygons (same MapServer used by gdot-boundaries.ts for
// point lookup). Querying by county NAME with geometry returned gives us an
// authoritative county polygon we can reduce to an approximate centroid — a
// real, key-less coordinate source for when no route designation is parsed.
const GDOT_COUNTY_LAYER =
	'https://maps.georgia.gov/arcgis/rest/services/GDOT/GDOT_Boundaries/MapServer/3/query';
const OVERPASS_TIMEOUT_MS = 12000;

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

export type LocationPrecision = 'route' | 'point' | 'county' | 'none';

export interface CountyBoundary {
	county: string;
	centroid: { lat: number; lng: number };
	bounds: [[number, number], [number, number]];
	geojson: {
		type: 'Feature';
		properties: { county: string };
		geometry: {
			type: 'Polygon';
			coordinates: number[][][];
		};
	};
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

function countyNameFromAttributes(attrs: Record<string, unknown> | undefined, fallback: string): string {
	for (const field of ['NAME', 'COUNTY_NAME', 'COUNTYNAME', 'COUNTY']) {
		const value = attrs?.[field];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return fallback;
}

function polygonBounds(poly: EsriPolygon): [[number, number], [number, number]] | null {
	let minLat = Infinity;
	let minLng = Infinity;
	let maxLat = -Infinity;
	let maxLng = -Infinity;
	for (const ring of poly.rings ?? []) {
		for (const pt of ring) {
			if (typeof pt[0] !== 'number' || typeof pt[1] !== 'number') continue;
			const [lng, lat] = pt;
			minLat = Math.min(minLat, lat);
			minLng = Math.min(minLng, lng);
			maxLat = Math.max(maxLat, lat);
			maxLng = Math.max(maxLng, lng);
		}
	}
	if (![minLat, minLng, maxLat, maxLng].every(Number.isFinite)) return null;
	return [
		[minLat, minLng],
		[maxLat, maxLng]
	];
}

function polygonGeojson(poly: EsriPolygon, county: string): CountyBoundary['geojson'] | null {
	const rings = poly.rings
		?.map((ring) =>
			ring
				.filter((pt) => typeof pt[0] === 'number' && typeof pt[1] === 'number')
				.map(([lng, lat]) => [lng, lat])
		)
		.filter((ring) => ring.length >= 4);
	if (!rings?.length) return null;
	return {
		type: 'Feature',
		properties: { county },
		geometry: {
			type: 'Polygon',
			coordinates: rings
		}
	};
}

/**
 * Resolve the authoritative GDOT county boundary polygon and derived map
 * metadata. This is context/evidence only: it can orient a user, but must never
 * be treated as a road alignment or exact paving limit.
 */
export async function fetchCountyBoundary(county: string | null): Promise<CountyBoundary | null> {
	const name = county?.trim();
	if (!name) return null;
	const bare = normaliseCounty(name);
	if (!bare) return null;

	const nameFields = ['NAME', 'COUNTY_NAME', 'COUNTYNAME', 'COUNTY'];
	const where = nameFields
		.map((f) => `UPPER(${f}) = UPPER('${sqlEscape(bare)}')`)
		.join(' OR ');

	const params = new URLSearchParams({
		where,
		outFields: 'NAME,COUNTY_NAME,COUNTYNAME,COUNTY',
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
			features?: Array<{ attributes?: Record<string, unknown>; geometry?: EsriPolygon }>;
		};
		const feature = data.features?.[0];
		const geom = feature?.geometry;
		if (!geom) return null;
		const displayCounty = countyNameFromAttributes(feature.attributes, bare);
		const centroid = polygonCentroid(geom);
		const bounds = polygonBounds(geom);
		const geojson = polygonGeojson(geom, displayCounty);
		if (!centroid || !bounds || !geojson) return null;
		return {
			county: displayCounty,
			centroid: { lat: centroid[0], lng: centroid[1] },
			bounds,
			geojson
		};
	} catch (err) {
		console.error('[gdot-geometry] county boundary fetch failed:', err);
		return null;
	}
}

/**
 * Resolve an approximate [lat, lng] for a Georgia county from the authoritative
 * GDOT county boundary polygons. Used as a real, key-less fallback when no route
 * designation is parsed and the free-text geocoder misses. Returns null on any
 * failure (never invents a coordinate).
 */
export async function fetchCountyCentroid(county: string | null): Promise<[number, number] | null> {
	const boundary = await fetchCountyBoundary(county);
	return boundary ? [boundary.centroid.lat, boundary.centroid.lng] : null;
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
	source:
		| 'gdot_lrs'
		| 'gdot_route'
		| 'osm_termini_route'
		| 'osm_overpass'
		| 'geocode'
		| 'county_centroid'
		| 'none';
	locationPrecision: LocationPrecision;
	countyBoundary: CountyBoundary | null;
	lookupWarnings: string[];
	parsed_begin_terminus?: ParsedTerminus | null;
	parsed_end_terminus?: ParsedTerminus | null;
	/** LRS route with M-values when resolved via plan mid-point. */
	lrsRoute?: LrsRoute | null;
	calibration?: RouteCalibration | null;
	routeSourceDetail?: RouteSourceDetail | null;
}

interface RoadwayLogEventPreview {
	id: string;
	milepost: number;
	event_type: string;
	description: string;
	roadway_width_ft: number | null;
	is_reference: number;
	confidence: string;
	coordinate_geojson: string | null;
}

interface RoadwayLogEventForPreview {
	milepost: number;
	station: number;
	event_type?: string;
	description?: string;
	roadway_width_ft?: number | null;
	is_reference?: boolean;
	confidence?: string;
}

export interface ImportRoutePreview {
	source: ResolvedLocation['source'] | 'manual';
	location_precision: LocationPrecision;
	latitude: number | null;
	longitude: number | null;
	waypoints: Array<{ lat: number; lng: number }>;
	county_boundary_geojson?: CountyBoundary['geojson'] | null;
	county_bounds?: CountyBoundary['bounds'] | null;
	message?: string;
	lookup_warnings?: string[];
	events_anchored?: boolean;
	anchor_message?: string;
	route_length_ft?: number | null;
	expected_length_ft?: number | null;
	projected_log_events?: RoadwayLogEventPreview[];
	parsed_begin_terminus?: ParsedTerminus | null;
	parsed_end_terminus?: ParsedTerminus | null;
	route_source_detail?: RouteSourceDetail | null;
	/**
	 * Per-segment mapped centerlines (LLM-primary multi-segment pipeline). When
	 * present, the project is N disconnected named roads (a MultiLineString); the
	 * scalar `waypoints` above remain the single representative-route preview for
	 * back-compat with the existing review UI.
	 */
	mapped_segments?: MappedSegment[];
}

/**
 * Query Overpass API for OSM ways with ref matching a route designation.
 * Extracts route number from routeDesignation (e.g. "SR 13" -> "13", also tries "SR 13").
 * Builds Overpass QL query to find ways with ref=<num> or ref=<routeDesignation> in Georgia.
 * If county provided, uses county centroid to build bounding box (centroid ± 0.4 degrees).
 * Otherwise uses Georgia bounding box: 30.3, -85.6, 35.0, -81.0.
 * Returns GeoJSON LineString with all way geometries concatenated, or null on error/no results.
 */
export async function fetchOverpassRouteGeometry(
	routeDesignation: string | null,
	county: string | null
): Promise<GeoJsonLineString | null> {
	if (!routeDesignation) return null;

	const num = routeDesignation.match(/(\d+[A-Z]?)/)?.[1];
	if (!num) return null;

	let bbox = '30.3,-85.6,35.0,-81.0';
	if (county) {
		const centroid = await fetchCountyCentroid(county);
		if (centroid) {
			const [lat, lng] = centroid;
			const offset = 0.4;
			bbox = `${lat - offset},${lng - offset},${lat + offset},${lng + offset}`;
		}
	}

	const srVariant = `SR ${num}`;
	const query = `
[out:json][timeout:10];
(
  way["ref"="${num}"](${bbox});
  way["ref"="${srVariant}"](${bbox});
);
out geom;
`;

	try {
		const res = await fetch(OVERPASS_API, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: `data=${encodeURIComponent(query)}`,
			signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS)
		});
		if (!res.ok) return null;

		const data = (await res.json()) as {
			elements?: Array<{
				type: string;
				geometry?: Array<{ lat: number; lon: number }>;
			}>;
		};

		const elements = data.elements ?? [];
		if (elements.length === 0) return null;

		const coordinates: Array<[number, number]> = [];
		for (const el of elements) {
			if (el.type === 'way' && el.geometry) {
				for (const pt of el.geometry) {
					if (typeof pt.lat === 'number' && typeof pt.lon === 'number') {
						coordinates.push([pt.lon, pt.lat]);
					}
				}
			}
		}

		if (coordinates.length < 2) return null;

		return {
			type: 'LineString',
			coordinates
		};
	} catch (err) {
		console.error('[gdot-geometry] overpass fetch failed:', err);
		return null;
	}
}

export async function buildImportRoutePreview(opts: {
	routeDesignation: string | null;
	county: string | null;
	locationDescription: string | null;
	totalLengthFt?: number | null;
	beginTerminus?: string | null;
	endTerminus?: string | null;
	roadwayLogEvents?: RoadwayLogEventForPreview[];
	countyNumber?: string | null;
	midpointEasting?: number | null;
	midpointNorthing?: number | null;
	midpointZoneLabel?: string | null;
	grossLengthMi?: number | null;
}): Promise<ImportRoutePreview> {
	const resolved = await resolveImportLocation(opts);
	const parsedBegin = parseTerminus(opts.beginTerminus);
	const parsedEnd = parseTerminus(opts.endTerminus);
	const waypoints = resolved.routeGeometry
		? resolved.routeGeometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
		: [];
	const anchoring = assessRoadwayLogAnchoring({
		waypoints,
		events: opts.roadwayLogEvents ?? [],
		totalLengthFt: opts.totalLengthFt,
		routeSource: resolved.source
	});
	const projectedLogEvents =
		resolved.lrsRoute && resolved.calibration
			? projectRoadwayLogEventsLrs(
					opts.roadwayLogEvents ?? [],
					resolved.lrsRoute,
					resolved.calibration
				)
			: anchoring.anchored
				? projectRoadwayLogEvents(opts.roadwayLogEvents ?? [], waypoints)
				: [];

	let message: string;
	if (resolved.source === 'gdot_lrs') {
		message =
			'GDOT LRS route matched from the plan mid-point and trimmed to project limits. Confirm the alignment or flip/edit on the map.';
	} else if (resolved.source === 'gdot_route') {
		message = anchoring.anchored
			? 'GDOT route geometry matches the project length. Confirm the alignment or flip/edit it on the map.'
			: 'GDOT route geometry found, but it must be trimmed or redrawn to the actual project limits before log markers are plotted.';
	} else if (resolved.source === 'osm_termini_route') {
		message = anchoring.anchored
			? 'OSM road route was found from the parsed termini. Review it before creating the project.'
			: 'OSM road route was found from the parsed termini, but it needs review before log markers are plotted.';
	} else if (resolved.source === 'osm_overpass') {
		message = anchoring.anchored
			? 'OSM Overpass route was found. Review the alignment before creating the project.'
			: 'OSM Overpass route was found, but it needs review before log markers are plotted.';
	} else if (resolved.source === 'geocode') {
		message = 'Location was geocoded, but no route centerline was found.';
	} else if (resolved.source === 'county_centroid') {
		message = 'Only a county-level location was found. Draw or load the route before creating work zones.';
	} else {
		message = 'No route or location candidate was found from the reviewed fields.';
	}

	return {
		source: resolved.source,
		location_precision: resolved.locationPrecision,
		latitude: resolved.latitude,
		longitude: resolved.longitude,
		waypoints,
		county_boundary_geojson: resolved.countyBoundary?.geojson ?? null,
		county_bounds: resolved.countyBoundary?.bounds ?? null,
		message,
		lookup_warnings: resolved.lookupWarnings,
		events_anchored: anchoring.anchored,
		anchor_message: anchoring.reason,
		route_length_ft: anchoring.routeLengthFt,
		expected_length_ft: anchoring.expectedLengthFt,
		projected_log_events: projectedLogEvents,
		parsed_begin_terminus: parsedBegin,
		parsed_end_terminus: parsedEnd,
		route_source_detail: resolved.routeSourceDetail ?? null
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
	beginTerminus?: string | null;
	endTerminus?: string | null;
	roadwayLogEvents?: RoadwayLogEventForPreview[];
	countyNumber?: string | null;
	midpointEasting?: number | null;
	midpointNorthing?: number | null;
	midpointZoneLabel?: string | null;
	grossLengthMi?: number | null;
}): Promise<ResolvedLocation> {
	const lookupWarnings: string[] = [];

	const canTryLrs =
		opts.routeDesignation &&
		opts.midpointEasting != null &&
		opts.midpointNorthing != null &&
		Number.isFinite(opts.midpointEasting) &&
		Number.isFinite(opts.midpointNorthing);

	if (canTryLrs) {
		try {
			const planRoute = await resolveRouteFromPlanWithEvents(
				{
					routeDesignation: opts.routeDesignation,
					midpointEasting: opts.midpointEasting,
					midpointNorthing: opts.midpointNorthing,
					midpointZoneLabel: opts.midpointZoneLabel,
					grossLengthMi: opts.grossLengthMi,
					countyNumber: opts.countyNumber
				},
				opts.roadwayLogEvents ?? []
			);
			if (planRoute && planRoute.trimmedGeometry.coordinates.length >= 2) {
				const mid = planRoute.trimmedGeometry.coordinates[
					Math.floor(planRoute.trimmedGeometry.coordinates.length / 2)
				];
				return {
					latitude: mid[1],
					longitude: mid[0],
					routeGeometry: planRoute.trimmedGeometry,
					source: 'gdot_lrs',
					locationPrecision: 'route',
					countyBoundary: null,
					lookupWarnings,
					lrsRoute: planRoute.lrsRoute,
					calibration: planRoute.calibration,
					routeSourceDetail: planRoute.detail
				};
			}
		} catch (err) {
			console.error('[gdot-geometry] LRS plan route resolution failed:', err);
			lookupWarnings.push('LRS mid-point route resolution failed; falling back to GPAS.');
		}
	}

	const routeGeometry = await fetchGdotRouteGeometry(opts.routeDesignation, opts.county);

	if (routeGeometry) {
		const centroid = lineStringCentroid(routeGeometry);
		if (centroid) {
			return {
				latitude: centroid[0],
				longitude: centroid[1],
				routeGeometry,
				source: 'gdot_route',
				locationPrecision: 'route',
				countyBoundary: null,
				lookupWarnings
			};
		}
	}
	if (opts.routeDesignation) {
		lookupWarnings.push(`No GDOT route geometry found for ${opts.routeDesignation}${opts.county ? ` in ${opts.county}` : ''}.`);
	}

	const osmRoute = await fetchOsmTerminiRoute({
		routeDesignation: opts.routeDesignation,
		county: opts.county,
		beginTerminus: opts.beginTerminus,
		endTerminus: opts.endTerminus
	});
	lookupWarnings.push(...osmRoute.lookupWarnings);
	if (osmRoute.routeGeometry) {
		const centroid = lineStringCentroid(osmRoute.routeGeometry);
		if (centroid) {
			return {
				latitude: centroid[0],
				longitude: centroid[1],
				routeGeometry: osmRoute.routeGeometry,
				source: 'osm_termini_route',
				locationPrecision: 'route',
				countyBoundary: null,
				lookupWarnings
			};
		}
	}

	// Overpass fallback: direct OSM way lookup by route designation.
	if (opts.routeDesignation) {
		const overpassGeometry = await fetchOverpassRouteGeometry(opts.routeDesignation, opts.county);
		if (overpassGeometry) {
			const centroid = lineStringCentroid(overpassGeometry);
			if (centroid) {
				return {
					latitude: centroid[0],
					longitude: centroid[1],
					routeGeometry: overpassGeometry,
					source: 'osm_overpass',
					locationPrecision: 'route',
					countyBoundary: null,
					lookupWarnings
				};
			}
		}
		lookupWarnings.push(
			`No OSM Overpass route found for ${opts.routeDesignation}${opts.county ? ` in ${opts.county}` : ''}.`
		);
	}

	// Fallback A: geocode the most specific free-text we have. The one-line
	// geocoder matches street-address-shaped text best; a bare county usually
	// misses here, which is why fallback B exists.
	const geoQuery =
		opts.locationDescription && opts.county
			? `${opts.locationDescription}, ${normaliseCounty(opts.county)} County, GA`
			: opts.locationDescription;
	const coords = await geocodeAddress(geoQuery);
	if (coords) {
		return {
			latitude: coords[0],
			longitude: coords[1],
			routeGeometry: null,
			source: 'geocode',
			locationPrecision: 'point',
			countyBoundary: null,
			lookupWarnings
		};
	}

	// Fallback B: authoritative GDOT county polygon centroid. Always attempted
	// when a county is present, so a route-less, address-less document still
	// gets an approximate pin.
	const countyBoundary = await fetchCountyBoundary(opts.county);
	if (countyBoundary) {
		return {
			latitude: countyBoundary.centroid.lat,
			longitude: countyBoundary.centroid.lng,
			routeGeometry: null,
			source: 'county_centroid',
			locationPrecision: 'county',
			countyBoundary,
			lookupWarnings
		};
	}

	return {
		latitude: null,
		longitude: null,
		routeGeometry: null,
		source: 'none',
		locationPrecision: 'none',
		countyBoundary: null,
		lookupWarnings
	};
}

async function geocodeOsm(query: string): Promise<{ lat: number; lng: number } | null> {
	const params = new URLSearchParams({
		q: query,
		format: 'jsonv2',
		limit: '1',
		countrycodes: 'us'
	});
	try {
		const res = await fetch(`${NOMINATIM_SEARCH}?${params.toString()}`, {
			headers: {
				'accept-language': 'en',
				'user-agent': 'PaveRate import route preview'
			},
			signal: AbortSignal.timeout(7000)
		});
		if (!res.ok) return null;
		const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
		const match = data[0];
		if (!match?.lat || !match.lon) return null;
		const lat = Number(match.lat);
		const lng = Number(match.lon);
		return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
	} catch {
		return null;
	}
}

function terminusQueries(opts: {
	terminus: string;
	routeDesignation: string | null;
	county: string | null;
}): string[] {
	const parsed = parseTerminus(opts.terminus);
	const countyPart = opts.county ? `${normaliseCounty(opts.county)} County, Georgia` : 'Georgia';
	const routePart = opts.routeDesignation ? `${opts.routeDesignation}, ` : '';

	// If parsed as intersection with 2+ roads, build better queries
	if (parsed && parsed.type === 'intersection' && parsed.parsed_roads.length >= 2) {
		const roadList = parsed.parsed_roads.join(' and ');
		return [
			`${roadList}, ${countyPart}`,
			`intersection of ${roadList}, ${countyPart}`,
			`${roadList}, Georgia`,
			`intersection of ${roadList}, Georgia`
		];
	}

	// If parsed as milepost, skip (not geocodeable)
	if (parsed && parsed.type === 'milepost') {
		return [];
	}

	// Default queries for raw or landmark types
	return [
		`${routePart}${opts.terminus}, ${countyPart}`,
		`${opts.terminus}, ${countyPart}`,
		`${routePart}${opts.terminus}, Georgia`
	];
}

async function geocodeTerminus(opts: {
	terminus: string | null | undefined;
	routeDesignation: string | null;
	county: string | null;
}): Promise<{ lat: number; lng: number } | null> {
	const terminus = opts.terminus?.trim();
	if (!terminus) return null;
	for (const query of terminusQueries({ terminus, routeDesignation: opts.routeDesignation, county: opts.county })) {
		const result = await geocodeOsm(query);
		if (result) return result;
	}
	return null;
}

export async function fetchOsmTerminiRoute(opts: {
	routeDesignation: string | null;
	county: string | null;
	beginTerminus?: string | null;
	endTerminus?: string | null;
}): Promise<{ routeGeometry: GeoJsonLineString | null; lookupWarnings: string[] }> {
	const lookupWarnings: string[] = [];
	if (!opts.beginTerminus || !opts.endTerminus) {
		return { routeGeometry: null, lookupWarnings };
	}

	const begin = await geocodeTerminus({
		terminus: opts.beginTerminus,
		routeDesignation: opts.routeDesignation,
		county: opts.county
	});
	const end = await geocodeTerminus({
		terminus: opts.endTerminus,
		routeDesignation: opts.routeDesignation,
		county: opts.county
	});
	if (!begin || !end) {
		lookupWarnings.push('OSM fallback could not geocode both parsed termini.');
		return { routeGeometry: null, lookupWarnings };
	}

	const routed = await routeAlongRoads(begin, end);
	if (!routed || routed.coordinates.length < 2) {
		lookupWarnings.push('OSM fallback could not route between parsed termini.');
		return { routeGeometry: null, lookupWarnings };
	}

	return {
		routeGeometry: {
			type: 'LineString',
			coordinates: routed.coordinates.map(([lat, lng]) => [lng, lat] as [number, number])
		},
		lookupWarnings
	};
}

function projectRoadwayLogEventsLrs(
	events: RoadwayLogEventForPreview[],
	lrsRoute: LrsRoute,
	calibration: RouteCalibration
): RoadwayLogEventPreview[] {
	return events.flatMap((event, index) => {
		const routeM = calibrationToRouteMeasure(calibration, event.milepost);
		const pt = measureToPoint(lrsRoute, routeM);
		if (!pt) return [];
		return [
			{
				id: `preview-log-${index}`,
				milepost: event.milepost,
				event_type: event.event_type ?? 'note',
				description: event.description ?? '',
				roadway_width_ft: event.roadway_width_ft ?? null,
				is_reference: event.is_reference ? 1 : 0,
				confidence: event.confidence ?? 'low',
				coordinate_geojson: JSON.stringify({ type: 'Point', coordinates: pt })
			}
		];
	});
}

function projectRoadwayLogEvents(
	events: RoadwayLogEventForPreview[],
	waypoints: Array<{ lat: number; lng: number }>
): RoadwayLogEventPreview[] {
	if (waypoints.length < 2) return [];
	const routeLengthFt = polylineLengthFt(waypoints);
	return events.flatMap((event, index) => {
		const stationFeet = stationToFeet(event.station);
		if (!Number.isFinite(stationFeet) || stationFeet > routeLengthFt) return [];
		const coord = feetToCoordinate(stationFeet, waypoints);
		if (!coord) return [];
		return [
			{
				id: `preview-log-${index}`,
				milepost: event.milepost,
				event_type: event.event_type ?? 'note',
				description: event.description ?? '',
				roadway_width_ft: event.roadway_width_ft ?? null,
				is_reference: event.is_reference ? 1 : 0,
				confidence: event.confidence ?? 'low',
				coordinate_geojson: JSON.stringify({ type: 'Point', coordinates: [coord[1], coord[0]] })
			}
		];
	});
}

// --------------------------------------------------------------------------
// Per-segment geometry mapping (StructuredContract → tagged MultiLineString)
// --------------------------------------------------------------------------

/**
 * A single mapped contract segment: one named road resolved to its own
 * centerline. `geometry` is null only when the segment is genuinely
 * unresolvable (we never fabricate coordinates — vague/un-geocodable termini
 * are flagged in `low_confidence_termini` for manual map placement instead).
 *
 * This is a SUPERSET of the downstream `ImportSegment` persistence contract
 * (see docs/multi-segment-persistence-design.md): the first block of fields
 * matches `ImportSegment` field-for-field so `from-import` can persist a
 * MappedSegment directly with no translation layer. `source`,
 * `lookup_warnings`, and `low_confidence_termini` are additive diagnostics the
 * persistence side ignores.
 */
export interface MappedSegment {
	// --- ImportSegment contract (field-for-field) ---
	name: string | null;
	kind: SegmentKind | null;
	group: string | null;
	treatment: string | null;
	measure_axis: MeasureAxis;
	begin_terminus: string | null;
	end_terminus: string | null;
	length_mi: number | null;
	/** Resolved centerline as GeoJSON [lng, lat]; null when truly unresolvable. */
	geometry: GeoJsonLineString | null;
	/** Confidence in the snapped line: LRS=high, termini-snap=medium, flagged/none=low. */
	geometry_confidence: FieldConfidence;
	// --- additive diagnostics (ignored by from-import) ---
	source: 'gdot_lrs' | 'osm_termini_route' | 'gdot_route' | 'none';
	lookup_warnings: string[];
	/** Flagged termini that were vague/un-geocodable (low confidence for user map adjustment). */
	low_confidence_termini: string[];
}

/**
 * The result of mapping every segment of a {@link StructuredContract}. A project
 * is N disconnected centerlines (a MultiLineString); each {@link MappedSegment}
 * carries its own geometry + provenance so one failing segment never aborts the
 * rest.
 */
export interface MappedSegments {
	segments: MappedSegment[];
	lookup_warnings: string[];
}

/** Read a ParsedField<T> value, tolerating a null/undefined field. */
function fieldValue<T>(f: { value: T | null } | null | undefined): T | null {
	return f?.value ?? null;
}

/**
 * Map the segment's roadway-log events into the `{ milepost, event_type }[]`
 * shape `resolveRouteFromPlanWithEvents` expects. Only events with a finite
 * numeric `measure` are usable; the structured event `type` carries the
 * project_start / project_end markers the trimmer keys off.
 */
function segmentEventsToPlanEvents(
	segment: ContractSegment
): Array<{ milepost: number; event_type?: string }> {
	const out: Array<{ milepost: number; event_type?: string }> = [];
	for (const event of segment.events ?? []) {
		const measure = fieldValue(event.measure);
		if (typeof measure !== 'number' || !Number.isFinite(measure)) continue;
		const eventType = fieldValue(event.type);
		out.push({ milepost: measure, event_type: eventType ?? undefined });
	}
	return out;
}

/**
 * Decide whether a segment can be resolved via the GDOT LRS path: it must be on
 * a numbered route, carry a State Plane mid-point with finite easting/northing,
 * and be stationed along the `project_mile` axis.
 */
function canResolveSegmentViaLrs(contract: StructuredContract, segment: ContractSegment): boolean {
	const designation = fieldValue(contract.route?.designation ?? null);
	if (!designation) return false;

	const easting = fieldValue(contract.midpoint?.easting ?? null);
	const northing = fieldValue(contract.midpoint?.northing ?? null);
	if (typeof easting !== 'number' || !Number.isFinite(easting)) return false;
	if (typeof northing !== 'number' || !Number.isFinite(northing)) return false;

	return fieldValue(segment.measure_axis) === 'project_mile';
}

/** Resolve one segment via the GDOT LRS plan-route path. */
async function mapSegmentViaLrs(
	contract: StructuredContract,
	segment: ContractSegment
): Promise<{ geometry: GeoJsonLineString | null; warnings: string[] }> {
	const warnings: string[] = [];
	const planRoute = await resolveRouteFromPlanWithEvents(
		{
			routeDesignation: fieldValue(contract.route?.designation ?? null),
			midpointEasting: fieldValue(contract.midpoint?.easting ?? null),
			midpointNorthing: fieldValue(contract.midpoint?.northing ?? null),
			midpointZoneLabel: fieldValue(contract.midpoint?.zone_label ?? null),
			grossLengthMi: fieldValue(segment.length_mi) ?? fieldValue(contract.gross_length_mi),
			countyNumber: fieldValue(contract.county?.fips ?? null)
		},
		segmentEventsToPlanEvents(segment)
	);
	if (planRoute && planRoute.trimmedGeometry.coordinates.length >= 2) {
		return { geometry: planRoute.trimmedGeometry, warnings };
	}
	warnings.push(
		`LRS mid-point route resolution did not yield geometry for segment "${
			fieldValue(segment.name) ?? 'unnamed'
		}".`
	);
	return { geometry: null, warnings };
}

/**
 * Resolve one segment via OSRM termini road-snap. Returns geometry + warnings +
 * the list of termini that could not be geocoded/routed (for low-confidence
 * flagging). Never fabricates coordinates.
 */
async function mapSegmentViaTermini(
	contract: StructuredContract,
	segment: ContractSegment
): Promise<{
	geometry: GeoJsonLineString | null;
	warnings: string[];
	lowConfidenceTermini: string[];
}> {
	const beginTerminus = fieldValue(segment.begin_terminus);
	const endTerminus = fieldValue(segment.end_terminus);
	const segName = fieldValue(segment.name) ?? 'unnamed';

	const missing: string[] = [];
	if (!beginTerminus) missing.push('begin terminus');
	if (!endTerminus) missing.push('end terminus');
	if (missing.length > 0) {
		return {
			geometry: null,
			warnings: [`Segment "${segName}" is missing its ${missing.join(' and ')}; cannot snap a route.`],
			lowConfidenceTermini: [beginTerminus, endTerminus].filter(
				(t): t is string => typeof t === 'string' && t.trim().length > 0
			)
		};
	}

	const osm = await fetchOsmTerminiRoute({
		routeDesignation: fieldValue(contract.route?.designation ?? null),
		county: fieldValue(contract.county?.name ?? null),
		beginTerminus,
		endTerminus
	});

	if (osm.routeGeometry && osm.routeGeometry.coordinates.length >= 2) {
		return { geometry: osm.routeGeometry, warnings: osm.lookupWarnings, lowConfidenceTermini: [] };
	}

	// Both termini could not be geocoded/routed — flag them for manual placement.
	const lowConfidenceTermini = [beginTerminus, endTerminus].filter(
		(t): t is string => typeof t === 'string' && t.trim().length > 0
	);
	const warnings = [...osm.lookupWarnings];
	warnings.push(
		`Could not geocode/route the termini for segment "${segName}" — flag for manual map placement.`
	);
	return { geometry: null, warnings, lowConfidenceTermini };
}

/**
 * Resolve geometry PER SEGMENT for a {@link StructuredContract}, returning N
 * independently-mapped centerlines (conceptually a MultiLineString of
 * disconnected roads). Routed (numbered-route + mid-point + project_mile)
 * segments use the GDOT LRS path; everything else (local streets, missing
 * route/mid-point) uses OSRM termini road-snap. Each segment is wrapped in a
 * try/catch so one failure never aborts the rest, and no coordinate is ever
 * fabricated — un-resolvable termini are flagged for manual placement instead.
 */
export async function mapStructuredContractSegments(
	contract: StructuredContract
): Promise<MappedSegments> {
	const segments: MappedSegment[] = [];
	const lookupWarnings: string[] = [];

	for (const segment of contract.segments ?? []) {
		// Base ImportSegment-contract fields, copied straight from the structured
		// segment so the output conforms field-for-field regardless of outcome.
		const base = {
			name: fieldValue(segment.name),
			kind: fieldValue(segment.kind),
			group: fieldValue(segment.group),
			treatment: fieldValue(segment.treatment),
			measure_axis: (fieldValue(segment.measure_axis) ?? 'none') as MeasureAxis,
			begin_terminus: fieldValue(segment.begin_terminus),
			end_terminus: fieldValue(segment.end_terminus),
			length_mi: fieldValue(segment.length_mi)
		};

		try {
			if (canResolveSegmentViaLrs(contract, segment)) {
				const { geometry, warnings } = await mapSegmentViaLrs(contract, segment);
				if (geometry) {
					segments.push({
						...base,
						geometry,
						geometry_confidence: 'high',
						source: 'gdot_lrs',
						lookup_warnings: warnings,
						low_confidence_termini: []
					});
					continue;
				}
				// LRS produced nothing usable — fall back to termini road-snap.
				const fallback = await mapSegmentViaTermini(contract, segment);
				segments.push({
					...base,
					geometry: fallback.geometry,
					geometry_confidence: geometryConfidence(fallback.geometry, fallback.lowConfidenceTermini),
					source: fallback.geometry ? 'osm_termini_route' : 'none',
					lookup_warnings: [...warnings, ...fallback.warnings],
					low_confidence_termini: fallback.lowConfidenceTermini
				});
				continue;
			}

			const { geometry, warnings, lowConfidenceTermini } = await mapSegmentViaTermini(
				contract,
				segment
			);
			segments.push({
				...base,
				geometry,
				geometry_confidence: geometryConfidence(geometry, lowConfidenceTermini),
				source: geometry ? 'osm_termini_route' : 'none',
				lookup_warnings: warnings,
				low_confidence_termini: lowConfidenceTermini
			});
		} catch (err) {
			console.error('[gdot-geometry] segment mapping failed:', err);
			segments.push({
				...base,
				geometry: null,
				geometry_confidence: 'low',
				source: 'none',
				lookup_warnings: [
					`Geometry resolution threw for segment "${base.name ?? 'unnamed'}"; left unmapped.`
				],
				low_confidence_termini: []
			});
		}
	}

	return { segments, lookup_warnings: lookupWarnings };
}

/**
 * Confidence for a termini-snapped (non-LRS) segment line: a clean snapped line
 * is `medium`; if any terminus had to be flagged (vague/un-geocodable) or the
 * geometry is missing entirely it is `low`. LRS-resolved lines are `high`
 * (handled at the call site). Mirrors the review-page amber/red convention.
 */
function geometryConfidence(
	geometry: GeoJsonLineString | null,
	lowConfidenceTermini: string[]
): FieldConfidence {
	if (!geometry) return 'low';
	return lowConfidenceTermini.length > 0 ? 'low' : 'medium';
}
