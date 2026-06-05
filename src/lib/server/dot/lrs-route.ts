/**
 * GDOT statewide LRS route network (MapServer/0) with M-value linear referencing.
 * M is the county log-mile — always fetch one county + direction at a time.
 */

import type { GeoJsonLineString } from '$lib/types/dot';

export const GDOT_LRS_LAYER =
	'https://rnhp.dot.ga.gov/hosting/rest/services/GDOT_ROUTE_NETWORK/MapServer/0';

const USER_AGENT = 'PaveRate/1.0';

export interface LrsRouteMeta {
	COUNTY?: string;
	SYSTEM_CODE?: string;
	ROUTE_CODE?: string;
	DIRECTION?: string;
	FUNCTION_TYPE?: string;
}

export interface LrsRoute {
	measures: number[];
	/** (lon, lat) per vertex, WGS84 */
	coordinates: Array<[number, number]>;
	routeId: string;
	meta: LrsRouteMeta;
}

export interface LrsRouteCandidate {
	ROUTE_CODE: string;
	SYSTEM_CODE?: string;
	DIRECTION?: string;
	COUNTY?: string;
	FUNCTION_TYPE?: string;
}

export interface RouteCalibration {
	scale: number;
	offset: number;
}

export function calibrationToRouteMeasure(cal: RouteCalibration, projectMile: number): number {
	return cal.scale * projectMile + cal.offset;
}

async function httpJson(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
	const full = `${url}?${new URLSearchParams(params).toString()}`;
	const res = await fetch(full, {
		headers: { 'User-Agent': USER_AGENT },
		signal: AbortSignal.timeout(90_000)
	});
	if (!res.ok) throw new Error(`GDOT LRS HTTP ${res.status}`);
	return (await res.json()) as Record<string, unknown>;
}

function haversineM(a: [number, number], b: [number, number]): number {
	const R = 6_371_000;
	const [lon1, lat1, lon2, lat2] = [a[0], a[1], b[0], b[1]].map((d) => (d * Math.PI) / 180);
	const dlon = lon2 - lon1;
	const dlat = lat2 - lat1;
	const h =
		Math.sin(dlat / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

interface EsriFeature {
	attributes?: Record<string, unknown>;
	geometry?: { paths?: number[][][] };
}

function mergePathsToRoute(features: EsriFeature[], routeId: string, meta: LrsRouteMeta): LrsRoute {
	const verts: Array<[number, number, number]> = [];
	for (const f of features) {
		for (const path of f.geometry?.paths ?? []) {
			for (const v of path) {
				if (v.length < 3 || v[2] == null) continue;
				verts.push([v[2], v[0], v[1]]);
			}
		}
	}
	if (verts.length === 0) {
		throw new Error('No M-aware vertices returned for that route.');
	}
	verts.sort((a, b) => a[0] - b[0]);

	const measures: number[] = [];
	const coordinates: Array<[number, number]> = [];
	let lastM: number | null = null;
	for (const [m, lon, lat] of verts) {
		if (lastM != null && Math.abs(m - lastM) < 1e-9) continue;
		measures.push(m);
		coordinates.push([lon, lat]);
		lastM = m;
	}

	for (let i = 1; i < measures.length; i++) {
		const dm = measures[i] - measures[i - 1];
		if (dm < 0.25) {
			const d = haversineM(coordinates[i - 1], coordinates[i]);
			if (d > Math.max(800, dm * 1609.34 * 4)) {
				console.warn(
					`[lrs-route] possible geometry gap near M ${measures[i].toFixed(3)} (${d.toFixed(0)} m jump over ${dm.toFixed(3)} mi)`
				);
				break;
			}
		}
	}

	return { measures, coordinates, routeId, meta };
}

/** GDOT ROUTE_CODE convention: signed route number × 100, zero-padded 8. */
export function routeDesignationToRouteCode(routeDesignation: string | null): string | null {
	if (!routeDesignation) return null;
	const num = routeDesignation.match(/(\d+[A-Z]?)/)?.[1];
	if (!num || !/^\d/.test(num)) return null;
	return `${parseInt(num, 10) * 100}`.padStart(8, '0');
}

export async function findRoutesNear(
	lon: number,
	lat: number,
	radiusM = 400,
	serviceUrl = GDOT_LRS_LAYER
): Promise<LrsRouteCandidate[]> {
	const params: Record<string, string> = {
		outFields: 'COUNTY,SYSTEM_CODE,ROUTE_CODE,DIRECTION,FUNCTION_TYPE',
		returnGeometry: 'false',
		f: 'json',
		resultRecordCount: '200',
		geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
		geometryType: 'esriGeometryPoint',
		inSR: '4326',
		distance: String(radiusM),
		units: 'esriSRUnit_Meter',
		spatialRel: 'esriSpatialRelIntersects',
		where: '1=1'
	};
	const data = await httpJson(`${serviceUrl}/query`, params);
	const features = (data.features ?? []) as EsriFeature[];
	const out: LrsRouteCandidate[] = [];
	const seen = new Set<string>();
	for (const f of features) {
		const a = f.attributes ?? {};
		const code = String(a.ROUTE_CODE ?? '');
		const dir = String(a.DIRECTION ?? '');
		const key = `${code}/${dir}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({
			ROUTE_CODE: code,
			SYSTEM_CODE: a.SYSTEM_CODE != null ? String(a.SYSTEM_CODE) : undefined,
			DIRECTION: dir || undefined,
			COUNTY: a.COUNTY != null ? String(a.COUNTY) : undefined,
			FUNCTION_TYPE: a.FUNCTION_TYPE != null ? String(a.FUNCTION_TYPE) : undefined
		});
	}
	return out;
}

export async function fetchLrsRoute(
	routeCode: string,
	opts: {
		county?: string | null;
		systemCode?: string | null;
		direction?: string;
		serviceUrl?: string;
	} = {}
): Promise<LrsRoute> {
	const direction = opts.direction ?? 'INC';
	const where = [`ROUTE_CODE='${routeCode.replace(/'/g, "''")}'`, `DIRECTION='${direction}'`];
	if (opts.county) where.push(`COUNTY='${opts.county.replace(/'/g, "''")}'`);
	if (opts.systemCode) where.push(`SYSTEM_CODE='${opts.systemCode.replace(/'/g, "''")}'`);

	const params: Record<string, string> = {
		where: where.join(' AND '),
		outFields: 'COUNTY,SYSTEM_CODE,ROUTE_CODE,DIRECTION,FUNCTION_TYPE',
		returnGeometry: 'true',
		returnM: 'true',
		returnZ: 'false',
		outSR: '4326',
		f: 'json'
	};

	const data = await httpJson(`${opts.serviceUrl ?? GDOT_LRS_LAYER}/query`, params);
	if (data.error) throw new Error(`GDOT LRS error: ${JSON.stringify(data.error)}`);
	const feats = (data.features ?? []) as EsriFeature[];
	if (feats.length === 0) {
		throw new Error(
			`No LRS features for ROUTE_CODE=${routeCode} DIR=${direction} COUNTY=${opts.county ?? 'any'}`
		);
	}
	const attrs = feats[0].attributes ?? {};
	const meta: LrsRouteMeta = {
		COUNTY: attrs.COUNTY != null ? String(attrs.COUNTY) : undefined,
		SYSTEM_CODE: attrs.SYSTEM_CODE != null ? String(attrs.SYSTEM_CODE) : undefined,
		ROUTE_CODE: attrs.ROUTE_CODE != null ? String(attrs.ROUTE_CODE) : undefined,
		DIRECTION: attrs.DIRECTION != null ? String(attrs.DIRECTION) : undefined,
		FUNCTION_TYPE: attrs.FUNCTION_TYPE != null ? String(attrs.FUNCTION_TYPE) : undefined
	};
	const rid = `${routeCode}/${direction}${opts.county ? `/C${opts.county}` : ''}`;
	return mergePathsToRoute(feats, rid, meta);
}

export function measureToPoint(route: LrsRoute, m: number): [number, number] | null {
	const { measures, coordinates } = route;
	if (measures.length === 0) return null;
	if (m < measures[0] - 1e-9 || m > measures[measures.length - 1] + 1e-9) return null;

	let lo = 0;
	let hi = measures.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (measures[mid] < m) lo = mid + 1;
		else hi = mid;
	}
	const j = lo;
	if (j <= 0) return coordinates[0];
	if (j >= measures.length) return coordinates[coordinates.length - 1];
	const m0 = measures[j - 1];
	const m1 = measures[j];
	const [x0, y0] = coordinates[j - 1];
	const [x1, y1] = coordinates[j];
	if (m1 === m0) return [x0, y0];
	const t = (m - m0) / (m1 - m0);
	return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)];
}

export function measureRangeToLine(
	route: LrsRoute,
	m0: number,
	m1: number
): Array<[number, number]> {
	let lo = m0;
	let hi = m1;
	if (hi < lo) [lo, hi] = [hi, lo];
	const pts: Array<[number, number]> = [];
	const p0 = measureToPoint(route, lo);
	if (p0) pts.push(p0);
	for (let i = 0; i < route.measures.length; i++) {
		const m = route.measures[i];
		if (m > lo && m < hi) pts.push(route.coordinates[i]);
	}
	const p1 = measureToPoint(route, hi);
	if (p1) pts.push(p1);
	const cleaned: Array<[number, number]> = [];
	for (const p of pts) {
		const last = cleaned[cleaned.length - 1];
		if (!last || Math.abs(p[0] - last[0]) > 1e-12 || Math.abs(p[1] - last[1]) > 1e-12) {
			cleaned.push(p);
		}
	}
	return cleaned;
}

export function pointToMeasure(
	route: LrsRoute,
	lon: number,
	lat: number
): { measure: number; distanceM: number } {
	let bestM = route.measures[0];
	let bestD = Infinity;
	const clat = Math.cos((lat * Math.PI) / 180);
	for (let i = 0; i < route.measures.length - 1; i++) {
		const [aLon, aLat] = route.coordinates[i];
		const [bLon, bLat] = route.coordinates[i + 1];
		const ax = (aLon - lon) * clat;
		const ay = aLat - lat;
		const bx = (bLon - lon) * clat;
		const by = bLat - lat;
		const dx = bx - ax;
		const dy = by - ay;
		const seg2 = dx * dx + dy * dy;
		const t = seg2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / seg2));
		const d = Math.hypot(ax + t * dx, ay + t * dy);
		if (d < bestD) {
			bestD = d;
			bestM =
				route.measures[i] + t * (route.measures[i + 1] - route.measures[i]);
		}
	}
	const p = measureToPoint(route, bestM) ?? [lon, lat];
	return { measure: bestM, distanceM: haversineM(p, [lon, lat]) };
}

export function lrsRouteToGeoJson(route: LrsRoute): GeoJsonLineString {
	return {
		type: 'LineString',
		coordinates: route.coordinates.map(([lon, lat]) => [lon, lat] as [number, number])
	};
}

export function lrsLineToWaypoints(line: Array<[number, number]>): Array<{ lat: number; lng: number }> {
	return line.map(([lng, lat]) => ({ lat, lng }));
}
