import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	lineStringCentroid,
	fetchGdotRouteGeometry,
	geocodeAddress,
	fetchCountyBoundary,
	fetchCountyCentroid,
	resolveImportLocation,
	buildImportRoutePreview
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

// GDOT county boundary polygon response (rings = [lng, lat]).
function countyPolygonResponse() {
	return {
		features: [
			{
				attributes: { NAME: 'LOWNDES' },
				geometry: {
					rings: [
						[
							[-83.4, 30.7],
							[-83.0, 30.7],
							[-83.0, 31.1],
							[-83.4, 31.1],
							[-83.4, 30.7]
						]
					]
				}
			}
		]
	};
}

describe('fetchCountyCentroid', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns null for empty input', async () => {
		expect(await fetchCountyCentroid(null)).toBe(null);
		expect(await fetchCountyCentroid('   ')).toBe(null);
	});

	it('returns the polygon centroid as [lat, lng] from the GDOT county layer', async () => {
		mockFetchOnce(() => countyPolygonResponse());
		const res = await fetchCountyCentroid('Lowndes');
		expect(res).not.toBe(null);
		// average of ring lng/lat (last point duplicates the first)
		expect(res?.[0]).toBeGreaterThan(30.6);
		expect(res?.[0]).toBeLessThan(31.2);
		expect(res?.[1]).toBeGreaterThan(-83.5);
		expect(res?.[1]).toBeLessThan(-82.9);
	});

	it('strips a "County" suffix before querying', async () => {
		const fn = mockFetchOnce(() => countyPolygonResponse());
		await fetchCountyCentroid('Lowndes County');
		const calledUrl = String(fn.mock.calls[0][0]);
		expect(calledUrl.toUpperCase()).toContain('LOWNDES');
		expect(calledUrl.toUpperCase()).not.toContain('LOWNDES%20COUNTY');
	});

	it('returns null when the service errors', async () => {
		mockFetchOnce(() => {
			throw new Error('network down');
		});
		expect(await fetchCountyCentroid('Lowndes')).toBe(null);
	});
});

describe('fetchCountyBoundary', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns GeoJSON, centroid, and bounds from the GDOT county layer', async () => {
		mockFetchOnce(() => countyPolygonResponse());
		const boundary = await fetchCountyBoundary('Lowndes');
		expect(boundary?.county).toBe('LOWNDES');
		expect(boundary?.geojson.geometry.type).toBe('Polygon');
		expect(boundary?.geojson.geometry.coordinates[0]).toHaveLength(5);
		expect(boundary?.bounds).toEqual([
			[30.7, -83.4],
			[31.1, -83.0]
		]);
		expect(boundary?.centroid.lat).toBeGreaterThan(30.6);
		expect(boundary?.centroid.lng).toBeLessThan(-82.9);
	});

	it('returns null when the county polygon is missing', async () => {
		mockFetchOnce(() => ({ features: [] }));
		expect(await fetchCountyBoundary('Missing')).toBe(null);
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

	it('falls back to the GDOT county centroid when no route and geocode misses', async () => {
		// ArcGIS route layer: no features. Census: no matches. County polygon layer:
		// returns a polygon. Distinguish the two ArcGIS endpoints by URL.
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				const url = String(input);
				if (url.includes('census')) {
					return { ok: true, json: async () => ({ result: { addressMatches: [] } }) };
				}
				if (url.includes('GDOT_Boundaries')) {
					return { ok: true, json: async () => countyPolygonResponse() };
				}
				// GPAS route layer
				return { ok: true, json: async () => ({ features: [], exceededTransferLimit: false }) };
			})
		);
		const res = await resolveImportLocation({
			routeDesignation: null,
			county: 'Lowndes',
			locationDescription: null
		});
		expect(res.source).toBe('county_centroid');
		expect(res.locationPrecision).toBe('county');
		expect(res.countyBoundary?.geojson.geometry.type).toBe('Polygon');
		expect(res.routeGeometry).toBe(null);
		expect(res.latitude).not.toBe(null);
		expect(res.longitude).not.toBe(null);
	});

	it('returns all-null with source none when nothing resolves', async () => {
		mockFetchOnce(() => ({ features: [], result: { addressMatches: [] } }));
		const res = await resolveImportLocation({
			routeDesignation: null,
			county: null,
			locationDescription: null
		});
		expect(res.source).toBe('none');
		expect(res.locationPrecision).toBe('none');
		expect(res.latitude).toBe(null);
		expect(res.longitude).toBe(null);
		expect(res.routeGeometry).toBe(null);
	});
});

describe('buildImportRoutePreview', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('creates a route preview from GDOT geometry', async () => {
		mockFetchOnce(() => arcgisLineResponse());
		const preview = await buildImportRoutePreview({
			routeDesignation: 'SR 13',
			county: 'Hall',
			locationDescription: 'resurfacing',
			totalLengthFt: null,
			roadwayLogEvents: []
		});
		expect(preview.source).toBe('gdot_route');
		expect(preview.location_precision).toBe('route');
		expect(preview.waypoints.length).toBe(3);
	});

	it('falls back to OSM termini routing when GDOT has no geometry', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				const url = String(input);
				if (url.includes('GDOT_GPAS')) {
					return { ok: true, json: async () => ({ features: [], exceededTransferLimit: false }) };
				}
				if (url.includes('nominatim')) {
					const decoded = decodeURIComponent(url);
					const isEnd = decoded.includes('Bay Branch');
					return {
						ok: true,
						json: async () => [{ lat: isEnd ? '30.72' : '30.64', lon: '-83.10' }]
					};
				}
				if (url.includes('router.project-osrm.org')) {
					return {
						ok: true,
						json: async () => ({
							code: 'Ok',
							routes: [
								{
									distance: 9000,
									geometry: { coordinates: [[-83.1, 30.64], [-83.1, 30.72]] }
								}
							]
						})
					};
				}
				return { ok: true, json: async () => ({ result: { addressMatches: [] } }) };
			})
		);

		const preview = await buildImportRoutePreview({
			routeDesignation: 'SR 11',
			county: 'Echols',
			locationDescription: '5.505 miles on SR 11',
			beginTerminus: 'THE FLORIDA STATE LINE',
			endTerminus: 'BAY BRANCH RD',
			totalLengthFt: 5280,
			roadwayLogEvents: [{ milepost: 1, station: 52.8, event_type: 'project_end' }]
		});

		expect(preview.source).toBe('osm_termini_route');
		expect(preview.waypoints.length).toBe(2);
	});

	it('keeps OSM route markers unanchored when route length mismatches the project log', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				const url = String(input);
				if (url.includes('GDOT_GPAS')) {
					return { ok: true, json: async () => ({ features: [], exceededTransferLimit: false }) };
				}
				if (url.includes('nominatim')) {
					const decoded = decodeURIComponent(url);
					const isEnd = decoded.includes('Bay Branch');
					return {
						ok: true,
						json: async () => [{ lat: isEnd ? '31.64' : '30.64', lon: '-83.10' }]
					};
				}
				if (url.includes('router.project-osrm.org')) {
					return {
						ok: true,
						json: async () => ({
							code: 'Ok',
							routes: [
								{
									distance: 160000,
									geometry: { coordinates: [[-83.1, 30.64], [-83.1, 31.64]] }
								}
							]
						})
					};
				}
				return { ok: true, json: async () => ({ result: { addressMatches: [] } }) };
			})
		);

		const preview = await buildImportRoutePreview({
			routeDesignation: 'SR 11',
			county: 'Echols',
			locationDescription: '5.505 miles on SR 11',
			beginTerminus: 'THE FLORIDA STATE LINE',
			endTerminus: 'BAY BRANCH RD',
			totalLengthFt: 5280,
			roadwayLogEvents: [{ milepost: 1, station: 52.8, event_type: 'project_end' }]
		});

		expect(preview.source).toBe('osm_termini_route');
		expect(preview.events_anchored).toBe(false);
		expect(preview.projected_log_events).toEqual([]);
	});

	it('returns no fabricated route when every resolver misses', async () => {
		mockFetchOnce(() => ({ features: [], result: { addressMatches: [] } }));
		const preview = await buildImportRoutePreview({
			routeDesignation: null,
			county: null,
			locationDescription: null
		});
		expect(preview.source).toBe('none');
		expect(preview.latitude).toBe(null);
		expect(preview.longitude).toBe(null);
		expect(preview.waypoints).toEqual([]);
	});

	it('returns county context without anchoring log markers when only county resolves', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				const url = String(input);
				if (url.includes('census')) {
					return { ok: true, json: async () => ({ result: { addressMatches: [] } }) };
				}
				if (url.includes('GDOT_Boundaries')) {
					return { ok: true, json: async () => countyPolygonResponse() };
				}
				return { ok: true, json: async () => ({ features: [], exceededTransferLimit: false }) };
			})
		);

		const preview = await buildImportRoutePreview({
			routeDesignation: null,
			county: 'Lowndes',
			locationDescription: null,
			roadwayLogEvents: [{ milepost: 1, station: 52.8, event_type: 'project_end' }]
		});

		expect(preview.source).toBe('county_centroid');
		expect(preview.location_precision).toBe('county');
		expect(preview.county_boundary_geojson?.geometry.type).toBe('Polygon');
		expect(preview.county_bounds).toEqual([
			[30.7, -83.4],
			[31.1, -83.0]
		]);
		expect(preview.events_anchored).toBe(false);
		expect(preview.projected_log_events).toEqual([]);
	});
});
