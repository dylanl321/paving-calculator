import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import { isFieldProjectRole } from '$lib/server/job-site-access';
import { loadPlanStatus } from '$lib/server/plan-query';

/** Active projects with pace, for the org home. */
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) return json({ error: 'Database not available' }, { status: 503 });
		const db = new DbHelper(event.platform.env.DB);
		const crewDb = new DbCrewHelper(event.platform.env.DB);
		const org = await db.getOrgByUserId(user.id);
		if (!org) return json({ error: 'Organization not found' }, { status: 404 });
		const role = await db.getUserRole(user.id, org.id);
		const sites = isFieldProjectRole(role)
			? await crewDb.getJobSitesByForeman(user.id, org.id)
			: await db.getJobSitesByOrgId(org.id);
		const active = sites.filter((site) => site.status === 'active');
		const projects = (
			await Promise.all(
				active.map(async (site) => {
					const status = await loadPlanStatus(event.platform!.env.DB, site.id);
					if (!status) return null;
					return {
						id: site.id,
						name: site.name,
						pace: status.pace,
						tonsPct: status.tonsPct,
						lengthPct: status.lengthPct,
						tonsRemaining: status.tonsRemaining,
						daysRemaining: status.daysRemaining,
						weatherDays: status.weatherDays
					};
				})
			)
		).filter((row) => row != null);
		const behind = projects.filter((p) => p.pace === 'behind').length;
		const ahead = projects.filter((p) => p.pace === 'ahead').length;
		return json({ projects, behind, ahead, active: projects.length });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Org plan status error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
