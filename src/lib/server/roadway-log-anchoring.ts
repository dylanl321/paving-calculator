import { constant } from '$lib/config';
import { polylineLengthFt, stationToFeet } from '$lib/services/mapUtils';

interface Waypoint {
	lat: number;
	lng: number;
}

interface RoadwayLogEventLike {
	milepost: number;
	station: number;
	event_type?: string;
	is_reference?: boolean;
}

export interface RoadwayLogAnchorAssessment {
	anchored: boolean;
	reason:
		| 'anchored-manual-route'
		| 'anchored-route-length-match'
		| 'missing-route'
		| 'missing-log'
		| 'missing-project-length'
		| 'route-too-short'
		| 'route-needs-trimming';
	expectedLengthFt: number | null;
	routeLengthFt: number | null;
}

const FT_PER_MILE = () => constant('CONST.FT_PER_MILE');

function validPositive(value: number | null | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function projectLengthFromRoadwayLog(
	events: RoadwayLogEventLike[],
	totalLengthFt?: number | null
): number | null {
	if (validPositive(totalLengthFt)) return totalLengthFt;

	const projectEnd = events.find(
		(event) => event.event_type === 'project_end' && validPositive(event.milepost)
	);
	if (projectEnd && validPositive(projectEnd.milepost)) return projectEnd.milepost * FT_PER_MILE();

	const maxMilepost = events
		.filter((event) => !event.is_reference && validPositive(event.milepost))
		.reduce((max, event) => Math.max(max, event.milepost), 0);
	return maxMilepost > 0 ? maxMilepost * FT_PER_MILE() : null;
}

export function routeDirectionFromAnchors(
	beginStation: number | null | undefined,
	endStation: number | null | undefined
): 'forward' | 'reverse' | 'unknown' {
	if (!validPositive(endStation) || beginStation == null || !Number.isFinite(beginStation)) {
		return 'unknown';
	}
	if (beginStation > endStation) return 'reverse';
	return 'forward';
}

export function orientWaypointsForAnchors(
	waypoints: Waypoint[],
	beginStation: number | null | undefined,
	endStation: number | null | undefined
): Waypoint[] {
	return routeDirectionFromAnchors(beginStation, endStation) === 'reverse'
		? [...waypoints].reverse()
		: waypoints;
}

export function assessRoadwayLogAnchoring(opts: {
	waypoints: Waypoint[];
	events: RoadwayLogEventLike[];
	totalLengthFt?: number | null;
	routeSource?: string | null;
}): RoadwayLogAnchorAssessment {
	const routeLengthFt = opts.waypoints.length >= 2 ? polylineLengthFt(opts.waypoints) : null;
	if (!routeLengthFt) {
		return {
			anchored: false,
			reason: 'missing-route',
			expectedLengthFt: null,
			routeLengthFt
		};
	}
	if (opts.events.length === 0) {
		return {
			anchored: false,
			reason: 'missing-log',
			expectedLengthFt: null,
			routeLengthFt
		};
	}

	const expectedLengthFt = projectLengthFromRoadwayLog(opts.events, opts.totalLengthFt);
	if (!expectedLengthFt) {
		return {
			anchored: false,
			reason: 'missing-project-length',
			expectedLengthFt,
			routeLengthFt
		};
	}

	const maxEventFeet = Math.max(...opts.events.map((event) => stationToFeet(event.station)));
	if (routeLengthFt < maxEventFeet) {
		return {
			anchored: false,
			reason: 'route-too-short',
			expectedLengthFt,
			routeLengthFt
		};
	}

	if (opts.routeSource === 'manual') {
		return {
			anchored: true,
			reason: 'anchored-manual-route',
			expectedLengthFt,
			routeLengthFt
		};
	}

	const ratio = routeLengthFt / expectedLengthFt;
	if (ratio >= 0.85 && ratio <= 1.2) {
		return {
			anchored: true,
			reason: 'anchored-route-length-match',
			expectedLengthFt,
			routeLengthFt
		};
	}

	return {
		anchored: false,
		reason: 'route-needs-trimming',
		expectedLengthFt,
		routeLengthFt
	};
}
