import { constant } from '$lib/config';
import { haversineMeters, polylineLengthFt, stationToFeet } from '$lib/services/mapUtils';

interface Waypoint {
	lat: number;
	lng: number;
}

/** A real, resolved geographic anchor for one end of the route. */
export interface GeographicAnchor {
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
	/**
	 * Distance (ft) of the furthest roadway-log milepost measured along the
	 * log's own station axis — i.e. how long the route must be to plot every
	 * marker. Drives the informative "route is N ft short" message.
	 */
	logSpanFt: number | null;
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

function isFiniteAnchor(a: GeographicAnchor | null | undefined): a is GeographicAnchor {
	return (
		a != null &&
		typeof a.lat === 'number' &&
		typeof a.lng === 'number' &&
		Number.isFinite(a.lat) &&
		Number.isFinite(a.lng)
	);
}

function anchorDistanceM(a: GeographicAnchor, wp: Waypoint): number {
	return haversineMeters(a.lat, a.lng, wp.lat, wp.lng);
}

/**
 * Orient a resolved route polyline so that station 0 / the lowest milepost
 * lands at `waypoints[0]`.
 *
 * The polyline returned by GPAS / Project Hub / OSRM can be digitized in EITHER
 * geographic direction relative to how the roadway-log mileposts increase, so a
 * begin-station-of-0 route still mirrors every marker when `waypoints[0]` is
 * geographically the END (high-milepost) terminus. Station-based projection
 * (`@turf/along` from `waypoints[0]`) has no way to know this on its own.
 *
 * Reconciliation precedence (only ever REORDERS real, already-resolved
 * geometry — never fabricates a coordinate):
 *   1. Geographic anchors: when a resolved begin and/or end terminus coordinate
 *      is available, pick the orientation whose endpoints best match (begin
 *      terminus nearest `waypoints[0]`, end terminus nearest the last vertex).
 *   2. Fallback: the existing milepost-axis rule (reverse only when the begin
 *      station is past the end station), preserving prior behavior when no
 *      geographic anchor exists.
 *
 * The LRS path does NOT use this — its station→measure→point mapping is already
 * direction-correct via the calibrated measure axis.
 */
export function reconcileWaypointDirection(
	waypoints: Waypoint[],
	opts: {
		beginAnchor?: GeographicAnchor | null;
		endAnchor?: GeographicAnchor | null;
		beginStation?: number | null;
		endStation?: number | null;
	}
): Waypoint[] {
	if (waypoints.length < 2) return waypoints;

	const begin = isFiniteAnchor(opts.beginAnchor) ? opts.beginAnchor : null;
	const end = isFiniteAnchor(opts.endAnchor) ? opts.endAnchor : null;

	if (begin || end) {
		const first = waypoints[0];
		const last = waypoints[waypoints.length - 1];

		// "Forward" cost: how far the route ends are from the terminus they should
		// match (begin↔first, end↔last). "Reversed" cost swaps the two ends. Use
		// only the anchors we actually have so a single resolved terminus still
		// decides direction.
		let forwardCost = 0;
		let reverseCost = 0;
		if (begin) {
			forwardCost += anchorDistanceM(begin, first);
			reverseCost += anchorDistanceM(begin, last);
		}
		if (end) {
			forwardCost += anchorDistanceM(end, last);
			reverseCost += anchorDistanceM(end, first);
		}

		if (reverseCost < forwardCost) return [...waypoints].reverse();
		return waypoints;
	}

	// No geographic anchor — fall back to the milepost-axis rule (unchanged).
	return orientWaypointsForAnchors(waypoints, opts.beginStation, opts.endStation);
}

export function assessRoadwayLogAnchoring(opts: {
	waypoints: Waypoint[];
	events: RoadwayLogEventLike[];
	totalLengthFt?: number | null;
	routeSource?: string | null;
}): RoadwayLogAnchorAssessment {
	const logSpanFt =
		opts.events.length > 0
			? Math.max(...opts.events.map((event) => stationToFeet(event.station)))
			: null;
	const routeLengthFt = opts.waypoints.length >= 2 ? polylineLengthFt(opts.waypoints) : null;
	if (!routeLengthFt) {
		return {
			anchored: false,
			reason: 'missing-route',
			expectedLengthFt: null,
			routeLengthFt,
			logSpanFt
		};
	}
	if (opts.events.length === 0) {
		return {
			anchored: false,
			reason: 'missing-log',
			expectedLengthFt: null,
			routeLengthFt,
			logSpanFt
		};
	}

	const expectedLengthFt = projectLengthFromRoadwayLog(opts.events, opts.totalLengthFt);
	if (!expectedLengthFt) {
		return {
			anchored: false,
			reason: 'missing-project-length',
			expectedLengthFt,
			routeLengthFt,
			logSpanFt
		};
	}

	const maxEventFeet = logSpanFt ?? 0;
	// Only flag "too short" when the route falls MEANINGFULLY short of the log
	// span. A few feet of difference is normal LRS/measurement rounding (e.g.
	// 15,093 ft route vs 15,101 ft log = 0.05% short) and must not warn. The
	// allowed slack mirrors the spirit of the 0.85–1.2 ratio band below: the
	// route may be up to ~2% (or a small absolute amount) shorter than the log
	// before it genuinely can't host the furthest milepost.
	const tooShortSlackFt = Math.max(50, maxEventFeet * 0.02);
	if (routeLengthFt < maxEventFeet - tooShortSlackFt) {
		return {
			anchored: false,
			reason: 'route-too-short',
			expectedLengthFt,
			routeLengthFt,
			logSpanFt
		};
	}

	if (opts.routeSource === 'manual') {
		return {
			anchored: true,
			reason: 'anchored-manual-route',
			expectedLengthFt,
			routeLengthFt,
			logSpanFt
		};
	}

	if (opts.routeSource === 'gdot_lrs') {
		return {
			anchored: opts.events.length > 0,
			reason: opts.events.length > 0 ? 'anchored-route-length-match' : 'missing-log',
			expectedLengthFt,
			routeLengthFt,
			logSpanFt
		};
	}

	const ratio = routeLengthFt / expectedLengthFt;
	if (ratio >= 0.85 && ratio <= 1.2) {
		return {
			anchored: true,
			reason: 'anchored-route-length-match',
			expectedLengthFt,
			routeLengthFt,
			logSpanFt
		};
	}

	return {
		anchored: false,
		reason: 'route-needs-trimming',
		expectedLengthFt,
		routeLengthFt,
		logSpanFt
	};
}
