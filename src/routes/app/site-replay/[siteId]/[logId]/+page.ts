import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

interface JobSite {
	id: string;
	name: string;
	status: string;
	latitude: number | null;
	longitude: number | null;
	location_description?: string | null;
}

interface Waypoint {
	lat: number;
	lng: number;
}

interface DailyLog {
	id: string;
	log_date: string;
	job_site_id: string;
	created_by: string;
	weather_temp_f: number | null;
	weather_conditions: string | null;
	wind_speed_mph: number | null;
	crew_count: number | null;
	start_time: string | null;
	end_time: string | null;
	notes: string | null;
	target_tons: number | null;
	target_loads: number | null;
	plant_name: string | null;
	mix_type: string | null;
	closed_at: number | null;
	foreman_name: string | null;
	created_at: number;
	updated_at: number;
}

interface LogResponse {
	log: DailyLog;
	entries: unknown[];
	summary: unknown;
	densityReadings: unknown[];
}

interface RouteResponse {
	waypoints?: Waypoint[];
}

export const load: PageLoad = async ({ params, fetch }) => {
	try {
		// Load job site
		const siteRes = await fetch(`/api/job-sites/${params.siteId}`, { credentials: 'include' });
		if (!siteRes.ok) {
			if (siteRes.status === 404) throw error(404, 'Job site not found');
			throw error(siteRes.status, 'Failed to load job site');
		}
		const site = (await siteRes.json()) as JobSite;

		// Load route waypoints
		const routeRes = await fetch(`/api/job-sites/${params.siteId}/route`, {
			credentials: 'include'
		});
		const routeData = (routeRes.ok ? await routeRes.json() : { waypoints: [] }) as RouteResponse;
		const waypoints = routeData.waypoints || [];

		// Load log info
		const logRes = await fetch(`/api/job-sites/${params.siteId}/logs/${params.logId}`, {
			credentials: 'include'
		});
		if (!logRes.ok) {
			if (logRes.status === 404) throw error(404, 'Log not found');
			throw error(logRes.status, 'Failed to load log');
		}
		const logData = (await logRes.json()) as LogResponse;
		const log = logData.log;

		return {
			site,
			waypoints,
			log
		};
	} catch (err) {
		throw err;
	}
};
