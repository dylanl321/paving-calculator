import { describe, expect, it } from 'vitest';
import {
	calibrationToRouteMeasure,
	measureRangeToLine,
	measureToPoint,
	pointToMeasure,
	routeDesignationToRouteCode,
	type LrsRoute
} from '../dot/lrs-route.js';

function sampleRoute(): LrsRoute {
	return {
		measures: [0, 1, 2, 3],
		coordinates: [
			[-83.1, 30.6],
			[-83.09, 30.61],
			[-83.08, 30.62],
			[-83.07, 30.63]
		],
		routeId: 'test',
		meta: {}
	};
}

describe('lrs-route', () => {
	it('converts SR designation to GDOT route code', () => {
		expect(routeDesignationToRouteCode('SR 11')).toBe('00001100');
		expect(routeDesignationToRouteCode('I-85')).toBe('00008500');
	});

	it('interpolates measure to point along the route', () => {
		const route = sampleRoute();
		const pt = measureToPoint(route, 1.5);
		expect(pt).not.toBeNull();
		expect(pt![0]).toBeCloseTo(-83.085, 3);
		expect(pt![1]).toBeCloseTo(30.615, 3);
	});

	it('returns line between two measures', () => {
		const route = sampleRoute();
		const line = measureRangeToLine(route, 0.5, 2.5);
		expect(line.length).toBeGreaterThanOrEqual(3);
		expect(line[0][0]).toBeCloseTo(-83.095, 3);
		expect(line[line.length - 1][0]).toBeCloseTo(-83.075, 3);
	});

	it('reverse-projects a point to measure', () => {
		const route = sampleRoute();
		const { measure } = pointToMeasure(route, -83.09, 30.61);
		expect(measure).toBeCloseTo(1, 1);
	});

	it('applies calibration offset to project miles', () => {
		expect(calibrationToRouteMeasure({ scale: 1, offset: 0.5 }, 2)).toBe(2.5);
	});
});
