import { describe, it, expect } from 'vitest';
import { detectStation, formatStation } from '../gpsStation.js';
import {
	haversineMeters,
	haversineFeet,
	metersToFeet,
	stationToFeet,
	feetToStation,
	coordinatesToBounds,
	stationToCoordinate,
	feetToCoordinate,
	geoJsonToD1,
	d1ToGeoJson
} from '../mapUtils.js';

// A straight ~north-south route: two points 0.01 deg of latitude apart
// (~1.11 km). Used to validate station projection against the route.
const ROUTE = [
	{ lat: 34.0, lng: -84.0 },
	{ lat: 34.01, lng: -84.0 }
];

describe('mapUtils — config-backed conversions (no magic numbers)', () => {
	it('metersToFeet uses the configured FT_PER_M (3.28084)', () => {
		expect(metersToFeet(1)).toBeCloseTo(3.28084, 5);
		expect(metersToFeet(100)).toBeCloseTo(328.084, 3);
	});

	it('stationToFeet / feetToStation use FT_PER_STATION (100)', () => {
		expect(stationToFeet(1.5)).toBe(150);
		expect(feetToStation(150)).toBe(1.5);
		expect(feetToStation(stationToFeet(12.5))).toBe(12.5);
	});

	it('haversineMeters returns ~0 for identical points', () => {
		expect(haversineMeters(34, -84, 34, -84)).toBeCloseTo(0, 6);
	});

	it('haversineFeet is haversineMeters * FT_PER_M', () => {
		const m = haversineMeters(34.0, -84.0, 34.01, -84.0);
		expect(haversineFeet(34.0, -84.0, 34.01, -84.0)).toBeCloseTo(metersToFeet(m), 4);
	});

	it('haversineMeters ~1.11 km for 0.01 deg of latitude', () => {
		const m = haversineMeters(34.0, -84.0, 34.01, -84.0);
		expect(m).toBeGreaterThan(1100);
		expect(m).toBeLessThan(1115);
	});
});

describe('mapUtils — coordinatesToBounds', () => {
	it('computes [[minLat,minLng],[maxLat,maxLng]]', () => {
		const bounds = coordinatesToBounds([
			[34.0, -84.5],
			[34.2, -84.1],
			[33.9, -84.3]
		]);
		expect(bounds).toEqual([
			[33.9, -84.5],
			[34.2, -84.1]
		]);
	});

	it('returns a zero box for empty input', () => {
		expect(coordinatesToBounds([])).toEqual([
			[0, 0],
			[0, 0]
		]);
	});
});

describe('mapUtils — station <-> coordinate projection', () => {
	it('stationToCoordinate returns the start at station 0', () => {
		expect(stationToCoordinate(0, ROUTE)).toEqual([34.0, -84.0]);
	});

	it('stationToCoordinate returns null for < 2 waypoints', () => {
		expect(stationToCoordinate(1, [{ lat: 34, lng: -84 }])).toBe(null);
	});

	it('feetToCoordinate midway lands between the endpoints', () => {
		const totalFt = haversineFeet(34.0, -84.0, 34.01, -84.0);
		const mid = feetToCoordinate(totalFt / 2, ROUTE);
		expect(mid).not.toBe(null);
		// Latitude should be ~halfway (34.005)
		expect((mid as [number, number])[0]).toBeCloseTo(34.005, 3);
	});
});

describe('mapUtils — geoJson D1 round-trip', () => {
	it('geoJsonToD1 then d1ToGeoJson preserves the object', () => {
		const geo = { type: 'LineString', coordinates: [[-84, 34], [-83.9, 34.1]] };
		const text = geoJsonToD1(geo);
		expect(typeof text).toBe('string');
		expect(d1ToGeoJson(text)).toEqual(geo);
	});

	it('d1ToGeoJson returns null on malformed JSON', () => {
		expect(d1ToGeoJson('{not valid')).toBe(null);
	});
});

describe('gpsStation — formatStation', () => {
	it('formats station 12.5 as "12+50"', () => {
		expect(formatStation(12.5)).toBe('12+50');
	});

	it('zero-pads the minor part', () => {
		expect(formatStation(3.05)).toBe('3+05');
		expect(formatStation(0)).toBe('0+00');
	});
});

describe('gpsStation — detectStation', () => {
	it('returns null for a route with fewer than 2 waypoints', () => {
		expect(detectStation(34, -84, [{ lat: 34, lng: -84 }])).toBe(null);
	});

	it('projects a point near the route start to ~station 0', () => {
		const res = detectStation(34.0, -84.0, ROUTE);
		expect(res).not.toBe(null);
		expect((res as { station: number }).station).toBeCloseTo(0, 2);
	});

	it('projects a point near the route end to the full length in stations', () => {
		const res = detectStation(34.01, -84.0, ROUTE);
		expect(res).not.toBe(null);
		const expectedStations = haversineFeet(34.0, -84.0, 34.01, -84.0) / 100;
		expect((res as { station: number }).station).toBeCloseTo(expectedStations, 1);
	});

	it('reports a perpendicular offset for an off-route point', () => {
		// A point offset to the east of the route mid-point.
		const res = detectStation(34.005, -83.999, ROUTE);
		expect(res).not.toBe(null);
		expect((res as { offsetFt: number }).offsetFt).toBeGreaterThan(0);
	});
});
