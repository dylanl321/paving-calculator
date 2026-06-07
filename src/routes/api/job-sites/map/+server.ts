import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import type { DbRoadSection, DbRoadwayLogEvent } from '$lib/server/db-jobsites';
import { DbCrewHelper } from '$lib/server/db-crews';
import { requireAuth } from '$lib/server/auth';
import { d1ToGeoJson } from '$lib/services/mapUtils';

/**
 * GET /api/job-sites/map
 *
 * Returns every job site the user can see (org-scoped; foreman/laborer limited
 * to their crew's jobs) along with the persisted geometry needed to draw it on
 * the large map view:
 *   - pin (latitude/longitude) + status + name
 *   - route waypoints ({lat,lng}[]) saved on the job
 *   - road sections (each with parsed geometry_geojson + status)
 *   - roadway-log events (milepost markers)
 *
 * No geometry is fabricated — jobs without a route/sections simply return empty
 * arrays and are shown as a pin (or "no geometry yet" in the UI).
 */

interface RouteWaypoint {
	lat: number;
	lng: number;
}

interface MapRoadSection {
	id: string;
	name: string;
	status: DbRoadSection['status'];
	geometry: object | null;
	segment_group: string | null;
	treatment: string | null;
}

interface MapRoadwayLogEvent {
	id: string;
	milepost: number;
	station: number;
	event_type: DbRoadwayLogEvent['event_type'];
	description: string;
	roadway_width_ft: number | null;
	is_reference: number;
	coordinate_geojson: string | null;
}

interface MapJobSite {
	id: string;
	name: string;
	status: DbRoadSection['status'] | string;
	latitude: number | null;
	longitude: number | null;
	location_description: string | null;
	gdot_county: string | null;
	route_designation: string | null;
	crew_name: string | null;
	crew_color: string | null;
	waypoints: RouteWaypoint[];
	sections: MapRoadSection[];
	roadway_log_events: MapRoadwayLogEvent[];
	has_geometry: boolean;
}

function isWaypoint(value: unknown): value is RouteWaypoint {
	if (!value || typeof value !== 'object') return false;
	const w = value as { lat?: unknown; lng?: unknown };
	return (
		typeof w.lat === 'number' &&
		Number.isFinite(w.lat) &&
		typeof w.lng === 'number' &&
		Number.isFinite(w.lng)
	);
}

function parseWaypoints(raw: string | null): RouteWaypoint[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed) && parsed.every(isWaypoint)) return parsed;
	} catch {
		/* ignore malformed route json */
	}
	return [];
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const crewDb = new DbCrewHelper(event.platform!.env.DB);
		const D1 = event.platform!.env.DB;

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);

		// Same visibility scoping as GET /api/job-sites: field crews only see
		// their assigned jobs; everyone else sees the whole org.
		const jobSites =
			role === 'foreman' || role === 'laborer'
				? await crewDb.getJobSitesByForeman(user.id, org.id)
				: await db.getJobSitesByOrgId(org.id);

		if (jobSites.length === 0) {
			return json({ job_sites: [] });
		}

		const ids = jobSites.map((s) => s.id);
		const placeholders = ids.map(() => '?').join(',');

		// Batch-load geometry for every job in three queries instead of N×3.
		const [routesRes, sectionsRes, eventsRes, crews] = await Promise.all([
			D1.prepare(
				`SELECT job_site_id, waypoints FROM job_site_routes WHERE job_site_id IN (${placeholders})`
			)
				.bind(...ids)
				.all<{ job_site_id: string; waypoints: string }>(),
			D1.prepare(
				`SELECT id, job_site_id, name, status, geometry_geojson, segment_group, treatment
				 FROM road_sections WHERE job_site_id IN (${placeholders})
				 ORDER BY sort_order ASC, created_at ASC`
			)
				.bind(...ids)
				.all<Pick<DbRoadSection, 'id' | 'job_site_id' | 'name' | 'status' | 'geometry_geojson' | 'segment_group' | 'treatment'>>(),
			D1.prepare(
				`SELECT id, job_site_id, milepost, station, event_type, description, roadway_width_ft, is_reference, coordinate_geojson
				 FROM roadway_log_events WHERE job_site_id IN (${placeholders})
				 ORDER BY sort_order ASC, milepost ASC`
			)
				.bind(...ids)
				.all<Pick<DbRoadwayLogEvent, 'id' | 'job_site_id' | 'milepost' | 'station' | 'event_type' | 'description' | 'roadway_width_ft' | 'is_reference' | 'coordinate_geojson'>>(),
			crewDb.listCrews(org.id)
		]);

		// Crew → site lookup for muted neutral crew colors / labels.
		const crewBySiteId = new Map<string, { name: string; color: string }>();
		for (const crew of crews) {
			const crewSites = await crewDb.getCrewJobSites(crew.id);
			for (const cs of crewSites) {
				crewBySiteId.set(cs.id, { name: crew.name, color: crew.color });
			}
		}

		// Group geometry by job site id.
		const waypointsBySite = new Map<string, RouteWaypoint[]>();
		for (const r of routesRes.results ?? []) {
			waypointsBySite.set(r.job_site_id, parseWaypoints(r.waypoints));
		}

		const sectionsBySite = new Map<string, MapRoadSection[]>();
		for (const s of sectionsRes.results ?? []) {
			const list = sectionsBySite.get(s.job_site_id) ?? [];
			list.push({
				id: s.id,
				name: s.name,
				status: s.status,
				geometry: s.geometry_geojson ? d1ToGeoJson(s.geometry_geojson) : null,
				segment_group: s.segment_group ?? null,
				treatment: s.treatment ?? null
			});
			sectionsBySite.set(s.job_site_id, list);
		}

		const eventsBySite = new Map<string, MapRoadwayLogEvent[]>();
		for (const e of eventsRes.results ?? []) {
			const list = eventsBySite.get(e.job_site_id) ?? [];
			list.push({
				id: e.id,
				milepost: e.milepost,
				station: e.station,
				event_type: e.event_type,
				description: e.description,
				roadway_width_ft: e.roadway_width_ft,
				is_reference: e.is_reference,
				coordinate_geojson: e.coordinate_geojson
			});
			eventsBySite.set(e.job_site_id, list);
		}

		// Route designation (used in popup) lives on job_site_config.
		const configsRes = await D1.prepare(
			`SELECT job_site_id, route_designation FROM job_site_config WHERE job_site_id IN (${placeholders})`
		)
			.bind(...ids)
			.all<{ job_site_id: string; route_designation: string | null }>();
		const routeDesignationBySite = new Map<string, string | null>();
		for (const c of configsRes.results ?? []) {
			routeDesignationBySite.set(c.job_site_id, c.route_designation);
		}

		const result: MapJobSite[] = jobSites.map((site) => {
			const waypoints = waypointsBySite.get(site.id) ?? [];
			const sections = sectionsBySite.get(site.id) ?? [];
			const events = eventsBySite.get(site.id) ?? [];
			const crew = crewBySiteId.get(site.id);
			const hasGeometry =
				waypoints.length >= 2 || sections.some((s) => s.geometry != null);

			return {
				id: site.id,
				name: site.name,
				status: site.status,
				latitude: site.latitude,
				longitude: site.longitude,
				location_description: site.location_description,
				gdot_county: site.gdot_county,
				route_designation: routeDesignationBySite.get(site.id) ?? null,
				crew_name: crew?.name ?? null,
				crew_color: crew?.color ?? null,
				waypoints,
				sections,
				roadway_log_events: events,
				has_geometry: hasGeometry
			};
		});

		return json({ job_sites: result });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Map job sites error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
