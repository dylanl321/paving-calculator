import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	lineStringCentroid,
	fetchGdotRouteGeometry,
	geocodeAddress,
	fetchCountyBoundary,
	fetchCountyCentroid,
	resolveImportLocation,
	buildImportRoutePreview,
	fetchProjectHubGeometry,
	fetchProjectConstructionStatus
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

	it('reorients a backwards-digitized GPAS polyline using the begin-terminus anchor', async () => {
		// GPAS returns the route digitized NORTH->SOUTH (waypoints[0] = north,
		// high lat). The project's begin terminus is at the SOUTH end. Without
		// geographic reconciliation, station-0 (project_start) would mirror to the
		// north vertex. The begin-terminus geocode (Nominatim) provides the anchor.
		const backwardsGpas = () => ({
			features: [
				{
					attributes: { ROUTE_ID: 'SR13', ROAD_NAME: 'SR 13', COUNTY: 'HALL' },
					geometry: {
						paths: [
							[
								[-83.0, 34.5], // north (digitized first)
								[-83.0, 34.4],
								[-83.0, 34.3] // south
							]
						]
					}
				}
			],
			exceededTransferLimit: false
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				const url = String(input);
				if (url.includes('GDOT_GPAS')) {
					return { ok: true, json: async () => backwardsGpas() };
				}
				if (url.includes('nominatim')) {
					const decoded = decodeURIComponent(url);
					// Begin terminus -> south end (low lat); end terminus -> north.
					// URLSearchParams encodes spaces as '+', so match a single token.
					const isEnd = decoded.includes('NORTH');
					return {
						ok: true,
						json: async () => [{ lat: isEnd ? '34.5' : '34.3', lon: '-83.0' }]
					};
				}
				return { ok: true, json: async () => ({ features: [], result: { addressMatches: [] } }) };
			})
		);

		const preview = await buildImportRoutePreview({
			routeDesignation: 'SR 13',
			county: 'Hall',
			locationDescription: 'resurfacing',
			beginTerminus: 'SOUTH END RD',
			endTerminus: 'NORTH END RD',
			totalLengthFt: null,
			roadwayLogEvents: [
				{ milepost: 0, station: 0, event_type: 'project_start', description: 'BEGIN' }
			]
		});

		expect(preview.source).toBe('gdot_route');
		// waypoints[0] should now be the SOUTH (begin-anchor) vertex, not the north.
		expect(preview.waypoints[0].lat).toBeCloseTo(34.3, 5);
		expect(preview.waypoints[preview.waypoints.length - 1].lat).toBeCloseTo(34.5, 5);
	});

	it('resolves 25185-style LRS route from plan mid-point and trims to project limits', async () => {		const lrsFindRoutesResponse = () => ({
			features: [
				{
					attributes: {
						ROUTE_CODE: '00001100',
						SYSTEM_CODE: '1',
						DIRECTION: 'INC',
						COUNTY: '000',
						FUNCTION_TYPE: 'STATE'
					}
				}
			]
		});

		const lrsRouteGeometryResponse = () => ({
			features: [
				{
					attributes: {
						ROUTE_CODE: '00001100',
						SYSTEM_CODE: '1',
						DIRECTION: 'INC',
						COUNTY: '000',
						FUNCTION_TYPE: 'STATE'
					},
					geometry: {
						paths: [
							[
								[-83.0235451, 30.6175812, 0],
								[-83.0240581, 30.627438, 0.68],
								[-83.02522, 30.6493255, 2.19],
								[-83.027752, 30.6973778, 5.505]
							]
						]
					}
				}
			]
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				const url = String(input);
				if (url.includes('GDOT_ROUTE_NETWORK')) {
					if (url.includes('returnM=true')) {
						return { ok: true, json: async () => lrsRouteGeometryResponse() };
					}
					return { ok: true, json: async () => lrsFindRoutesResponse() };
				}
				return { ok: true, json: async () => ({ features: [], exceededTransferLimit: false }) };
			})
		);

		const preview = await buildImportRoutePreview({
			routeDesignation: 'SR 11',
			county: 'Echols',
			locationDescription: '5.505 MILES OF MILLING',
			totalLengthFt: 5.505 * 5280,
			midpointEasting: 386066.213,
			midpointNorthing: 239963.852,
			grossLengthMi: 5.505,
			countyNumber: '101',
			roadwayLogEvents: [
				{ milepost: 0, station: 0, event_type: 'project_start' },
				{ milepost: 0.68, station: 35.904, event_type: 'side_road' },
				{ milepost: 5.505, station: 290.664, event_type: 'project_end' }
			]
		});

		expect(preview.source).toBe('gdot_lrs');
		expect(preview.events_anchored).toBe(true);
		expect(preview.route_source_detail?.routeCode).toBe('00001100');
		expect(preview.waypoints.length).toBeGreaterThanOrEqual(2);
		expect(preview.projected_log_events?.length).toBe(3);
	});
});

// GDOT Project Hub responses (keyed by PI number). f=json -> attributes + paths.
function projectHubGeometryResponse() {
	return {
		features: [
			{
				attributes: {
					PROJECT_ID: 'M006412',
					PROJECT_NAME: 'SR 7 ALT FROM MAGNOLIA STREET TO SMITHBRIAR DRIVE',
					COUNTIES: 'Lowndes',
					CITIES: 'Valdosta',
					GDOT_DISTRICTS: '4',
					PRIMARY_WORK_TYPE: 'Resurface & Maintenance',
					STATUS: 'Under Construction'
				},
				geometry: {
					paths: [
						[
							[-83.2915, 30.8739],
							[-83.2880, 30.8500],
							[-83.2805, 30.8341]
						]
					]
				}
			}
		],
		exceededTransferLimit: false
	};
}

function hubStatusResponse(contractId = 'B1CBA2502795-0') {
	return {
		features: [
			{
				attributes: {
					PROJ_ID: 'M006412',
					CONTRACTOR_NAME: 'REAMES AND SON CONSTRUCTI',
					CONTRACT_ID: contractId,
					AWARD_DATE: Date.parse('2026-01-02T00:00:00Z'),
					CURR_COMPLETION_DATE: Date.parse('2026-11-30T00:00:00Z'),
					CONSTRUTION_STATUS_DERIVED: 'UNDER CONSTRUCTION'
				}
			}
		],
		exceededTransferLimit: false
	};
}

describe('fetchProjectHubGeometry', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('returns null for empty input', async () => {
		expect(await fetchProjectHubGeometry(null)).toBe(null);
		expect(await fetchProjectHubGeometry('  ')).toBe(null);
	});

	it('returns the route LineString + parsed metadata for a PI number', async () => {
		mockFetchOnce(() => projectHubGeometryResponse());
		const res = await fetchProjectHubGeometry('M006412');
		expect(res).not.toBe(null);
		expect(res?.geometry.type).toBe('LineString');
		expect(res?.geometry.coordinates.length).toBe(3);
		expect(res?.info.projectName).toContain('SR 7 ALT');
		expect(res?.info.counties).toBe('Lowndes');
		expect(res?.info.city).toBe('Valdosta');
		expect(res?.info.gdotDistrict).toBe('4');
		expect(res?.info.workType).toBe('Resurface & Maintenance');
	});

	it('returns null when the project has no usable geometry', async () => {
		mockFetchOnce(() => ({ features: [], exceededTransferLimit: false }));
		expect(await fetchProjectHubGeometry('M000000')).toBe(null);
	});

	it('returns null (not throw) on a service error', async () => {
		mockFetchOnce(() => {
			throw new Error('network down');
		});
		expect(await fetchProjectHubGeometry('M006412')).toBe(null);
	});
});

describe('fetchProjectConstructionStatus', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('parses contractor/contract_id and ISO dates', async () => {
		mockFetchOnce(() => hubStatusResponse());
		const res = await fetchProjectConstructionStatus('M006412');
		expect(res?.contractId).toBe('B1CBA2502795-0');
		expect(res?.contractor).toBe('REAMES AND SON CONSTRUCTI');
		expect(res?.awardDate).toBe('2026-01-02');
		expect(res?.completionDate).toBe('2026-11-30');
		expect(res?.status).toBe('UNDER CONSTRUCTION');
	});

	it('returns null when there is no status record', async () => {
		mockFetchOnce(() => ({ features: [], exceededTransferLimit: false }));
		expect(await fetchProjectConstructionStatus('M000000')).toBe(null);
	});
});

describe('resolveImportLocation with a PI number (Project Hub first)', () => {
	afterEach(() => vi.unstubAllGlobals());

	// Mock that distinguishes the Project Hub layers from the rest of the chain.
	function stubProjectHub(opts: { geometry?: boolean; status?: boolean } = {}) {
		const { geometry = true, status = true } = opts;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				const url = String(input);
				if (url.includes('Project_Hub')) {
					return {
						ok: true,
						json: async () =>
							geometry ? projectHubGeometryResponse() : { features: [], exceededTransferLimit: false }
					};
				}
				if (url.includes('Hub_Project_Search')) {
					return {
						ok: true,
						json: async () =>
							status ? hubStatusResponse() : { features: [], exceededTransferLimit: false }
					};
				}
				// Any other source (LRS/GPAS/census) returns nothing.
				return { ok: true, json: async () => ({ features: [], result: { addressMatches: [] } }) };
			})
		);
	}

	it('short-circuits to gdot_project_hub and never queries GPAS/LRS', async () => {
		const fn = vi.fn(async (input: unknown): Promise<FetchResponse> => {
			const url = String(input);
			if (url.includes('Project_Hub')) {
				return { ok: true, json: async () => projectHubGeometryResponse() };
			}
			if (url.includes('Hub_Project_Search')) {
				return { ok: true, json: async () => hubStatusResponse() };
			}
			return { ok: true, json: async () => ({ features: [], result: { addressMatches: [] } }) };
		});
		vi.stubGlobal('fetch', fn);

		const res = await resolveImportLocation({
			routeDesignation: 'SR 7 ALT',
			county: 'Lowndes',
			locationDescription: 'resurfacing',
			midpointEasting: 2572138.063,
			midpointNorthing: 311698.517,
			projectId: 'M006412'
		});

		expect(res.source).toBe('gdot_project_hub');
		expect(res.locationPrecision).toBe('route');
		expect(res.routeGeometry?.coordinates.length).toBe(3);
		expect(res.projectHub?.contractId).toBe('B1CBA2502795-0');
		expect(res.projectHub?.counties).toBe('Lowndes');
		expect(res.projectHub?.awardDate).toBe('2026-01-02');
		// The flaky GPAS route layer / LRS network must NOT have been queried.
		const calledUrls = fn.mock.calls.map((c) => String(c[0]));
		expect(calledUrls.some((u) => u.includes('GDOT_GPAS'))).toBe(false);
		expect(calledUrls.some((u) => u.includes('GDOT_ROUTE_NETWORK'))).toBe(false);
	});

	it('still resolves geometry when the status layer is empty', async () => {
		stubProjectHub({ geometry: true, status: false });
		const res = await resolveImportLocation({
			routeDesignation: null,
			county: 'Lowndes',
			locationDescription: null,
			projectId: 'M006412'
		});
		expect(res.source).toBe('gdot_project_hub');
		expect(res.projectHub?.projectName).toContain('SR 7 ALT');
		expect(res.projectHub?.contractId ?? null).toBe(null);
	});

	it('falls through to the existing chain when the Project Hub has no geometry', async () => {
		// Project Hub empty; GPAS route layer returns a line -> source gdot_route.
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: unknown): Promise<FetchResponse> => {
				const url = String(input);
				if (url.includes('Project_Hub') || url.includes('Hub_Project_Search')) {
					return { ok: true, json: async () => ({ features: [], exceededTransferLimit: false }) };
				}
				if (url.includes('GDOT_GPAS')) {
					return { ok: true, json: async () => arcgisLineResponse() };
				}
				return { ok: true, json: async () => ({ features: [], result: { addressMatches: [] } }) };
			})
		);
		const res = await resolveImportLocation({
			routeDesignation: 'SR 13',
			county: 'Hall',
			locationDescription: 'resurfacing',
			projectId: 'M000000'
		});
		expect(res.source).toBe('gdot_route');
		expect(res.routeGeometry).not.toBe(null);
	});

	it('does not query the Project Hub when no PI number is given', async () => {
		const fn = mockFetchOnce(() => arcgisLineResponse());
		await resolveImportLocation({
			routeDesignation: 'SR 13',
			county: 'Hall',
			locationDescription: 'resurfacing'
		});
		const calledUrls = fn.mock.calls.map((c) => String(c[0]));
		expect(calledUrls.some((u) => u.includes('Project_Hub'))).toBe(false);
	});
});
