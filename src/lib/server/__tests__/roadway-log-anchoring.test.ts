import { describe, expect, it } from 'vitest';
import {
	assessRoadwayLogAnchoring,
	orientWaypointsForAnchors,
	projectLengthFromRoadwayLog,
	routeDirectionFromAnchors
} from '../roadway-log-anchoring.js';

const oneMileEvent = {
	milepost: 1,
	station: 52.8,
	event_type: 'project_end',
	is_reference: false
};

describe('roadway-log anchoring', () => {
	it('derives project length from the project-end milepost', () => {
		expect(projectLengthFromRoadwayLog([oneMileEvent])).toBe(5280);
	});

	it('keeps route direction when start is before end', () => {
		const route = [
			{ lat: 30, lng: -83 },
			{ lat: 30.01, lng: -83.01 }
		];
		expect(routeDirectionFromAnchors(0, 52.8)).toBe('forward');
		expect(orientWaypointsForAnchors(route, 0, 52.8)).toEqual(route);
	});

	it('reverses route direction when start is after end', () => {
		const route = [
			{ lat: 30, lng: -83 },
			{ lat: 30.01, lng: -83.01 }
		];
		expect(routeDirectionFromAnchors(20, 10)).toBe('reverse');
		expect(orientWaypointsForAnchors(route, 20, 10)).toEqual([route[1], route[0]]);
	});

	it('requires review instead of anchoring events when route geometry is unresolved', () => {
		const assessment = assessRoadwayLogAnchoring({
			waypoints: [],
			events: [oneMileEvent],
			totalLengthFt: 5280,
			routeSource: 'gdot_route'
		});
		expect(assessment.anchored).toBe(false);
		expect(assessment.reason).toBe('missing-route');
	});

	it('requires trimming when a candidate route is far longer than the project log', () => {
		const assessment = assessRoadwayLogAnchoring({
			waypoints: [
				{ lat: 30, lng: -83 },
				{ lat: 31, lng: -83 }
			],
			events: [oneMileEvent],
			totalLengthFt: 5280,
			routeSource: 'gdot_route'
		});
		expect(assessment.anchored).toBe(false);
		expect(assessment.reason).toBe('route-needs-trimming');
	});

	it('anchors LRS-trimmed routes when log events exist', () => {
		const assessment = assessRoadwayLogAnchoring({
			waypoints: [
				{ lat: 30.61758, lng: -83.02355 },
				{ lat: 30.69738, lng: -83.02775 }
			],
			events: [oneMileEvent],
			totalLengthFt: 5280,
			routeSource: 'gdot_lrs'
		});
		expect(assessment.anchored).toBe(true);
	});
});
