/**
 * Resolve GDOT LRS route + calibration from plan-sheet metadata (mid-point,
 * route number, gross length). Port of test.py resolve_route_from_plan().
 */

import { GA_CRS_CANDIDATES, isInGeorgia, reprojectMidpoint } from './ga-state-plane.js';
import {
	calibrationToRouteMeasure,
	fetchLrsRoute,
	findRoutesNear,
	lrsLineToWaypoints,
	lrsRouteToGeoJson,
	measureRangeToLine,
	pointToMeasure,
	routeDesignationToRouteCode,
	type LrsRoute,
	type RouteCalibration
} from './dot/lrs-route.js';
import type { GeoJsonLineString } from '$lib/types/dot';

export interface PlanRouteInput {
	routeDesignation: string | null;
	midpointEasting: number | null;
	midpointNorthing: number | null;
	midpointZoneLabel?: string | null;
	grossLengthMi?: number | null;
	countyNumber?: string | null;
}

export interface RouteSourceDetail {
	crs: string;
	midpointLonLat: [number, number];
	routeCode: string;
	systemCode?: string;
	county?: string;
	direction?: string;
	mAtMidpoint: number;
	offcenterM: number;
	midpointResidualMi: number;
	calibrationOffsetMi: number;
}

export interface ResolvedPlanRoute {
	lrsRoute: LrsRoute;
	calibration: RouteCalibration;
	trimmedGeometry: GeoJsonLineString;
	trimmedWaypoints: Array<{ lat: number; lng: number }>;
	detail: RouteSourceDetail;
	trimFromM: number;
	trimToM: number;
}

const MID_TOL_MI = 0.1;

export async function resolveRouteFromPlan(input: PlanRouteInput): Promise<ResolvedPlanRoute | null> {
	if (input.midpointEasting == null || input.midpointNorthing == null) return null;
	if (!input.routeDesignation) return null;

	const expected = routeDesignationToRouteCode(input.routeDesignation);
	if (!expected) return null;

	let best: {
		label: string;
		epsg: number;
		lon: number;
		lat: number;
		match: Awaited<ReturnType<typeof findRoutesNear>>[number];
	} | null = null;

	for (const { label, epsg } of GA_CRS_CANDIDATES) {
		let lon: number;
		let lat: number;
		try {
			[lon, lat] = reprojectMidpoint(input.midpointEasting, input.midpointNorthing, epsg);
		} catch {
			continue;
		}
		if (!isInGeorgia(lon, lat)) continue;

		let cands: Awaited<ReturnType<typeof findRoutesNear>>;
		try {
			cands = await findRoutesNear(lon, lat, 200);
		} catch {
			continue;
		}

		const match = cands.find((c) => c.ROUTE_CODE === expected);
		if (match) {
			best = { label, epsg, lon, lat, match };
			break;
		}
	}

	if (!best) return null;

	const { label, epsg, lon, lat, match } = best;
	const lrsRoute = await fetchLrsRoute(match.ROUTE_CODE, {
		county: match.COUNTY ?? input.countyNumber,
		systemCode: match.SYSTEM_CODE,
		direction: match.DIRECTION ?? 'INC'
	});

	const { measure: mMid, distanceM: dist } = pointToMeasure(lrsRoute, lon, lat);

	let rawOffset = 0;
	let residual = mMid;
	if (input.grossLengthMi != null && input.grossLengthMi > 0) {
		rawOffset = mMid - input.grossLengthMi / 2;
		residual = rawOffset;
	}
	const offset = Math.abs(rawOffset) <= MID_TOL_MI ? 0 : rawOffset;
	const calibration: RouteCalibration = { scale: 1, offset };

	const detail: RouteSourceDetail = {
		crs: `${label} (EPSG:${epsg})`,
		midpointLonLat: [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6],
		routeCode: match.ROUTE_CODE,
		systemCode: match.SYSTEM_CODE,
		county: match.COUNTY,
		direction: match.DIRECTION,
		mAtMidpoint: Math.round(mMid * 1e4) / 1e4,
		offcenterM: Math.round(dist * 10) / 10,
		midpointResidualMi: Math.round(residual * 1e4) / 1e4,
		calibrationOffsetMi: Math.round(calibration.offset * 1e4) / 1e4
	};

	return { lrsRoute, calibration, detail };
}

export function applyProjectTrim(
	base: { lrsRoute: LrsRoute; calibration: RouteCalibration; detail: RouteSourceDetail },
	events: Array<{ milepost: number; event_type?: string }>,
	grossLengthMi?: number | null
): ResolvedPlanRoute {
	const { startMi, endMi } = projectMilepostsFromEvents(events);
	const endProjectMi = endMi ?? grossLengthMi ?? null;
	const trim = trimRouteToProjectSpan(base.lrsRoute, base.calibration, startMi, endProjectMi);
	return { ...base, ...trim };
}

export async function resolveRouteFromPlanWithEvents(
	input: PlanRouteInput,
	events: Array<{ milepost: number; event_type?: string }>
): Promise<ResolvedPlanRoute | null> {
	const base = await resolveRouteFromPlan(input);
	if (!base) return null;
	return applyProjectTrim(base, events, input.grossLengthMi);
}

/** Trim LRS centerline to project mileposts (with calibration). */
export function trimRouteToProjectSpan(
	lrsRoute: LrsRoute,
	calibration: RouteCalibration,
	startProjectMi: number,
	endProjectMi: number | null | undefined
): {
	trimmedGeometry: GeoJsonLineString;
	trimmedWaypoints: Array<{ lat: number; lng: number }>;
	trimFromM: number;
	trimToM: number;
} {
	const trimFromM = calibrationToRouteMeasure(calibration, startProjectMi);
	const endMi =
		endProjectMi != null && endProjectMi > startProjectMi
			? endProjectMi
			: lrsRoute.measures[lrsRoute.measures.length - 1] - calibration.offset;
	const trimToM = calibrationToRouteMeasure(calibration, endMi);
	const line = measureRangeToLine(lrsRoute, trimFromM, trimToM);
	return {
		trimmedGeometry: { type: 'LineString', coordinates: line },
		trimmedWaypoints: lrsLineToWaypoints(line),
		trimFromM,
		trimToM
	};
}

/** Full route geometry (untrimmed) for diagnostics. */
export function fullLrsGeoJson(lrsRoute: LrsRoute): GeoJsonLineString {
	return lrsRouteToGeoJson(lrsRoute);
}

export function projectMilepostsFromEvents(
	events: Array<{ milepost: number; event_type?: string }>
): { startMi: number; endMi: number | null } {
	const sorted = [...events].sort((a, b) => a.milepost - b.milepost);
	const start = sorted.find((e) => e.event_type === 'project_start');
	const end = sorted.find((e) => e.event_type === 'project_end');
	return {
		startMi: start?.milepost ?? sorted[0]?.milepost ?? 0,
		endMi: end?.milepost ?? null
	};
}
