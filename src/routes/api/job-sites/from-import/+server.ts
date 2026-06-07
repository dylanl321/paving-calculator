import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type JobSiteContractMeta, type DbJobSiteConfig } from '$lib/server/db';
import type { D1Database } from '../../../../cloudflare';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { deliverWebhook } from '$lib/server/webhooks';
import type { ParsedGdotJob } from '$lib/server/pdf/parse-gdot';
import { resolveImportLocation, type LocationPrecision, type ResolvedLocation } from '$lib/server/gdot-geometry';
import { lookupGdotBoundaries } from '$lib/server/gdot-boundaries';
import {
	assessRoadwayLogAnchoring,
	orientWaypointsForAnchors,
	reconcileWaypointDirection
} from '$lib/server/roadway-log-anchoring';
import { buildLogSegments } from '$lib/server/roadway-log-segments';
import {
	buildSegmentRows,
	lineCentroid as segmentLineCentroid,
	type ImportSegment,
	type SegmentPavementRow
} from '$lib/server/import-segments';
import {
	calibrationToRouteMeasure,
	measureRangeToLine,
	measureToPoint,
	type LrsRoute,
	type RouteCalibration
} from '$lib/server/dot/lrs-route';
import {
	geoJsonToD1,
	metersToFeet,
	haversineMeters,
	feetToCoordinate,
	polylineLengthFt,
	stationToFeet
} from '$lib/services/mapUtils';
import { constant } from '$lib/config';

/**
 * One physically-disconnected road segment from a multi-segment import. The
 * shape lives in `$lib/server/import-segments` (pure, testable); re-imported
 * here as `ImportSegment`.
 */
interface FromImportRequest {
	parsed: ParsedGdotJob;
	segments?: ImportSegment[];
	source_keys?: string[];
	documents?: Array<{ filename: string; source_key: string; type: string }>;
	/**
	 * Completeness-required paving config the user fills/confirms on the import
	 * review screen (contracts don't reliably carry these): road type, lane count,
	 * lane width, target thickness, target spread rate. Pre-filled client-side from
	 * parsed values + org defaults; persisted here so the new project opens with a
	 * complete setup instead of being flagged incomplete with no explanation.
	 */
	paving_setup?: {
		road_type?: string | null;
		num_lanes?: number | null;
		lane_width_ft?: number | null;
		target_thickness_in?: number | null;
		target_spread_rate?: number | null;
	};
	route_override?: {
		accepted: boolean;
		latitude: number | null;
		longitude: number | null;
		waypoints: Array<{ lat: number; lng: number }>;
		source: string;
		location_precision?: LocationPrecision;
		events_anchored?: boolean;
	};
}

// Maps a derived scope tag to the legacy single scope_of_work enum where one
// exists, so the primary scope stays backward-compatible.
const SCOPE_TO_ENUM: Record<string, DbJobSiteConfig['scope_of_work']> = {
	milling: 'mill_and_fill',
	resurfacing: 'overlay',
	leveling: 'leveling',
	patching: 'patching',
	shoulder_rehab: 'widening'
};

function num(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
	if (v == null) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
}

function isAsphaltMix(name: string): boolean {
	// Asphalt mixes are measured in tons and carry mix-like names; patching is
	// asphalt but its takeoff is small. We sum every TN mix takeoff for tonnage.
	return /OGI|SUPERPAVE|9\.5|12\.5|19|25|MM|RECYC|ASPH|LEVELING|PATCH/i.test(name);
}

function validNum(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v);
}

function validWaypoint(wp: unknown): wp is { lat: number; lng: number } {
	return (
		wp != null &&
		typeof wp === 'object' &&
		validNum((wp as { lat?: unknown }).lat) &&
		validNum((wp as { lng?: unknown }).lng)
	);
}

const LOCATION_SOURCES: ResolvedLocation['source'][] = [
	'gdot_project_hub',
	'gdot_lrs',
	'gdot_route',
	'osm_termini_route',
	'osm_overpass',
	'geocode',
	'county_centroid',
	'manual',
	'none'
];

function normalizeLocationSource(
	value: string | null | undefined,
	fallback: ResolvedLocation['source']
): ResolvedLocation['source'] {
	return LOCATION_SOURCES.includes(value as ResolvedLocation['source'])
		? (value as ResolvedLocation['source'])
		: fallback;
}

function precisionForSource(
	source: string | null | undefined,
	routeGeometry: LineGeom | null | undefined,
	latitude: number | null,
	longitude: number | null
): LocationPrecision {
	if (routeGeometry && routeGeometry.coordinates.length >= 2) return 'route';
	if (source === 'county_centroid') return 'county';
	if (latitude != null && longitude != null) return 'point';
	return 'none';
}

interface LineGeom {
	type: 'LineString';
	coordinates: [number, number][];
}

function eventCoordinateGeoJson(
	waypoints: Array<{ lat: number; lng: number }>,
	station: number | null
): string | null {
	if (station == null || !Number.isFinite(station) || waypoints.length < 2) return null;
	const stationFeet = stationToFeet(station);
	if (stationFeet > polylineLengthFt(waypoints)) return null;
	const coord = feetToCoordinate(stationFeet, waypoints);
	if (!coord) return null;
	return JSON.stringify({ type: 'Point', coordinates: [coord[1], coord[0]] });
}

function eventCoordinateFromLrs(
	lrsRoute: LrsRoute,
	calibration: RouteCalibration,
	milepost: number
): string | null {
	const routeM = calibrationToRouteMeasure(calibration, milepost);
	const pt = measureToPoint(lrsRoute, routeM);
	if (!pt) return null;
	return JSON.stringify({ type: 'Point', coordinates: pt });
}

const FT_PER_MILE = () => constant('CONST.FT_PER_MILE');
const FT_PER_STATION = () => constant('CONST.FT_PER_STATION');

function milepostToStation(milepost: number): number {
	return (milepost * FT_PER_MILE()) / FT_PER_STATION();
}

/** Total length of a [lng,lat] LineString in feet. */
function lineLengthFt(line: LineGeom): number {
	let ft = 0;
	for (let i = 0; i < line.coordinates.length - 1; i++) {
		const [lng1, lat1] = line.coordinates[i];
		const [lng2, lat2] = line.coordinates[i + 1];
		ft += metersToFeet(haversineMeters(lat1, lng1, lat2, lng2));
	}
	return ft;
}

/**
 * Split a route LineString into N road sections of roughly equal length,
 * each carrying its own [lng,lat] LineString geometry and station_start/end
 * (1 station = 100 ft). Returns [] when the line is too short to split.
 */
function buildRoadSectionsFromRoute(
	line: LineGeom,
	scopeLabel: string,
	sectionCount = 4
): Array<{ name: string; geometry: LineGeom; station_start: number; station_end: number }> {
	const coords = line.coordinates;
	if (coords.length < 2) return [];

	// Cumulative distance (ft) at each vertex.
	const cum: number[] = [0];
	for (let i = 0; i < coords.length - 1; i++) {
		const [lng1, lat1] = coords[i];
		const [lng2, lat2] = coords[i + 1];
		cum.push(cum[i] + metersToFeet(haversineMeters(lat1, lng1, lat2, lng2)));
	}
	const totalFt = cum[cum.length - 1];
	if (totalFt < 100) return [];

	const n = Math.max(1, Math.min(sectionCount, Math.ceil(totalFt / 1000)));
	const sliceFt = totalFt / n;
	const out: Array<{ name: string; geometry: LineGeom; station_start: number; station_end: number }> = [];

	for (let s = 0; s < n; s++) {
		const startFt = s * sliceFt;
		const endFt = (s + 1) * sliceFt;
		const slice: [number, number][] = [];
		for (let i = 0; i < coords.length; i++) {
			if (cum[i] >= startFt && cum[i] <= endFt) slice.push(coords[i]);
		}
		// Guarantee at least the endpoints so the geometry is a valid 2-point line.
		if (slice.length < 2) {
			slice.length = 0;
			slice.push(coords[Math.min(coords.length - 1, Math.floor((s / n) * (coords.length - 1)))]);
			slice.push(coords[Math.min(coords.length - 1, Math.floor(((s + 1) / n) * (coords.length - 1)))]);
		}
		out.push({
			name: `${scopeLabel} ${s + 1}`,
			geometry: { type: 'LineString', coordinates: slice },
			station_start: startFt / 100,
			station_end: endFt / 100
		});
	}
	return out;
}

function buildRoadSectionsFromLogSegments(
	lrsRoute: LrsRoute,
	calibration: RouteCalibration,
	events: Array<{
		milepost: number;
		event_type?: string;
		description: string;
		roadway_width_ft?: number | null;
	}>
): Array<{ name: string; geometry: LineGeom; station_start: number; station_end: number }> {
	const segments = buildLogSegments(events);
	const out: Array<{ name: string; geometry: LineGeom; station_start: number; station_end: number }> = [];

	for (const seg of segments) {
		const line = measureRangeToLine(
			lrsRoute,
			calibrationToRouteMeasure(calibration, seg.fromMeasure),
			calibrationToRouteMeasure(calibration, seg.toMeasure)
		);
		if (line.length < 2) continue;
		out.push({
			name: `${seg.startEventLabel} → ${seg.endEventLabel}`,
			geometry: { type: 'LineString', coordinates: line },
			station_start: milepostToStation(seg.fromMeasure),
			station_end: milepostToStation(seg.toMeasure)
		});
	}
	return out;
}

/**
 * Insert one road_sections row, including the multi-segment columns added in
 * migration 0078 (segment_group/treatment/measure_axis/termini/geometry_confidence)
 * and the denormalized pavement defaults added in migration 0079
 * (target_thickness_in/target_spread_rate/mill_depth_in/width_ft).
 * Mirrors the upsertJobSiteConfig core/optional split: if the optional columns
 * don't exist yet on the shared remote D1 (migration not applied), retry with
 * only the core columns so the import still succeeds.
 */
async function insertRoadSection(
	db: D1Database,
	row: {
		id: string;
		job_site_id: string;
		name: string;
		lane: string;
		station_start: number | null;
		station_end: number | null;
		status: string;
		geometry_geojson: string | null;
		planned_length_ft: number | null;
		production_mix_id: string | null;
		segment_group: string | null;
		treatment: string | null;
		measure_axis: string | null;
		begin_terminus: string | null;
		end_terminus: string | null;
		geometry_confidence: string | null;
		target_thickness_in: number | null;
		target_spread_rate: number | null;
		mill_depth_in: number | null;
		width_ft: number | null;
		notes: string | null;
		sort_order: number;
		created_at: number;
		updated_at: number;
	}
): Promise<void> {
	try {
		await db
			.prepare(
				`INSERT INTO road_sections
				(id, job_site_id, name, lane, station_start, station_end, status, geometry_geojson,
				 planned_length_ft, production_mix_id, segment_group, treatment, measure_axis,
				 begin_terminus, end_terminus, geometry_confidence,
				 target_thickness_in, target_spread_rate, mill_depth_in, width_ft,
				 notes, sort_order, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				row.id,
				row.job_site_id,
				row.name,
				row.lane,
				row.station_start,
				row.station_end,
				row.status,
				row.geometry_geojson,
				row.planned_length_ft,
				row.production_mix_id,
				row.segment_group,
				row.treatment,
				row.measure_axis,
				row.begin_terminus,
				row.end_terminus,
				row.geometry_confidence,
				row.target_thickness_in,
				row.target_spread_rate,
				row.mill_depth_in,
				row.width_ft,
				row.notes,
				row.sort_order,
				row.created_at,
				row.updated_at
			)
			.run();
	} catch (err) {
		// Optional columns may not exist yet on a lagging DB; retry core-only.
		if (!/no such column/i.test(String(err))) throw err;
		await db
			.prepare(
				`INSERT INTO road_sections
				(id, job_site_id, name, lane, station_start, station_end, status, geometry_geojson,
				 notes, sort_order, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				row.id,
				row.job_site_id,
				row.name,
				row.lane,
				row.station_start,
				row.station_end,
				row.status,
				row.geometry_geojson,
				row.notes,
				row.sort_order,
				row.created_at,
				row.updated_at
			)
			.run();
	}
}

/**
 * Insert the pavement_structure child rows for one road_sections row. This child
 * table is the single source of truth for per-mile-range specs. Wrapped in a
 * try/catch so a lagging remote D1 (migration 0080 not yet applied) can't 500
 * the import: a missing table/column degrades to "no child rows persisted" while
 * the denormalized road_sections defaults (written above) still carry the
 * representative spec. Returns the number of child rows written.
 */
async function insertPavementStructure(
	db: D1Database,
	roadSectionId: string,
	pavement: SegmentPavementRow[],
	now: number
): Promise<number> {
	if (!pavement.length) return 0;
	let written = 0;
	for (const p of pavement) {
		const id = 'pav_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
		try {
			await db
				.prepare(
					`INSERT INTO pavement_structure
					(id, road_section_id, applies_from_mi, applies_to_mi, lift_thickness_in,
					 mill_depth_in, spread_rate_lbs_sy, width_ft_min, width_ft_max, mix,
					 source_page, confidence, sort_order, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					id,
					roadSectionId,
					p.applies_from_mi,
					p.applies_to_mi,
					p.lift_thickness_in,
					p.mill_depth_in,
					p.spread_rate_lbs_sy,
					p.width_ft_min,
					p.width_ft_max,
					p.mix,
					p.source_page,
					p.confidence,
					p.sort_order,
					now,
					now
				)
				.run();
			written++;
		} catch (err) {
			// Table/column may not exist yet on a lagging remote D1; the
			// denormalized road_sections defaults still carry the representative
			// spec, so skip child persistence rather than fail the whole import.
			if (!/no such (table|column)/i.test(String(err))) throw err;
			break;
		}
	}
	return written;
}

/**
 * Persist N disconnected import segments as road_sections rows. Each segment
 * uses its OWN geometry and its own station axis (local streets each start at
 * station 0 - they share no route). Returns the number of rows written.
 * Row mapping is the pure `buildSegmentRows`; this only handles ID/timestamps
 * and the D1 insert (with the optional-column retry guard).
 */
async function persistImportSegments(
	db: D1Database,
	jobSiteId: string,
	segments: ImportSegment[]
): Promise<number> {
	const now = Math.floor(Date.now() / 1000);
	const rows = buildSegmentRows(segments);
	for (const row of rows) {
		const id = 'sec_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
		await insertRoadSection(db, {
			id,
			job_site_id: jobSiteId,
			name: row.name,
			lane: row.lane,
			station_start: row.station_start,
			station_end: row.station_end,
			status: row.status,
			geometry_geojson: row.geometry_geojson ? geoJsonToD1(row.geometry_geojson) : null,
			planned_length_ft: row.planned_length_ft,
			production_mix_id: row.production_mix_id,
			segment_group: row.segment_group,
			treatment: row.treatment,
			measure_axis: row.measure_axis,
			begin_terminus: row.begin_terminus,
			end_terminus: row.end_terminus,
			geometry_confidence: row.geometry_confidence,
			target_thickness_in: row.target_thickness_in,
			target_spread_rate: row.target_spread_rate,
			mill_depth_in: row.mill_depth_in,
			width_ft: row.width_ft,
			notes: null,
			sort_order: row.sort_order,
			created_at: now,
			updated_at: now
		});
		// Child pavement_structure rows are the single source of truth for the
		// per-mile-range specs; the denormalized columns above are derived from
		// them. Persisted best-effort (a lagging remote D1 can't 500 the import).
		await insertPavementStructure(db, id, row.pavement, now);
	}
	return rows.length;
}

/**
 * POST /api/job-sites/from-import
 * Creates a job site from a reviewed PDF-import object: job row, contract
 * metadata + scopes, paving config (primary scope/mix/tonnage), bid items
 * (with alternate/selected flags) and production mixes.
 */
export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const body = (await event.request.json()) as FromImportRequest;
		const parsed = body.parsed;
		if (!parsed) {
			return json({ error: 'Missing parsed data' }, { status: 400 });
		}

		const name = str(parsed.name);
		if (!name) {
			return json({ error: 'Job site name is required' }, { status: 400 });
		}

		const jobSite = await db.createJobSite(
			org.id,
			name,
			str(parsed.location_description),
			null,
			null
		);

		const scopes = Array.isArray(parsed.scopes) ? parsed.scopes.filter(Boolean) : [];

		// Contract / customer metadata + scopes.
		const meta: JobSiteContractMeta = {
			job_number: str(parsed.job_number),
			project_number: str(parsed.project_number),
			contract_id: str(parsed.contract_id),
			work_type: str(parsed.work_type),
			contract_type: str(parsed.contract_type),
			contract_amount: num(parsed.contract_amount),
			retainage_pct: num(parsed.retainage_pct),
			est_start_date: str(parsed.est_start_date),
			completion_date: str(parsed.completion_date),
			customer_name: str(parsed.customer_name),
			customer_address: str(parsed.customer_address),
			customer_contact: str(parsed.customer_contact),
			customer_phone: str(parsed.customer_phone),
			customer_email: str(parsed.customer_email),
			owner_name: str(parsed.owner_name),
			owner_address: str(parsed.owner_address),
			project_manager: str(parsed.project_manager),
			asphalt_supplier: str(parsed.asphalt_supplier),
			import_source_key: body.source_keys?.[0] ?? null,
			scopes_json: scopes.length ? JSON.stringify(scopes) : null
		};
		if (Object.values(meta).some((v) => v !== null)) {
			await db.setJobSiteContractMeta(jobSite.id, meta);
		}

		// Production mixes (insert first so we can derive primary mix + tonnage).
		const mixes = Array.isArray(parsed.production_mixes) ? parsed.production_mixes : [];
		const asphaltMixes = mixes.filter((m) => isAsphaltMix(m.mix_name));
		const primaryMix = asphaltMixes
			.slice()
			.sort((a, b) => (num(b.takeoff_tonnage) ?? 0) - (num(a.takeoff_tonnage) ?? 0))[0];
		const totalTonnage = asphaltMixes.reduce((sum, m) => sum + (num(m.takeoff_tonnage) ?? 0), 0);

		for (let i = 0; i < mixes.length; i++) {
			const m = mixes[i];
			const mixName = str(m.mix_name);
			if (!mixName) continue;
			const isActive = primaryMix != null && m === primaryMix ? 1 : 0;
			await db.createProductionMix(jobSite.id, {
				mix_name: mixName,
				unit: str(m.unit),
				bid_quantity: num(m.bid_quantity),
				takeoff_tonnage: num(m.takeoff_tonnage),
				quantity_per_day: num(m.quantity_per_day),
				est_days: num(m.est_days),
				mix_type: str(m.mix_type) ?? str(m.mix_name),
				target_thickness_in: null,
				target_spread_rate: null,
				tack_type: null,
				target_tack_rate: null,
				contract_unit_price: num(m.contract_unit_price),
				is_active: isActive,
				sort_order: i
			});
		}

		// Derive contract costs from the bid items where possible:
		//  - cost per ton  = primary asphalt mix's contract unit price
		//  - cost per SY   = milling item (432-xxxx, unit SY)
		//  - cost per mile = grading-per-mile item (210-xxxx, unit LM)
		const items = Array.isArray(parsed.bid_items) ? parsed.bid_items : [];
		const findUnitPrice = (test: (it: (typeof items)[number]) => boolean): number | null => {
			const hit = items.find((it) => it.selected && it.unit_price != null && test(it));
			return hit ? num(hit.unit_price) : null;
		};
		const costPerTon = primaryMix != null ? num(primaryMix.contract_unit_price) : null;
		const costPerSy = findUnitPrice(
			(it) => /^432-/.test(it.item_id ?? '') || /MILL ASPH/i.test(it.description)
		);
		const costPerMile = findUnitPrice(
			(it) => /^210-/.test(it.item_id ?? '') || /GRADING PER MILE/i.test(it.description)
		);

		// Paving config: primary scope (mapped enum), primary mix, total tonnage,
		// roadway length, and contract value (parsed total bid).
		let primaryScope: DbJobSiteConfig['scope_of_work'] = null;
		for (const tag of scopes) {
			if (SCOPE_TO_ENUM[tag]) {
				primaryScope = SCOPE_TO_ENUM[tag];
				break;
			}
		}

		const parsedRoadwayLogEvents = Array.isArray(parsed.roadway_log_events)
			? parsed.roadway_log_events
			: [];
		const projectStartEvent = parsedRoadwayLogEvents.find((ev) => ev.event_type === 'project_start');
		const projectEndEvent = parsedRoadwayLogEvents.find((ev) => ev.event_type === 'project_end');

		// User-reviewed paving setup from the import screen. These four
		// completeness-required fields (road type, lane count, target thickness,
		// target spread rate) plus lane width aren't reliably in the documents, so
		// the user confirms/fills them during review. The reviewed value wins over
		// the parsed roadway-log value (it's been seen by a human); we fall back to
		// the parsed value when the user left a field blank.
		const setup = body.paving_setup ?? {};

		// road_type is a closed enum on the config; only accept a known value.
		const ROAD_TYPES = new Set<NonNullable<DbJobSiteConfig['road_type']>>([
			'highway',
			'state_route',
			'county_road',
			'city_street',
			'subdivision',
			'parking_lot',
			'other'
		]);
		const reviewedRoadType = ((): DbJobSiteConfig['road_type'] => {
			const v = str(setup.road_type);
			return v && ROAD_TYPES.has(v as NonNullable<DbJobSiteConfig['road_type']>)
				? (v as DbJobSiteConfig['road_type'])
				: null;
		})();

		const configPatch: Partial<DbJobSiteConfig> = {
			total_length_ft: num(parsed.total_length_ft),
			mix_type: primaryMix ? str(primaryMix.mix_name) : null,
			scope_of_work: primaryScope,
			total_tonnage: totalTonnage > 0 ? totalTonnage : null,
			cost_per_ton: costPerTon,
			cost_per_sy: costPerSy,
			cost_per_mile: costPerMile,
			total_contract_value: num(parsed.contract_amount),
			route_designation: str(parsed.route_designation),
			begin_terminus: str(parsed.begin_terminus),
			end_terminus: str(parsed.end_terminus),
			begin_station: num(projectStartEvent?.station),
			end_station: num(projectEndEvent?.station),
			// Reviewed paving setup (user value first, then Roadway-Log derived).
			road_type: reviewedRoadType,
			lane_width_ft: num(setup.lane_width_ft) ?? num(parsed.lane_width_ft),
			num_lanes: num(setup.num_lanes) ?? num(parsed.num_lanes),
			target_thickness_in: num(setup.target_thickness_in),
			target_spread_rate: num(setup.target_spread_rate) ?? num(parsed.spread_rate_lbs_sy)
		};
		if (Object.values(configPatch).some((v) => v !== null && v !== undefined)) {
			await db.upsertJobSiteConfig(jobSite.id, configPatch);
		}

		// Resolve the project's geographic location from the parsed fields and,
		// when a route is named, fetch its real GDOT polyline so the project opens
		// with the road already drawn (sections + stationing). Best-effort: any
		// failure leaves coordinates null and the user can place the pin manually.
		let locationSource: string = 'none';
		let locationPrecision: LocationPrecision = 'none';
		let sectionCount = 0;
		let routeWaypointsForEvents: Array<{ lat: number; lng: number }> = [];
		let roadwayLogAnchored = false;
		let lrsRouteForEvents: LrsRoute | null = null;
		let lrsCalibration: RouteCalibration | null = null;

		// Multi-segment import: a project of N physically-disconnected segments
		// (e.g. several separate city streets, or a mainline + a ramp). Each
		// segment is persisted as its own road_sections row with its own geometry
		// and station axis. These projects have no single route, so we skip the
		// single-route resolution/slicing below and use the segments directly.
		const importSegments = Array.isArray(body.segments) ? body.segments : [];
		if (importSegments.length > 0) {
			try {
				sectionCount = await persistImportSegments(
					event.platform!.env.DB,
					jobSite.id,
					importSegments
				);
				// Pin the job site at the first segment's centroid when we have no
				// coordinate from the parsed fields, so the map opens near the work.
				const firstGeom = importSegments.find(
					(s) => s.geometry && Array.isArray(s.geometry.coordinates) && s.geometry.coordinates.length >= 2
				)?.geometry;
				const centroid = firstGeom ? segmentLineCentroid(firstGeom) : null;
				if (centroid) {
					locationSource = 'import_segments';
					locationPrecision = 'route';
					const { county, district } = await lookupGdotBoundaries(
						centroid.lat,
						centroid.lng
					).catch(() => ({ county: null, district: null }));
					await db.updateJobSite(jobSite.id, {
						latitude: centroid.lat,
						longitude: centroid.lng,
						location_source: locationSource,
						location_precision: locationPrecision,
						gdot_county: county ?? str(parsed.county),
						gdot_district: district
					});
				}
			} catch (err) {
				console.error('Import segment persistence failed (non-fatal):', err);
			}
		} else {
		try {
			const override = body.route_override?.accepted ? body.route_override : null;
			const overrideWaypoints = Array.isArray(override?.waypoints)
				? override.waypoints.filter(validWaypoint)
				: [];
			const hasOverrideRoute = overrideWaypoints.length >= 2;
			const autoResolved: ResolvedLocation | null = hasOverrideRoute
				? null
				: await resolveImportLocation({
						routeDesignation: str(parsed.route_designation),
						county: str(parsed.county),
						locationDescription: str(parsed.location_description),
						beginTerminus: str(parsed.begin_terminus),
						endTerminus: str(parsed.end_terminus),
						roadwayLogEvents: parsedRoadwayLogEvents,
						countyNumber: str(parsed.county_number),
						midpointEasting: num(parsed.midpoint_easting),
						midpointNorthing: num(parsed.midpoint_northing),
						midpointZoneLabel: str(parsed.midpoint_zone_label),
						grossLengthMi: num(parsed.gross_length_mi),
						projectId: str(parsed.project_number)
					});
			const resolved: ResolvedLocation = hasOverrideRoute
				? {
						latitude: validNum(override!.latitude) ? override!.latitude : null,
						longitude: validNum(override!.longitude) ? override!.longitude : null,
						routeGeometry: {
							type: 'LineString' as const,
							coordinates: overrideWaypoints.map((wp) => [wp.lng, wp.lat] as [number, number])
						},
						source: normalizeLocationSource(override!.source, 'manual'),
						locationPrecision: override!.location_precision ?? 'route',
						countyBoundary: null,
						lookupWarnings: []
					}
				: autoResolved &&
					  (autoResolved.routeGeometry ||
							autoResolved.latitude != null ||
							autoResolved.longitude != null)
					? autoResolved
					: {
							latitude: validNum(override?.latitude) ? override.latitude : null,
							longitude: validNum(override?.longitude) ? override.longitude : null,
							routeGeometry: null,
							source: 'none' as const,
							locationPrecision: override?.location_precision ?? 'none',
							countyBoundary: null,
							lookupWarnings: []
						};
			locationSource = resolved.source;
			locationPrecision = precisionForSource(
				resolved.source,
				resolved.routeGeometry,
				resolved.latitude,
				resolved.longitude
			);

			if (resolved.latitude != null && resolved.longitude != null) {
				// County/district from the PDF's coordinates (authoritative GDOT lookup).
				const { county, district } = await lookupGdotBoundaries(
					resolved.latitude,
					resolved.longitude
				).catch(() => ({ county: null, district: null }));

				// Project Hub (matched by PI number) is the most authoritative source
				// for county/district when present — prefer it over the coordinate
				// lookup and the parsed PDF value.
				const hub = resolved.projectHub;
				await db.updateJobSite(jobSite.id, {
					latitude: resolved.latitude,
					longitude: resolved.longitude,
					location_source: locationSource,
					location_precision: locationPrecision,
					gdot_county: hub?.counties ?? county ?? str(parsed.county),
					gdot_district: hub?.gdotDistrict ?? district
				});
			}

			// Contract-id cross-check + metadata fill from the GDOT Project Hub.
			// The hub's CONTRACT_ID anchors the project identity against the parsed
			// PDF; contractor/award/completion fill the contract meta only when the
			// parsed value was null (never override a parsed value).
			if (resolved.projectHub) {
				const hub = resolved.projectHub;
				const parsedContractId = str(parsed.contract_id);
				if (hub.contractId && parsedContractId) {
					if (hub.contractId.trim().toUpperCase() === parsedContractId.trim().toUpperCase()) {
						console.log(
							`[from-import] Confirmed GDOT project ${str(parsed.project_number) ?? ''} / contract ${hub.contractId}`
						);
					} else {
						console.warn(
							`[from-import] contract_id mismatch: PDF "${parsedContractId}" vs GDOT Project Hub "${hub.contractId}" (PI ${str(parsed.project_number) ?? '?'})`
						);
					}
				}
				const metaFill: JobSiteContractMeta = {};
				if (parsedContractId == null && hub.contractId) metaFill.contract_id = hub.contractId;
				if (str(parsed.est_start_date) == null && hub.awardDate) metaFill.est_start_date = hub.awardDate;
				if (str(parsed.completion_date) == null && hub.completionDate)
					metaFill.completion_date = hub.completionDate;
				if (Object.keys(metaFill).length > 0) {
					await db.setJobSiteContractMeta(jobSite.id, metaFill);
				}
			}

			// When we have the actual route polyline, store it as the route
			// waypoints and split it into stationed road sections.
			if (resolved.routeGeometry && resolved.routeGeometry.coordinates.length >= 2) {
				// Route waypoints are stored as {lat,lng} (GeoJSON is [lng,lat]).
				// Reconcile the polyline's geographic direction so station 0 / the
				// lowest milepost lands at the geographic begin. A user-confirmed
				// manual override already encodes the intended direction, so leave it
				// as-is; the LRS path is already direction-correct (it bakes event
				// coords via the calibrated measure axis below, not station→along).
				const rawWaypoints = resolved.routeGeometry.coordinates.map(
					([lng, lat]) => ({ lat, lng })
				);
				const waypoints =
					hasOverrideRoute || (resolved.lrsRoute && resolved.calibration)
						? orientWaypointsForAnchors(
								rawWaypoints,
								configPatch.begin_station,
								configPatch.end_station
							)
						: reconcileWaypointDirection(rawWaypoints, {
								beginAnchor: resolved.beginAnchor,
								endAnchor: resolved.endAnchor,
								beginStation: configPatch.begin_station,
								endStation: configPatch.end_station
							});
				const line = {
					type: 'LineString' as const,
					coordinates: waypoints.map((wp) => [wp.lng, wp.lat] as [number, number])
				};
				const anchorAssessment = assessRoadwayLogAnchoring({
					waypoints,
					events: parsedRoadwayLogEvents,
					totalLengthFt: num(parsed.total_length_ft),
					routeSource: resolved.source
				});
				roadwayLogAnchored = anchorAssessment.anchored;
				routeWaypointsForEvents = waypoints;
				lrsRouteForEvents = resolved.lrsRoute ?? null;
				lrsCalibration = resolved.calibration ?? null;
				await db.upsertJobSiteRoute(jobSite.id, waypoints);

				const scopeLabel = (scopes[0] ?? 'Section')
					.replace(/_/g, ' ')
					.replace(/\b\w/g, (c) => c.toUpperCase());
				const sections =
					resolved.source === 'gdot_lrs' &&
					lrsRouteForEvents &&
					lrsCalibration &&
					parsedRoadwayLogEvents.length >= 2
						? buildRoadSectionsFromLogSegments(
								lrsRouteForEvents,
								lrsCalibration,
								parsedRoadwayLogEvents
							)
						: buildRoadSectionsFromRoute(line, scopeLabel);
				const now = Math.floor(Date.now() / 1000);
				for (let s = 0; s < sections.length; s++) {
					const sec = sections[s];
					const id = 'sec_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
					await event.platform!.env.DB.prepare(
						`INSERT INTO road_sections
						(id, job_site_id, name, lane, station_start, station_end, status, geometry_geojson, notes, sort_order, created_at, updated_at)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
					)
						.bind(
							id,
							jobSite.id,
							sec.name,
							'1',
							sec.station_start,
							sec.station_end,
							'active',
							geoJsonToD1(sec.geometry),
							null,
							s,
							now,
							now
						)
						.run();
					sectionCount++;
				}
			}
		} catch (err) {
			console.error('Import location resolution failed (non-fatal):', err);
		}
		}

		let roadwayLogEventCount = 0;
		const roadwayLogEvents = parsedRoadwayLogEvents;
		const sourceKeys = Array.isArray(body.source_keys) ? body.source_keys : [];
		if (roadwayLogEvents.length > 0) {
			const now = Math.floor(Date.now() / 1000);
			for (let i = 0; i < roadwayLogEvents.length; i++) {
				const ev = roadwayLogEvents[i];
				if (!validNum(ev.milepost) || !validNum(ev.station) || !str(ev.description)) continue;
				const sourceKey =
					typeof ev.source_index === 'number' && ev.source_index >= 0
						? (sourceKeys[ev.source_index] ?? null)
						: null;
				await event.platform!.env.DB.prepare(
					`INSERT INTO roadway_log_events
					(id, job_site_id, source_key, page_number, milepost, station, event_type, description,
					 roadway_width_ft, side, surface, is_reference, confidence, raw_text, coordinate_geojson,
					 sort_order, created_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
					.bind(
						'logevt_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10),
						jobSite.id,
						sourceKey,
						validNum(ev.page_number) ? ev.page_number : null,
						ev.milepost,
						ev.station,
						str(ev.event_type) ?? 'note',
						str(ev.description),
						num(ev.roadway_width_ft),
						str(ev.side),
						str(ev.surface),
						ev.is_reference ? 1 : 0,
						str(ev.confidence) ?? 'low',
						str(ev.raw_text),
						roadwayLogAnchored
							? lrsRouteForEvents && lrsCalibration
								? eventCoordinateFromLrs(lrsRouteForEvents, lrsCalibration, ev.milepost)
								: eventCoordinateGeoJson(routeWaypointsForEvents, ev.station)
							: null,
						i,
						now
					)
					.run();
				roadwayLogEventCount++;
			}
		}

		// Bid items (carry alternate / selected flags).
		let itemCount = 0;
		for (let i = 0; i < items.length; i++) {
			const it = items[i];
			const description = str(it.description);
			if (!description) continue;
			await db.createBidItem(jobSite.id, {
				line_number: str(it.line_number),
				item_id: str(it.item_id),
				description,
				quantity: num(it.quantity),
				unit: str(it.unit),
				unit_price: num(it.unit_price),
				bid_amount: num(it.bid_amount),
				section: str(it.section),
				is_alternate: it.is_alternate ? 1 : 0,
				selected: it.selected ? 1 : 0,
				sort_order: i
			});
			itemCount++;
		}

		// Persist the original uploaded PDFs as downloadable source documents.
		const docs = Array.isArray(body.documents) ? body.documents : [];
		for (const d of docs) {
			if (!d.source_key || !d.filename) continue;
			await db.createJobDocument(jobSite.id, {
				r2_key: d.source_key,
				filename: d.filename,
				doc_type: d.type ?? null,
				content_type: 'application/pdf'
			});
		}

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'job_site',
			resourceId: jobSite.id,
			action: 'created',
			newValue: {
				name: jobSite.name,
				source: 'pdf_import',
				bid_items: itemCount,
				production_mixes: mixes.length,
				scopes,
				location_source: locationSource,
				location_precision: locationPrecision,
				road_sections: sectionCount,
				roadway_log_events: roadwayLogEventCount
			},
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		void deliverWebhook(event.platform!.env.DB, {
			type: 'job_site.created',
			orgId: org.id,
			payload: {
				job_site_id: jobSite.id,
				name: jobSite.name,
				org_id: org.id
			},
			occurredAt: jobSite.created_at
		});

		return json({
			id: jobSite.id,
			name: jobSite.name,
			bid_items: itemCount,
			roadway_log_events: roadwayLogEventCount
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create job from import error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
