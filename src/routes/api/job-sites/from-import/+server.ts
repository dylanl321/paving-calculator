import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type JobSiteContractMeta, type DbJobSiteConfig } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { deliverWebhook } from '$lib/server/webhooks';
import type { ParsedGdotJob } from '$lib/server/pdf/parse-gdot';
import { resolveImportLocation } from '$lib/server/gdot-geometry';
import { lookupGdotBoundaries } from '$lib/server/gdot-boundaries';
import {
	assessRoadwayLogAnchoring,
	orientWaypointsForAnchors
} from '$lib/server/roadway-log-anchoring';
import {
	geoJsonToD1,
	metersToFeet,
	haversineMeters,
	feetToCoordinate,
	polylineLengthFt,
	stationToFeet
} from '$lib/services/mapUtils';

interface FromImportRequest {
	parsed: ParsedGdotJob;
	source_keys?: string[];
	documents?: Array<{ filename: string; source_key: string; type: string }>;
	route_override?: {
		accepted: boolean;
		latitude: number | null;
		longitude: number | null;
		waypoints: Array<{ lat: number; lng: number }>;
		source: string;
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
			// Roadway-Log derived specs (only when the log sheet was parseable).
			lane_width_ft: num(parsed.lane_width_ft),
			num_lanes: num(parsed.num_lanes),
			target_spread_rate: num(parsed.spread_rate_lbs_sy)
		};
		if (Object.values(configPatch).some((v) => v !== null && v !== undefined)) {
			await db.upsertJobSiteConfig(jobSite.id, configPatch);
		}

		// Resolve the project's geographic location from the parsed fields and,
		// when a route is named, fetch its real GDOT polyline so the project opens
		// with the road already drawn (sections + stationing). Best-effort: any
		// failure leaves coordinates null and the user can place the pin manually.
		let locationSource: string = 'none';
		let sectionCount = 0;
		let routeWaypointsForEvents: Array<{ lat: number; lng: number }> = [];
		let roadwayLogAnchored = false;
		try {
			const override = body.route_override?.accepted ? body.route_override : null;
			const overrideWaypoints = Array.isArray(override?.waypoints)
				? override.waypoints.filter(validWaypoint)
				: [];
			const hasOverrideRoute = overrideWaypoints.length >= 2;
			const autoResolved = hasOverrideRoute
				? null
				: await resolveImportLocation({
						routeDesignation: str(parsed.route_designation),
						county: str(parsed.county),
						locationDescription: str(parsed.location_description),
						beginTerminus: str(parsed.begin_terminus),
						endTerminus: str(parsed.end_terminus)
					});
			const resolved = hasOverrideRoute
				? {
						latitude: validNum(override.latitude) ? override.latitude : null,
						longitude: validNum(override.longitude) ? override.longitude : null,
						routeGeometry: {
							type: 'LineString' as const,
							coordinates: overrideWaypoints.map((wp) => [wp.lng, wp.lat] as [number, number])
						},
						source: override.source || 'manual'
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
							source: override?.source || 'none'
						};
			locationSource = resolved.source;

			if (resolved.latitude != null && resolved.longitude != null) {
				// County/district from the PDF's coordinates (authoritative GDOT lookup).
				const { county, district } = await lookupGdotBoundaries(
					resolved.latitude,
					resolved.longitude
				).catch(() => ({ county: null, district: null }));

				await db.updateJobSite(jobSite.id, {
					latitude: resolved.latitude,
					longitude: resolved.longitude,
					gdot_county: county ?? str(parsed.county),
					gdot_district: district
				});
			}

			// When we have the actual route polyline, store it as the route
			// waypoints and split it into stationed road sections.
			if (resolved.routeGeometry && resolved.routeGeometry.coordinates.length >= 2) {
				// Route waypoints are stored as {lat,lng} (GeoJSON is [lng,lat]).
				const waypoints = orientWaypointsForAnchors(
					resolved.routeGeometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
					configPatch.begin_station,
					configPatch.end_station
				);
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
				await db.upsertJobSiteRoute(jobSite.id, waypoints);

				const scopeLabel = (scopes[0] ?? 'Section')
					.replace(/_/g, ' ')
					.replace(/\b\w/g, (c) => c.toUpperCase());
				const sections = buildRoadSectionsFromRoute(line, scopeLabel);
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
						roadwayLogAnchored ? eventCoordinateGeoJson(routeWaypointsForEvents, ev.station) : null,
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
