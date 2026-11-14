import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import { isFieldProjectRole } from '$lib/server/job-site-access';
import { crewConflicts, redactCrewWindow, type CrewWindow } from '$lib/plan-status';

interface WindowRow {
	crew_id: string;
	crew_name: string;
	job_site_id: string;
	job_name: string;
	start_date: string | null;
	end_date: string | null;
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) return json({ error: 'Database not available' }, { status: 503 });
		const db = new DbHelper(event.platform.env.DB);
		const id = event.params.id;
		if (!id) return json({ error: 'Job site ID is required' }, { status: 400 });
		const site = await db.getJobSiteById(id);
		const org = await db.getOrgByUserId(user.id);
		if (!site || !org || site.org_id !== org.id) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		const milestones = await db.milestones.getMilestones(id);
		let windows: CrewWindow[] = [];
		try {
			const rows = await event.platform.env.DB
				.prepare(
					`SELECT c.id AS crew_id, c.name AS crew_name, js.id AS job_site_id, js.name AS job_name,
					        cjs.start_date, cjs.end_date
					 FROM crew_job_sites cjs
					 JOIN crews c ON c.id = cjs.crew_id
					 JOIN job_sites js ON js.id = cjs.job_site_id
					 WHERE cjs.org_id = ?
					   AND cjs.crew_id IN (
					     SELECT crew_id FROM crew_job_sites WHERE job_site_id = ? AND org_id = ?
					   )`
				)
				.bind(org.id, id, org.id)
				.all<WindowRow>()
				.then((r) => r.results ?? []);
			windows = rows.map((row) => ({
				crewId: row.crew_id,
				crewName: row.crew_name,
				jobSiteId: row.job_site_id,
				jobName: row.job_name,
				start: row.start_date,
				end: row.end_date
			}));
		} catch (err) {
			console.error('Schedule windows unavailable:', err);
		}

		let weatherDays: string[] = [];
		try {
			const days = await event.platform.env.DB
				.prepare(
					`SELECT log_date FROM daily_logs
					 WHERE job_site_id = ? AND (weather_conditions = 'rain' OR is_raining = 1)
					 ORDER BY log_date ASC`
				)
				.bind(id)
				.all<{ log_date: string }>()
				.then((r) => r.results ?? []);
			weatherDays = days.map((day) => day.log_date);
		} catch {
			const days = await event.platform.env.DB
				.prepare(
					`SELECT log_date FROM daily_logs
					 WHERE job_site_id = ? AND weather_conditions = 'rain'
					 ORDER BY log_date ASC`
				)
				.bind(id)
				.all<{ log_date: string }>()
				.then((r) => r.results ?? []);
			weatherDays = days.map((day) => day.log_date);
		}

		const role = await db.getUserRole(user.id, org.id);
		const visibleSiteIds = isFieldProjectRole(role)
			? new Set((await new DbCrewHelper(event.platform.env.DB).getJobSitesByForeman(user.id, org.id)).map((job) => job.id))
			: null;
		const conflicts = crewConflicts(windows)
			.filter((conflict) => conflict.a.jobSiteId === id || conflict.b.jobSiteId === id)
			.map((conflict) => ({
				...conflict,
				a: redactCrewWindow(conflict.a, visibleSiteIds),
				b: redactCrewWindow(conflict.b, visibleSiteIds)
			}));
		return json({
			milestones,
			crews: windows.filter((window) => window.jobSiteId === id),
			conflicts,
			weatherDays
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Schedule error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
