/**
 * Shared map utilities for PaveRate
 * Coordinate conversions, distance calculations, station notation.
 * All physical constants come from paverate.yaml via constant().
 */
import { constant } from '$lib/config';

const FT_PER_M = () => constant('CONST.FT_PER_M');
const FT_PER_STATION = () => constant('CONST.FT_PER_STATION');

/** Meters -> feet using the config conversion factor. */
export function metersToFeet(meters: number): number {
	return meters * FT_PER_M();
}

/**
 * Convert array of coordinates to Leaflet bounds
 */
export function coordinatesToBounds(
	coords: [number, number][]
): [[number, number], [number, number]] {
	if (coords.length === 0) {
		return [
			[0, 0],
			[0, 0]
		];
	}
	const lats = coords.map((c) => c[0]);
	const lngs = coords.map((c) => c[1]);
	return [
		[Math.min(...lats), Math.min(...lngs)],
		[Math.max(...lats), Math.max(...lngs)]
	];
}

/**
 * Haversine distance between two lat/lng points (meters).
 */
export function haversineMeters(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const R = constant('CONST.EARTH_RADIUS_M');
	const phi1 = (lat1 * Math.PI) / 180;
	const phi2 = (lat2 * Math.PI) / 180;
	const dphi = ((lat2 - lat1) * Math.PI) / 180;
	const dlambda = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dphi / 2) * Math.sin(dphi / 2) +
		Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) * Math.sin(dlambda / 2);
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Haversine distance between two lat/lng points (feet). */
export function haversineFeet(lat1: number, lng1: number, lat2: number, lng2: number): number {
	return metersToFeet(haversineMeters(lat1, lng1, lat2, lng2));
}

/**
 * Distance between two points in meters and feet
 */
export function distanceBetween(
	a: { lat: number; lng: number },
	b: { lat: number; lng: number }
): { meters: number; feet: number } {
	const meters = haversineMeters(a.lat, a.lng, b.lat, b.lng);
	return {
		meters,
		feet: metersToFeet(meters)
	};
}

/**
 * Station notation to feet: station 1.5 = 150 feet
 */
export function stationToFeet(station: number): number {
	return station * FT_PER_STATION();
}

/**
 * Feet to station notation: 150 feet = station 1.5
 */
export function feetToStation(feet: number): number {
	return feet / FT_PER_STATION();
}

/**
 * Find station number for a coordinate along a route defined by waypoints
 * Returns null if coordinate is not on the route
 */
export function coordinateToStation(
	coord: { lat: number; lng: number },
	waypoints: { lat: number; lng: number }[],
	totalFt?: number
): number | null {
	if (waypoints.length < 2) return null;

	// Find the closest point on the route
	let minDist = Infinity;
	let closestSegmentIdx = -1;
	let closestFraction = 0;

	let accumulated = 0;
	for (let i = 0; i < waypoints.length - 1; i++) {
		const segMeters = haversineMeters(
			waypoints[i].lat,
			waypoints[i].lng,
			waypoints[i + 1].lat,
			waypoints[i + 1].lng
		);
		const segFt = metersToFeet(segMeters);

		// Check distance to this segment
		for (let fraction = 0; fraction <= 1; fraction += 0.01) {
			const testLat = waypoints[i].lat + fraction * (waypoints[i + 1].lat - waypoints[i].lat);
			const testLng = waypoints[i].lng + fraction * (waypoints[i + 1].lng - waypoints[i].lng);
			const dist = haversineMeters(coord.lat, coord.lng, testLat, testLng);
			if (dist < minDist) {
				minDist = dist;
				closestSegmentIdx = i;
				closestFraction = fraction;
			}
		}

		accumulated += segFt;
	}

	// If closest point is too far away (>50 meters), not on route
	const MAX_DISTANCE_METERS = 50;
	if (minDist > MAX_DISTANCE_METERS) return null;

	// Calculate feet to closest point
	let feetToClosest = 0;
	for (let i = 0; i < closestSegmentIdx; i++) {
		const segMeters = haversineMeters(
			waypoints[i].lat,
			waypoints[i].lng,
			waypoints[i + 1].lat,
			waypoints[i + 1].lng
		);
		feetToClosest += metersToFeet(segMeters);
	}
	const segMeters = haversineMeters(
		waypoints[closestSegmentIdx].lat,
		waypoints[closestSegmentIdx].lng,
		waypoints[closestSegmentIdx + 1].lat,
		waypoints[closestSegmentIdx + 1].lng
	);
	feetToClosest += metersToFeet(segMeters) * closestFraction;

	return feetToStation(feetToClosest);
}

/**
 * Convert station number to [lat, lng] coordinate along route
 * Returns null if station is outside route bounds
 */
export function stationToCoordinate(
	station: number,
	waypoints: { lat: number; lng: number }[]
): [number, number] | null {
	if (waypoints.length < 2) return null;
	const targetFt = stationToFeet(station);
	if (targetFt < 0) return null;
	if (targetFt === 0) return [waypoints[0].lat, waypoints[0].lng];

	let accumulated = 0;
	for (let i = 0; i < waypoints.length - 1; i++) {
		const segMeters = haversineMeters(
			waypoints[i].lat,
			waypoints[i].lng,
			waypoints[i + 1].lat,
			waypoints[i + 1].lng
		);
		const segFt = metersToFeet(segMeters);
		if (accumulated + segFt >= targetFt) {
			const fraction = (targetFt - accumulated) / segFt;
			const lat = waypoints[i].lat + fraction * (waypoints[i + 1].lat - waypoints[i].lat);
			const lng = waypoints[i].lng + fraction * (waypoints[i + 1].lng - waypoints[i].lng);
			return [lat, lng];
		}
		accumulated += segFt;
	}

	// Past end — return last waypoint
	return [waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lng];
}

/**
 * Convert a cumulative distance in FEET along the waypoint polyline to a
 * [lat, lng] coordinate. Equivalent to the per-component `feetToLatLng` copies.
 */
export function feetToCoordinate(
	targetFt: number,
	waypoints: { lat: number; lng: number }[]
): [number, number] | null {
	return stationToCoordinate(feetToStation(targetFt), waypoints);
}

/**
 * Convert GeoJSON object to string for D1 storage
 */
export function geoJsonToD1(geojson: object): string {
	return JSON.stringify(geojson);
}

/**
 * Parse GeoJSON string from D1, returns null on error
 */
export function d1ToGeoJson(text: string): object | null {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
