import { describe, expect, it } from 'vitest';
import {
	applyProjectTrim,
	projectMilepostsFromEvents,
	trimRouteToProjectSpan,
	type RouteSourceDetail
} from '../plan-route-resolver.js';
import type { LrsRoute, RouteCalibration } from '../dot/lrs-route.js';

const lrsRoute: LrsRoute = {
	measures: [0, 1, 2, 3, 4, 5, 6],
	coordinates: [
		[-83.1, 30.6],
		[-83.09, 30.61],
		[-83.08, 30.62],
		[-83.07, 30.63],
		[-83.06, 30.64],
		[-83.05, 30.65],
		[-83.04, 30.66]
	],
	routeId: '00001100/INC/C000',
	meta: { ROUTE_CODE: '00001100', COUNTY: '000' }
};

const calibration: RouteCalibration = { scale: 1, offset: 0 };

const detail: RouteSourceDetail = {
	crs: 'NAD83 GA-East ftUS (EPSG:2239)',
	midpointLonLat: [-83.07, 30.63],
	routeCode: '00001100',
	county: '000',
	mAtMidpoint: 2.72,
	offcenterM: 7.2,
	midpointResidualMi: 0,
	calibrationOffsetMi: 0
};

describe('plan-route-resolver', () => {
	it('derives project mileposts from log events', () => {
		expect(
			projectMilepostsFromEvents([
				{ milepost: 0, event_type: 'project_start' },
				{ milepost: 5.505, event_type: 'project_end' }
			])
		).toEqual({ startMi: 0, endMi: 5.505 });
	});

	it('trims route to project span at terminus start (offset 0)', () => {
		const trim = trimRouteToProjectSpan(lrsRoute, calibration, 0, 5.505);
		expect(trim.trimmedGeometry.coordinates.length).toBeGreaterThanOrEqual(2);
		expect(trim.trimFromM).toBe(0);
		expect(trim.trimToM).toBeCloseTo(5.505, 3);
	});

	it('applies project trim from parsed events', () => {
		const trimmed = applyProjectTrim(
			{ lrsRoute, calibration, detail },
			[
				{ milepost: 0, event_type: 'project_start' },
				{ milepost: 5.505, event_type: 'project_end' }
			],
			5.505
		);
		expect(trimmed.trimmedWaypoints.length).toBeGreaterThanOrEqual(2);
		expect(trimmed.detail.routeCode).toBe('00001100');
	});
});
