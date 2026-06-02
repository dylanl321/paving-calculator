/**
 * GPS-to-station detection service.
 *
 * Converts a GPS coordinate into an engineering station number along a
 * known route polyline.  Station numbers follow the US road convention:
 *   1 station = 100 feet
 * so station 12.50 = "12+50" = 1250 ft from the route start.
 *
 * The algorithm:
 * 1. Walk every segment of the route polyline.
 * 2. Find the closest point on each segment to the user's GPS position.
 * 3. Return the cumulative distance (in feet) to that closest point,
 *    expressed as a station number (feet / 100).
 */

export interface RouteWaypoint {
	lat: number;
	lng: number;
}

export interface StationResult {
	/** Station number (feet from route start / 100).  e.g. 12.5 = Sta 12+50 */
	station: number;
	/** Perpendicular offset from the route centre-line in feet */
	offsetFt: number;
	/** Cumulative distance in feet from route start */
	distanceFt: number;
}

const EARTH_RADIUS_M = 6_371_000;
const FEET_PER_METER = 3.280_84;

/** Haversine distance in metres between two lat/lng points */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Project point P onto segment AB (all in local flat-earth metres relative to
 * a single reference point).  Returns the clamped parameter t in [0,1] and the
 * squared distance from P to the projected point.
 */
function projectOntoSegment(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number
): { t: number; distSq: number } {
	const abx = bx - ax;
	const aby = by - ay;
	const lenSq = abx * abx + aby * aby;

	if (lenSq === 0) {
		// Degenerate zero-length segment
		const dx = px - ax;
		const dy = py - ay;
		return { t: 0, distSq: dx * dx + dy * dy };
	}

	const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
	const projX = ax + t * abx;
	const projY = ay + t * aby;
	const dx = px - projX;
	const dy = py - projY;
	return { t, distSq: dx * dx + dy * dy };
}

/**
 * Convert lat/lng to local flat-earth X/Y in metres relative to a reference
 * point.  Accurate enough for route segments < ~50 km.
 */
function toLocal(
	lat: number,
	lng: number,
	refLat: number,
	refLng: number
): { x: number; y: number } {
	const latRad = (refLat * Math.PI) / 180;
	const y = ((lat - refLat) * Math.PI * EARTH_RADIUS_M) / 180;
	const x = ((lng - refLng) * Math.PI * EARTH_RADIUS_M * Math.cos(latRad)) / 180;
	return { x, y };
}

/**
 * Given a route polyline and a GPS position, return the station number and
 * offset.  Returns null if the route has fewer than 2 waypoints.
 */
export function detectStation(
	userLat: number,
	userLng: number,
	waypoints: RouteWaypoint[]
): StationResult | null {
	if (waypoints.length < 2) return null;

	// Use first waypoint as the flat-earth reference origin
	const ref = waypoints[0];

	// Convert all waypoints to local metres
	const pts = waypoints.map((wp) => toLocal(wp.lat, wp.lng, ref.lat, ref.lng));
	const user = toLocal(userLat, userLng, ref.lat, ref.lng);

	// Cumulative segment lengths in metres (for station calculation)
	const segLengths: number[] = [];
	for (let i = 0; i < waypoints.length - 1; i++) {
		segLengths.push(
			haversineM(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng)
		);
	}

	let bestDistSq = Infinity;
	let bestSegIdx = 0;
	let bestT = 0;

	for (let i = 0; i < pts.length - 1; i++) {
		const { t, distSq } = projectOntoSegment(
			user.x,
			user.y,
			pts[i].x,
			pts[i].y,
			pts[i + 1].x,
			pts[i + 1].y
		);
		if (distSq < bestDistSq) {
			bestDistSq = distSq;
			bestSegIdx = i;
			bestT = t;
		}
	}

	// Cumulative distance in metres from route start to projection
	let cumM = 0;
	for (let i = 0; i < bestSegIdx; i++) {
		cumM += segLengths[i];
	}
	cumM += bestT * segLengths[bestSegIdx];

	const distanceFt = cumM * FEET_PER_METER;
	const station = distanceFt / 100;
	const offsetFt = Math.sqrt(bestDistSq) * FEET_PER_METER;

	return { station, offsetFt, distanceFt };
}

/** Format a station number as a human-readable string (e.g. "12+50"). */
export function formatStation(station: number): string {
	const totalFt = Math.round(station * 100);
	const major = Math.floor(totalFt / 100);
	const minor = totalFt % 100;
	return `${major}+${String(minor).padStart(2, '0')}`;
}
