import { describe, expect, it } from 'vitest';
import {
	assessRoadwayLogAnchoring,
	orientWaypointsForAnchors,
	projectLengthFromRoadwayLog,
	reconcileWaypointDirection,
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

	describe('reconcileWaypointDirection (geographic anchor)', () => {
		// A south->north route as digitized by GPAS, but the begin terminus is at
		// the NORTH end (high lat). Without geographic reconciliation, station 0
		// would land at the south vertex and every marker would mirror.
		const southToNorth = [
			{ lat: 30.0, lng: -83.0 },
			{ lat: 30.05, lng: -83.0 },
			{ lat: 30.1, lng: -83.0 }
		];

		it('reverses so waypoints[0] is nearest the begin anchor', () => {
			const out = reconcileWaypointDirection(southToNorth, {
				beginAnchor: { lat: 30.1, lng: -83.0 }, // north end is the begin
				beginStation: 0,
				endStation: 52.8
			});
			expect(out[0]).toEqual(southToNorth[2]);
			expect(out[out.length - 1]).toEqual(southToNorth[0]);
		});

		it('keeps direction when waypoints[0] already matches the begin anchor', () => {
			const out = reconcileWaypointDirection(southToNorth, {
				beginAnchor: { lat: 30.0, lng: -83.0 }, // south end is the begin
				beginStation: 0,
				endStation: 52.8
			});
			expect(out).toEqual(southToNorth);
		});

		it('uses both anchors, picking the lower total endpoint cost', () => {
			const out = reconcileWaypointDirection(southToNorth, {
				beginAnchor: { lat: 30.1, lng: -83.0 },
				endAnchor: { lat: 30.0, lng: -83.0 }
			});
			expect(out[0]).toEqual(southToNorth[2]);
		});

		it('falls back to the milepost-axis rule when no geographic anchor is given', () => {
			expect(
				reconcileWaypointDirection(southToNorth, { beginStation: 20, endStation: 10 })
			).toEqual([...southToNorth].reverse());
			expect(
				reconcileWaypointDirection(southToNorth, { beginStation: 0, endStation: 52.8 })
			).toEqual(southToNorth);
		});

		it('ignores non-finite anchors and falls back to the station rule', () => {
			const out = reconcileWaypointDirection(southToNorth, {
				beginAnchor: { lat: Number.NaN, lng: -83.0 },
				beginStation: 0,
				endStation: 52.8
			});
			expect(out).toEqual(southToNorth);
		});

		it('returns the route unchanged when it has fewer than 2 waypoints', () => {
			const single = [{ lat: 30, lng: -83 }];
			expect(
				reconcileWaypointDirection(single, { beginAnchor: { lat: 31, lng: -83 } })
			).toEqual(single);
		});
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

	it('reports the roadway-log span (ft) when the route is too short to plot every milepost', () => {
		// A ~tiny route (two near-identical points) cannot reach a 1-mile (52.8
		// station) furthest event, so it is flagged route-too-short and must carry
		// the log span in feet for the informative UI message.
		const assessment = assessRoadwayLogAnchoring({
			waypoints: [
				{ lat: 30, lng: -83 },
				{ lat: 30.0001, lng: -83 }
			],
			events: [oneMileEvent],
			totalLengthFt: 5280,
			routeSource: 'gdot_route'
		});
		expect(assessment.reason).toBe('route-too-short');
		expect(assessment.logSpanFt).toBeCloseTo(5280, 0);
		expect(assessment.routeLengthFt).not.toBeNull();
		expect(assessment.routeLengthFt as number).toBeLessThan(assessment.logSpanFt as number);
	});
});
