import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	lineStringCentroid,
	fetchGdotRouteGeometry,
	geocodeAddress,
	resolveImportLocation
} from '../gdot-geometry.js';

type FetchResponse = { ok: boolean; json: () => Promise<unknown> };

function mockFetchOnce(map: (url: string) => unknown, ok = true) {
	const fn = vi.fn(async (input: unknown): Promise<FetchResponse> => {
		const url = String(input);
		return { ok, json: async () => map(url) };
	});
	vi.stubGlobal('fetch', fn);
	return fn;
}

// ArcGIS GPAS response with one polyline feature.
function arcgisLineResponse() {
	return {
		features: [
			{
				attributes: { ROUTE_ID: 'SR13', ROAD_NAME: 'SR 13', COUNTY: 'HALL' },
				geometry: {
					paths: [
						[
							[-83.9, 34.3],
							[-83.8, 34.4],
							[-83.7, 34.5]
						]
					]
				}
			}
		],
		exceededTransferLimit: false
	};
}

describe('lineStringCentroid', () => {
	it('returns the middle vertex as [lat, lng]', () => {
		const c = lineStringCentroid({
			type: 'LineString',
			coordinates: [
				[-84.0, 33.0],
				[-83.5, 33.5],
				[-83.0, 34.0]
			]
		});
		// middle vertex is index 1 = [-83.5, 33.5] -> [lat, lng] = [33.5, -83.5]
		expect(c).toEqual([33.5, -83.5]);
	});

	it('returns null for an empty line', () => {
		expect(lineStringCentroid({ type: 'LineString', coordinates: [] })).toBe(null);
	});
});

describe('fetchGdotRouteGeometry', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns null when no route designation is given', async () => {
		const res = await fetchGdotRouteGeometry(null, 'Hall');
		expect(res).toBe(null);
	});

	it('returns null when the designation has no number', async () => {
		const res = await fetchGdotRouteGeometry('STATE ROUTE', 'Hall');
		expect(res).toBe(null);
	});

	it('returns the longest matching LineString from ArcGIS', async () => {
		mockFetchOnce(() => arcgisLineResponse());
		const res = await fetchGdotRouteGeometry('SR 13', 'Hall');
		expect(res).not.toBe(null);
		expect(res?.type).toBe('LineString');
		expect(res?.coordinates.length).toBe(3);
	});

	it('returns null when ArcGIS returns no usable geometry', async () => {
		mockFetchOnce(() => ({ features: [], exceededTransferLimit: false }));
		const res = await fetchGdotRouteGeometry('SR 999', 'Nowhere');
		expect(res).toBe(null);
	});

	it('returns null (not throw) when the service errors', async () => {
		mockFetchOnce(() => {
			throw new Error('network down');
		});
		const res = await fetchGdotRouteGeometry('SR 13', 'Hall');
		expect(res).toBe(null);
	});
});

describe('geocodeAddress', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns null for empty input', async () => {
		expect(await geocodeAddress(null)).toBe(null);
		expect(await geocodeAddress('   ')).toBe(null);
	});

	it('parses Census coordinates as [lat, lng] (x=lng, y=lat)', async () => {
		mockFetchOnce(() => ({
			result: { addressMatches: [{ coordinates: { x: -84.39, y: 33.75 } }] }
		}));
		const res = await geocodeAddress('Fulton County, GA');
		expect(res).toEqual([33.75, -84.39]);
	});

	it('returns null when there are no matches', async () => {
		mockFetchOnce(() => ({ result: { addressMatches: [] } }));
		expect(await geocodeAddress('nowhere at all')).toBe(null);
	});

	it('returns null on a non-ok response', async () => {
		mockFetchOnce(() => ({}), false);
		expect(await geocodeAddress('Fulton County, GA')).toBe(null);
	});
});

describe('resolveImportLocation', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('prefers GDOT route geometry and reports source gdot_route', async () => {
		mockFetchOnce(() => arcgisLineResponse());
		const res = await resolveImportLocation({
			routeDesignation: 'SR 13',
			county: 'Hall',
			locationDescription: '2 miles of resurfacing'
		});
		expect(res.source).toBe('gdot_route');
		expect(res.routeGeometry).not.toBe(null);
		// centroid of the 3-point line, middle vertex [-83.8, 34.4] -> [34.4, -83.8]
		expect(res.latitude).toBeCloseTo(34.4, 5);
		expect(res.longitude).toBeCloseTo(-83.8, 5);
	});

	it('falls back to geocoding when no route geometry is found', async () => {
		// First call (ArcGIS) returns no features; second call (Census) returns a match.
		let call = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				call++;
				const url = String(input);
				if (url.includes('census')) {
					return {
						ok: true,
						json: async () => ({
							result: { addressMatches: [{ coordinates: { x: -83.62, y: 34.3 } }] }
						})
					};
				}
				return { ok: true, json: async () => ({ features: [], exceededTransferLimit: false }) };
			})
		);
		const res = await resolveImportLocation({
			routeDesignation: 'SR 999',
			county: 'Hall',
			locationDescription: 'somewhere'
		});
		expect(res.source).toBe('geocode');
		expect(res.routeGeometry).toBe(null);
		expect(res.latitude).toBeCloseTo(34.3, 5);
		expect(res.longitude).toBeCloseTo(-83.62, 5);
		expect(call).toBeGreaterThanOrEqual(2);
	});

	it('returns all-null with source none when nothing resolves', async () => {
		mockFetchOnce(() => ({ features: [], result: { addressMatches: [] } }));
		const res = await resolveImportLocation({
			routeDesignation: null,
			county: null,
			locationDescription: null
		});
		expect(res.source).toBe('none');
		expect(res.latitude).toBe(null);
		expect(res.longitude).toBe(null);
		expect(res.routeGeometry).toBe(null);
	});
});
