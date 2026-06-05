import { redirect, error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

interface AuthUser {
	id: string;
	email: string;
	name: string;
	isGlobalAdmin?: boolean;
}

interface AuthOrg {
	id: string;
	name: string;
	slug: string;
	role: string;
}

interface AuthResponse {
	user: AuthUser | null;
	org: AuthOrg | null;
}

export interface JobSite {
	id: string;
	org_id: string;
	name: string;
	status: string;
	latitude: number | null;
	longitude: number | null;
	location_source?: string | null;
	location_precision?: 'route' | 'point' | 'county' | 'none' | string | null;
	location_description: string | null;
	gdot_county?: string | null;
	gdot_district?: string | null;
}

export interface JobSiteConfig {
	road_type: string | null;
	num_lanes: number | null;
	lane_width_ft: number | null;
	total_length_ft: number | null;
	scope_of_work: string | null;
	mix_type: string | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	tack_type: string | null;
	target_tack_rate: number | null;
	notes: string | null;
	route_designation: string | null;
	route_county: string | null;
	route_district: string | null;
	route_functional_class: string | null;
	route_system_code: string | null;
	begin_terminus: string | null;
	end_terminus: string | null;
	begin_station: number | null;
	end_station: number | null;
	num_lifts: number | null;
	total_tonnage: number | null;
	cost_per_ton: number | null;
	cost_per_sy: number | null;
	cost_per_mile: number | null;
	total_contract_value: number | null;
}

export interface Calculation {
	id: string;
	calc_type: string;
	result: Record<string, number | undefined>;
	notes?: string | null;
	created_at: number;
}

export interface Equipment {
	id: string;
	equipment_type: string;
	name: string;
	capacity?: string | null;
	notes?: string | null;
}

export interface Assignment {
	user_name: string;
	role: string;
}

export interface Milestone {
	id: string;
	name: string;
	description?: string | null;
	status: 'pending' | 'in_progress' | 'completed';
	target_date?: string | null;
}

export interface RouteWaypoint {
	lat: number;
	lng: number;
}

export interface RoadwayLogEvent {
	id: string;
	source_key: string | null;
	page_number: number | null;
	milepost: number;
	station: number;
	event_type:
		| 'project_start'
		| 'project_end'
		| 'operation_change'
		| 'width_change'
		| 'side_road'
		| 'reference'
		| 'note';
	description: string;
	roadway_width_ft: number | null;
	side: 'left' | 'right' | null;
	surface: 'paved' | 'unpaved' | null;
	is_reference: number;
	confidence: 'high' | 'medium' | 'low';
	raw_text: string | null;
	coordinate_geojson: string | null;
	sort_order: number;
}

interface CalculationsResponse {
	calculations?: Calculation[];
}
interface ConfigResponse {
	config: JobSiteConfig | null;
}
interface EquipmentResponse {
	equipment?: Equipment[];
}
interface AssignmentsResponse {
	assignments?: Assignment[];
}
interface RouteResponse {
	waypoints?: RouteWaypoint[];
}
interface RoadwayLogEventsResponse {
	events?: RoadwayLogEvent[];
}

interface CountyBoundary {
	county: string;
	centroid: { lat: number; lng: number };
	bounds: [[number, number], [number, number]];
	geojson: {
		type: 'Feature';
		properties?: { county?: string };
		geometry: { type: 'Polygon'; coordinates: number[][][] };
	};
}
interface MilestonesResponse {
	milestones?: Milestone[];
}

export interface ProductionMix {
	id: string;
	mix_name: string;
	unit: string | null;
	bid_quantity: number | null;
	takeoff_tonnage: number | null;
	quantity_per_day: number | null;
	est_days: number | null;
	mix_type: string | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	tack_type: string | null;
	target_tack_rate: number | null;
	contract_unit_price: number | null;
	is_active: number;
	sort_order: number;
}

interface MixesResponse {
	mixes?: ProductionMix[];
}

export const load: PageLoad = async ({ params, fetch }) => {
	try {
		const authRes = await fetch('/api/auth/me', { credentials: 'include' });
		if (!authRes.ok) {
			throw redirect(302, '/login');
		}

		const authData = (await authRes.json()) as AuthResponse;

		const siteRes = await fetch(`/api/job-sites/${params.id}`, { credentials: 'include' });
		if (!siteRes.ok) {
			if (siteRes.status === 404) {
				throw error(404, 'Job site not found');
			}
			throw error(siteRes.status, 'Failed to load job site');
		}

		const siteData = (await siteRes.json()) as JobSite;

		const [calcRes, configRes, equipmentRes, assignmentsRes, routeRes, roadwayLogRes, milestonesRes, mixesRes] = await Promise.all([
			fetch(`/api/calculations?job_site_id=${params.id}`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/config`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/equipment`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/assignments`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/route`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/roadway-log-events`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/milestones`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/mixes`, { credentials: 'include' })
		]);

		if (!calcRes.ok) {
			throw error(calcRes.status, 'Failed to load calculations');
		}

		const calcData = (await calcRes.json()) as CalculationsResponse;
		const configData = (configRes.ok ? await configRes.json() : { config: null }) as ConfigResponse;
		const equipmentData = (equipmentRes.ok ? await equipmentRes.json() : { equipment: [] }) as EquipmentResponse;
		const assignmentsData = (assignmentsRes.ok ? await assignmentsRes.json() : { assignments: [] }) as AssignmentsResponse;
		const routeData = (routeRes.ok ? await routeRes.json() : { waypoints: [] }) as RouteResponse;
		const roadwayLogData = (roadwayLogRes.ok ? await roadwayLogRes.json() : { events: [] }) as RoadwayLogEventsResponse;
		const milestonesData = (milestonesRes.ok ? await milestonesRes.json() : { milestones: [] }) as MilestonesResponse;
		const mixesData = (mixesRes.ok ? await mixesRes.json() : { mixes: [] }) as MixesResponse;
		const routeWaypoints = routeData.waypoints || [];
		let countyBoundary: CountyBoundary | null = null;
		if (siteData.gdot_county && routeWaypoints.length < 2) {
			const countyRes = await fetch(
				`/api/gdot/county-boundary?county=${encodeURIComponent(siteData.gdot_county)}`,
				{ credentials: 'include' }
			);
			if (countyRes.ok) {
				countyBoundary = (await countyRes.json()) as CountyBoundary;
			}
		}

		const mixes = mixesData.mixes || [];
		const activeMix = mixes.find((m) => m.is_active === 1) ?? mixes[0] ?? null;

		// Overlay the active mix's paving spec onto the config so the calculators,
		// targets, and overview reflect the mix currently being placed. The stored
		// job_site_config is not mutated — this is a read-time merge only.
		let config = configData.config;
		if (config && activeMix) {
			config = {
				...config,
				mix_type: activeMix.mix_type ?? activeMix.mix_name ?? config.mix_type,
				target_thickness_in: activeMix.target_thickness_in ?? config.target_thickness_in,
				target_spread_rate: activeMix.target_spread_rate ?? config.target_spread_rate,
				tack_type: (activeMix.tack_type as JobSiteConfig['tack_type']) ?? config.tack_type,
				target_tack_rate: activeMix.target_tack_rate ?? config.target_tack_rate,
				total_tonnage:
					mixes.reduce((sum, m) => sum + (m.takeoff_tonnage ?? 0), 0) || config.total_tonnage
			};
		}

		return {
			user: authData.user,
			org: authData.org,
			jobSite: siteData,
			calculations: calcData.calculations || [],
			config,
			equipment: equipmentData.equipment || [],
			assignments: assignmentsData.assignments || [],
			routeWaypoints,
			roadwayLogEvents: roadwayLogData.events || [],
			milestones: milestonesData.milestones || [],
			mixes,
			activeMix,
			countyBoundary
		};
	} catch (err) {
		// Re-throw SvelteKit errors/redirects; do not swallow real load failures
		throw err;
	}
};
