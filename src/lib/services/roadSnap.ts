/**
 * roadSnap — constrain map interactions to actual roads.
 *
 * PaveRate is a paving app: every alignment line and marker must lie on a real
 * road, never in a field/building/parking lot. These helpers snap free map
 * clicks to the public road network using OSRM's key-less demo server, so the
 * drawn route follows real roads instead of straight-line shortcuts.
 *
 * Sources are best-effort and never invent geometry — on any failure the caller
 * gets `null` (or the input unchanged) and can surface that to the user. Nothing
 * here fabricates a road that the routing engine did not return.
 */

const OSRM_BASE = 'https://router.project-osrm.org';

export interface SnappedPoint {
	/** Snapped coordinate on the nearest road. */
	lat: number;
	lng: number;
	/** Distance (meters) from the clicked point to the snapped road point. */
	distanceM: number;
}

/**
 * Snap a single clicked coordinate to the nearest point on the road network.
 * Returns null when OSRM is unreachable or returns no road within range.
 */
export async function snapToNearestRoad(
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
