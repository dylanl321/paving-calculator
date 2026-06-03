import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

interface LogEntry {
	station_start: number | null;
	station_end: number | null;
	tons_placed: number | null;
	log_date: string | null;
}

interface GeoJSONLineString {
	type: 'LineString';
	coordinates: [number, number][];
}

interface ProgressResponse {
	geometry: GeoJSONLineString | null;
	logEntries: LogEntry[];
	totalLengthFt: number | null;
	today: string;
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Get route geometry from job_site_routes
		const route = await db.getJobSiteRoute(jobSiteId);
		let geometry: GeoJSONLineString | null = null;

		if (route && route.waypoints) {
			try {
				const waypoints = JSON.parse(route.waypoints) as Array<{ lat: number; lng: number }>;
				if (waypoints.length >= 2) {
					// Convert waypoints to GeoJSON LineString
					geometry = {
						type: 'LineString',
						coordinates: waypoints.map((wp) => [wp.lng, wp.lat])
					};
				}
			} catch {
				// Invalid JSON, leave geometry as null
			}
		}

		// Get log entries with station data
		const result = await event.platform!.env.DB.prepare(
			`SELECT le.station_start, le.station_end, le.tons_placed, dl.log_date
			FROM log_entries le
			JOIN daily_logs dl ON le.daily_log_id = dl.id
			WHERE dl.job_site_id = ?
			AND le.entry_type = 'paving'
			AND le.station_start IS NOT NULL
			AND le.station_end IS NOT NULL
			ORDER BY dl.log_date ASC, le.created_at ASC`
		)
			.bind(jobSiteId)
			.all<LogEntry>();

		const logEntries = result.results || [];

		// Get total planned length from config
		const config = await db.getJobSiteConfig(jobSiteId);
		const totalLengthFt = config?.total_length_ft ?? null;

		// Get today's date in YYYY-MM-DD format
		const today = new Date().toISOString().split('T')[0];

		const response: ProgressResponse = {
			geometry,
			logEntries,
			totalLengthFt,
			today
		};

		return json(response);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get progress error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
