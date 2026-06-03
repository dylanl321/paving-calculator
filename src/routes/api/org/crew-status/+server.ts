import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import { requireAuth } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const logDb = new DbLogHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) return json({ error: 'Organization not found' }, { status: 404 });

		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden' }, { status: 403 });
		}

		const today = new Date().toISOString().split('T')[0];
		const crews = await db.listCrews(org.id);

		const crewStatuses = await Promise.all(
			crews.map(async (crew) => {
				const members = await db.getCrewMembers(crew.id);
				const jobSites = await db.getCrewJobSites(crew.id);

				const siteStatuses = await Promise.all(
					jobSites.map(async (site) => {
						const log = await logDb.getDailyLog(site.id, today);
						let todayTons = 0;
						let todayLoads = 0;
						let isActive = false;

						if (log) {
							const summary = await logDb.getLogSummary(log.id);
							todayTons = summary.total_tons;
							todayLoads = summary.total_loads;
							isActive = !log.closed_at;
						}

						return {
							id: site.id,
							name: site.name,
							status: site.status,
							location_description: site.location_description,
							today_log_open: isActive,
							today_tons: todayTons,
							today_loads: todayLoads,
							log_id: log?.id ?? null,
						};
					})
				);

				const activeSites = siteStatuses.filter((s) => s.today_log_open);

				return {
					id: crew.id,
					name: crew.name,
					color: crew.color,
					member_count: members.length,
					members: members.map((m) => ({ user_id: m.user_id, name: m.name, email: m.email })),
					site_count: jobSites.length,
					active_site_count: activeSites.length,
					sites: siteStatuses,
					today_tons_total: siteStatuses.reduce((s, x) => s + x.today_tons, 0),
					today_loads_total: siteStatuses.reduce((s, x) => s + x.today_loads, 0),
				};
			})
		);

		// Also get unassigned active job sites (active today but not in any crew)
		const allSites = await db.getJobSitesByOrgId(org.id);
		const assignedSiteIds = new Set(crewStatuses.flatMap((c) => c.sites.map((s) => s.id)));
		const unassignedActiveSites = await Promise.all(
			allSites
				.filter((s) => !assignedSiteIds.has(s.id))
				.map(async (site) => {
					const log = await logDb.getDailyLog(site.id, today);
					if (!log) return null;
					const summary = await logDb.getLogSummary(log.id);
					return {
						id: site.id,
						name: site.name,
						status: site.status,
						today_log_open: !log.closed_at,
						today_tons: summary.total_tons,
						today_loads: summary.total_loads,
						log_id: log.id,
					};
				})
		);

		const activeUnassigned = unassignedActiveSites.filter((s) => s !== null && s.today_log_open);

		return json({
			crews: crewStatuses,
			unassigned_active_sites: activeUnassigned,
			fetched_at: Math.floor(Date.now() / 1000),
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Crew status error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
