/**
 * Shared map utilities for PaveRate
 * Coordinate conversions, distance calculations, station notation.
 *
 * Geometry math is backed by tree-shakeable scoped Turf packages (lengths,
 * offsets, slicing, nearest-point projection). Turf returns meters/kilometers,
 * which we convert to feet/stations using the config constants in
 * paverate.yaml (CONST.FT_PER_M, CONST.FT_PER_STATION, CONST.EARTH_RADIUS_M) —
 * never hardcoded conversion factors. Turf is pure GeoJSON math (no `window`),
 * so it is SSR-safe.
 */
import { constant } from '$lib/config';
import length from '@turf/length';
import lineOffset from '@turf/line-offset';
import lineSlice from '@turf/line-slice';
import along from '@turf/along';
import buffer from '@turf/buffer';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { lineString, point } from '@turf/helpers';
import type { Feature, LineString, Position } from 'geojson';

const FT_PER_M = () => constant('CONST.FT_PER_M');
const FT_PER_STATION = () => constant('CONST.FT_PER_STATION');

/** Meters -> feet using the config conversion factor. */
export function metersToFeet(meters: number): number {
	return meters * FT_PER_M();
}

/** Feet -> meters using the config conversion factor. */
export function feetToMeters(feet: number): number {
	return feet / FT_PER_M();
}

interface LatLng {
	lat: number;
	lng: number;
}

/** Build a Turf LineString (GeoJSON [lng,lat]) from {lat,lng} waypoints. */
function waypointsToLine(waypoints: LatLng[]): Feature<LineString> | null {
	if (waypoints.length < 2) return null;
	return lineString(waypoints.map((w) => [w.lng, w.lat] as Position));
}

/**
 * Convert array of coordinates to map bounds
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
	a: LatLng,
	b: LatLng
): { meters: number; feet: number } {
	const meters = haversineMeters(a.lat, a.lng, b.lat, b.lng);
	return {
		meters,
		feet: metersToFeet(meters)
	};
}

/**
 * Total length of a polyline of {lat,lng} waypoints, in feet. Backed by
 * @turf/length (km) converted via the config feet-per-meter constant.
 */
export function polylineLengthFt(waypoints: LatLng[]): number {
	const line = waypointsToLine(waypoints);
	if (!line) return 0;
	return metersToFeet(length(line, { units: 'meters' }));
}

/**
 * Length of a GeoJSON LineString (coordinates as [lng,lat]) in feet. Used for
 * stored road-section geometry.
 */
export function lineStringLengthFt(coordinates: [number, number][]): number {
	if (coordinates.length < 2) return 0;
	return metersToFeet(length(lineString(coordinates), { units: 'meters' }));
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
 * Find station number for a coordinate along a route defined by waypoints.
 * Returns null if the coordinate is farther than ~50 m from the route (off
 * road) or the route has fewer than 2 waypoints. Backed by
 * @turf/nearest-point-on-line, which projects the point onto the polyline and
 * reports both the perpendicular distance and the distance travelled along it.
 */
export function coordinateToStation(
	coord: LatLng,
	waypoints: LatLng[]
): number | null {
	const line = waypointsToLine(waypoints);
	if (!line) return null;

	const snapped = nearestPointOnLine(line, point([coord.lng, coord.lat]), { units: 'meters' });
	const offsetM = snapped.properties.pointDistance ?? Infinity;
	const MAX_DISTANCE_METERS = 50;
	if (offsetM > MAX_DISTANCE_METERS) return null;

	const alongM = snapped.properties.totalDistance ?? 0;
	return feetToStation(metersToFeet(alongM));
}

/**
 * Convert station number to [lat, lng] coordinate along route
 * Returns null if station is outside route bounds. Backed by @turf/along.
 */
export function stationToCoordinate(
	station: number,
	waypoints: LatLng[]
): [number, number] | null {
	const line = waypointsToLine(waypoints);
	if (!line) return null;
	const targetFt = stationToFeet(station);
	if (targetFt < 0) return null;

	const totalM = length(line, { units: 'meters' });
	const targetM = targetFt / FT_PER_M();
	// Clamp past-the-end to the final vertex so callers always get a coordinate.
	const clampedM = Math.min(targetM, totalM);
	const pt = along(line, clampedM, { units: 'meters' });
	const [lng, lat] = pt.geometry.coordinates;
	return [lat, lng];
}

/**
 * Convert a cumulative distance in FEET along the waypoint polyline to a
 * [lat, lng] coordinate.
 */
export function feetToCoordinate(
	targetFt: number,
	waypoints: LatLng[]
): [number, number] | null {
	return stationToCoordinate(feetToStation(targetFt), waypoints);
}

/**
 * Slice the route between two stations and return the road-following GeoJSON
 * LineString (coordinates as [lng,lat]). Traces the actual road shape (curves
 * included) so the section line always lies on the centerline. Backed by
 * @turf/line-slice. Returns null when the route is too short to slice.
 */
export function sliceRouteByStations(
	waypoints: LatLng[],
	startStation: number,
	endStation: number
): { type: 'LineString'; coordinates: [number, number][] } | null {
	const line = waypointsToLine(waypoints);
	if (!line) return null;
	const lo = Math.min(startStation, endStation);
	const hi = Math.max(startStation, endStation);
	const startPt = stationToCoordinate(lo, waypoints);
	const endPt = stationToCoordinate(hi, waypoints);
	if (!startPt || !endPt) return null;

	const sliced = lineSlice(point([startPt[1], startPt[0]]), point([endPt[1], endPt[0]]), line);
	const coords = sliced.geometry.coordinates.map((c) => [c[0], c[1]] as [number, number]);
	if (coords.length < 2) return null;
	return { type: 'LineString', coordinates: coords };
}

/**
 * Build a road-corridor POLYGON for a work zone: slice the route centerline
 * between two stations, then buffer that slice by half the corridor width to
 * both sides. Roads-only by design — the corridor is generated FROM the snapped
 * route slice, never hand-drawn vertices.
 *
 * Returns a GeoJSON Polygon (coordinates as [lng,lat] per RFC 7946) ready to
 * store in the existing `geometry_geojson` field — no schema change. Returns
 * null when the route is too short to slice or the width is non-positive.
 */
export function routeCorridorPolygon(
	waypoints: LatLng[],
	startStation: number,
	endStation: number,
	widthFt: number
): { type: 'Polygon'; coordinates: [number, number][][] } | null {
	if (widthFt <= 0) return null;
	const slice = sliceRouteByStations(waypoints, startStation, endStation);
	if (!slice) return null;

	const halfWidthMeters = feetToMeters(widthFt) / 2;
	const buffered = buffer(lineString(slice.coordinates), halfWidthMeters / 1000, {
		units: 'kilometers'
	});
	if (!buffered) return null;

	const geom = buffered.geometry;
	if (geom.type === 'Polygon') {
		return { type: 'Polygon', coordinates: geom.coordinates as [number, number][][] };
	}
	if (geom.type === 'MultiPolygon') {
		// Collapse to the largest ring set so storage stays a single Polygon.
		const polys = geom.coordinates as [number, number][][][];
		let best = polys[0];
		let bestLen = 0;
		for (const poly of polys) {
			const len = poly[0]?.length ?? 0;
			if (len > bestLen) {
				bestLen = len;
				best = poly;
			}
		}
		return best ? { type: 'Polygon', coordinates: best } : null;
	}
	return null;
}

/**
 * Build a lane-width corridor polygon around the route by offsetting the
 * centerline to both sides (half the total width each way) and joining the two
 * offsets into a closed ring. Backed by @turf/line-offset, which handles
 * corners far better than a per-vertex perpendicular hack.
 *
 * Returns the ring as [lat,lng] pairs (ready for MapPolygon). Empty when there
 * is no route or a non-positive width.
 */
export function laneCorridorPolygon(waypoints: LatLng[], widthMeters: number): [number, number][] {
	const line = waypointsToLine(waypoints);
	if (!line || widthMeters <= 0) return [];

	const halfKm = widthMeters / 2 / 1000;
	const left = lineOffset(line, halfKm, { units: 'kilometers' });
	const right = lineOffset(line, -halfKm, { units: 'kilometers' });

	const leftCoords = left.geometry.coordinates.map((c: Position) => [c[1], c[0]] as [number, number]);
	const rightCoords = right.geometry.coordinates.map(
		(c: Position) => [c[1], c[0]] as [number, number]
	);

	// Walk one side forward and the other back to form a closed corridor ring.
	return [...leftCoords, ...rightCoords.reverse()];
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
