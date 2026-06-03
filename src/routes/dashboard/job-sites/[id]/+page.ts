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
	location_description: string | null;
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
interface MilestonesResponse {
	milestones?: Milestone[];
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

		const [calcRes, configRes, equipmentRes, assignmentsRes, routeRes, milestonesRes] = await Promise.all([
			fetch(`/api/calculations?job_site_id=${params.id}`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/config`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/equipment`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/assignments`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/route`, { credentials: 'include' }),
			fetch(`/api/job-sites/${params.id}/milestones`, { credentials: 'include' })
		]);

		if (!calcRes.ok) {
			throw error(calcRes.status, 'Failed to load calculations');
		}

		const calcData = (await calcRes.json()) as CalculationsResponse;
		const configData = (configRes.ok ? await configRes.json() : { config: null }) as ConfigResponse;
		const equipmentData = (equipmentRes.ok ? await equipmentRes.json() : { equipment: [] }) as EquipmentResponse;
		const assignmentsData = (assignmentsRes.ok ? await assignmentsRes.json() : { assignments: [] }) as AssignmentsResponse;
		const routeData = (routeRes.ok ? await routeRes.json() : { waypoints: [] }) as RouteResponse;
		const milestonesData = (milestonesRes.ok ? await milestonesRes.json() : { milestones: [] }) as MilestonesResponse;

		return {
			user: authData.user,
			org: authData.org,
			jobSite: siteData,
			calculations: calcData.calculations || [],
			config: configData.config,
			equipment: equipmentData.equipment || [],
			assignments: assignmentsData.assignments || [],
			routeWaypoints: routeData.waypoints || [],
			milestones: milestonesData.milestones || []
		};
	} catch (err) {
		// Re-throw SvelteKit errors/redirects; do not swallow real load failures
		throw err;
	}
};
