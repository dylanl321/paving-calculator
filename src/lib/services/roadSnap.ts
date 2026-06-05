/**
 * roadSnap — constrain map interactions to actual roads.
 *
 * PaveRate is a paving app: every alignment line and marker must lie on a real
 * road, never in a field/building/parking lot. These helpers snap free map
 * clicks to the public road network.
 *
 * Snap strategy (in priority order):
 *  1. Local dot_road_segments (GDOT centerlines ingested via arcgis-fetch) — hit
 *     /api/gdot-routes?bbox=... which queries D1 for segments near the click,
 *     then compute the nearest point on the closest LineString.
 *  2. OSRM nearest endpoint — key-less public routing engine used as a fallback
 *     when no local segments cover the area (e.g. outside Georgia or before the
 *     GDOT ingest has run).
 *
 * Sources are best-effort and never invent geometry — on any failure the caller
 * gets `null` (or the input unchanged) and can surface that to the user.
 */

const OSRM_BASE = 'https://router.project-osrm.org';
/** Half-side of the bbox (degrees) sent to the local road-segment endpoint. */
const LOCAL_SNAP_RADIUS_DEG = 0.01; // ~1 km at mid-latitudes
/** If local snap moves the point more than this, treat it as a miss. */
const LOCAL_SNAP_MAX_M = 150;

export interface SnappedPoint {
	/** Snapped coordinate on the nearest road. */
	lat: number;
	lng: number;
	/** Distance (meters) from the clicked point to the snapped road point. */
	distanceM: number;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** Haversine distance in meters between two WGS-84 points. */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6_371_000;
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest point on a GeoJSON LineString [lng, lat][] to a query [lat, lng].
 * Returns [lat, lng, distanceM].
 */
function nearestPointOnLineString(
	coords: [number, number][],
	lat: number,
	lng: number
): [number, number, number] | null {
	if (coords.length < 2) return null;
	let bestLat = 0;
	let bestLng = 0;
	let bestDist = Infinity;

	for (let i = 0; i < coords.length - 1; i++) {
		const [ax, ay] = coords[i]; // GeoJSON: [lng, lat]
		const [bx, by] = coords[i + 1];
		// Project (lng, lat) onto segment (ax,ay)-(bx,by) in degree-space.
		// Good enough for sub-km segments; no projection library needed.
		const dx = bx - ax;
		const dy = by - ay;
		const lenSq = dx * dx + dy * dy;
		let t = 0;
		if (lenSq > 0) {
			t = ((lng - ax) * dx + (lat - ay) * dy) / lenSq;
			t = Math.max(0, Math.min(1, t));
		}
		const px = ax + t * dx;
		const py = ay + t * dy;
		const dist = haversineM(lat, lng, py, px);
		if (dist < bestDist) {
			bestDist = dist;
			bestLat = py;
			bestLng = px;
		}
	}
	return bestDist < Infinity ? [bestLat, bestLng, bestDist] : null;
}

// ── Local snap (dot_road_segments) ───────────────────────────────────────────

interface GeoJsonFeature {
	type: 'Feature';
	geometry: { type: string; coordinates: [number, number][] } | null;
}

interface GeoJsonFeatureCollection {
	type: 'FeatureCollection';
	features: GeoJsonFeature[];
}

/**
 * Attempt to snap a point to a GDOT road centerline stored in dot_road_segments.
 * Calls the local /api/gdot-routes?bbox=... endpoint (D1-backed, no external network).
 * Returns null when no segment is nearby or the endpoint is unavailable.
 */
async function snapToLocalRoad(
	lat: number,
	lng: number,
	signal?: AbortSignal
): Promise<SnappedPoint | null> {
	try {
		const r = LOCAL_SNAP_RADIUS_DEG;
		const bbox = `${lng - r},${lat - r},${lng + r},${lat + r}`;
		const res = await fetch(`/api/gdot-routes?bbox=${bbox}`, {
			signal: signal ?? AbortSignal.timeout(4000)
		});
		if (!res.ok) return null;
		const fc = (await res.json()) as GeoJsonFeatureCollection;
		if (!Array.isArray(fc.features) || fc.features.length === 0) return null;

		let bestLat = 0;
		let bestLng = 0;
		let bestDist = Infinity;

		for (const feature of fc.features) {
			if (feature.geometry?.type !== 'LineString') continue;
			const result = nearestPointOnLineString(feature.geometry.coordinates, lat, lng);
			if (result && result[2] < bestDist) {
				[bestLat, bestLng, bestDist] = result;
			}
		}

		if (bestDist > LOCAL_SNAP_MAX_M) return null;
		return { lat: bestLat, lng: bestLng, distanceM: bestDist };
	} catch {
		return null;
	}
}

// ── OSRM snap (fallback) ─────────────────────────────────────────────────────

/**
 * Snap a single clicked coordinate to the nearest point on the road network
 * using OSRM. Returns null when OSRM is unreachable or returns no road within range.
 */
async function snapToOsrm(
	lat: number,
	lng: number,
	signal?: AbortSignal
): Promise<SnappedPoint | null> {
	try {
		const url = `${OSRM_BASE}/nearest/v1/driving/${lng},${lat}?number=1`;
		const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(6000) });
		if (!res.ok) return null;
		const data = (await res.json()) as {
			code?: string;
			waypoints?: Array<{ location?: [number, number]; distance?: number }>;
		};
		if (data.code !== 'Ok') return null;
		const wp = data.waypoints?.[0];
		const loc = wp?.location;
		if (!loc || typeof loc[0] !== 'number' || typeof loc[1] !== 'number') return null;
		return { lat: loc[1], lng: loc[0], distanceM: wp?.distance ?? 0 };
	} catch {
		return null;
	}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Snap a single clicked coordinate to the nearest point on the road network.
 * Tries local GDOT segments first, falls back to OSRM on miss or failure.
 * Returns null when neither source returns a road within range.
 */
export async function snapToNearestRoad(
	lat: number,
	lng: number,
	signal?: AbortSignal
): Promise<SnappedPoint | null> {
	const local = await snapToLocalRoad(lat, lng, signal);
	if (local) return local;
	return snapToOsrm(lat, lng, signal);
}

export interface RoadPath {
	/** Full road-following geometry as [lat, lng] pairs (includes both endpoints). */
	coordinates: [number, number][];
	/** Total length of the road path in meters. */
	distanceM: number;
}

/**
 * Route between two coordinates along real roads, returning the full road
 * geometry. Used to connect consecutive alignment waypoints so the line follows
 * the actual road rather than cutting straight across. Returns null on failure.
 */
export async function routeAlongRoads(
	from: { lat: number; lng: number },
	to: { lat: number; lng: number },
	signal?: AbortSignal
): Promise<RoadPath | null> {
	try {
		const coordStr = `${from.lng},${from.lat};${to.lng},${to.lat}`;
		const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
		const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000) });
		if (!res.ok) return null;
		const data = (await res.json()) as {
			code?: string;
			routes?: Array<{
				distance?: number;
				geometry?: { coordinates?: [number, number][] };
			}>;
		};
		if (data.code !== 'Ok') return null;
		const route = data.routes?.[0];
		const coords = route?.geometry?.coordinates;
		if (!coords || coords.length < 2) return null;
		return {
			coordinates: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
			distanceM: route?.distance ?? 0
		};
	} catch {
		return null;
	}
}

/**
 * Build a road-following alignment from an ordered list of clicked control
 * points: snap the first point to a road, then route along real roads to each
 * subsequent point. The result is a dense polyline of [lat, lng] vertices that
 * stays on the road network.
 *
 * If routing fails for a leg, that leg falls back to the two snapped endpoints
 * (a straight segment) rather than dropping the point — the alignment stays
 * continuous and still anchored to snapped road points.
 */
export async function buildRoadAlignment(
	controlPoints: { lat: number; lng: number }[],
	signal?: AbortSignal
): Promise<[number, number][]> {
	if (controlPoints.length === 0) return [];
	if (controlPoints.length === 1) {
		const snapped = await snapToNearestRoad(controlPoints[0].lat, controlPoints[0].lng, signal);
		const p = snapped ?? controlPoints[0];
		return [[p.lat, p.lng]];
	}

	// Snap every control point to the road network up front.
	const snapped = await Promise.all(
		controlPoints.map(async (cp) => {
			const s = await snapToNearestRoad(cp.lat, cp.lng, signal);
			return s ? { lat: s.lat, lng: s.lng } : cp;
		})
	);

	const out: [number, number][] = [];
	for (let i = 0; i < snapped.length - 1; i++) {
		const leg = await routeAlongRoads(snapped[i], snapped[i + 1], signal);
		const legCoords = leg?.coordinates ?? [
			[snapped[i].lat, snapped[i].lng],
			[snapped[i + 1].lat, snapped[i + 1].lng]
		];
		// Avoid duplicating the shared vertex between consecutive legs.
		if (i > 0 && legCoords.length > 0) legCoords.shift();
		out.push(...legCoords);
	}
	return out;
}
