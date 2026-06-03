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
		const allSites = await db.getJobSitesByOrgId(org.id);
		const crews = await db.listCrews(org.id);

		// Build crew lookup map
		const crewBySiteId = new Map<string, { name: string; color: string }>();
		for (const crew of crews) {
			const sites = await db.getCrewJobSites(crew.id);
			for (const site of sites) {
				crewBySiteId.set(site.id, { name: crew.name, color: crew.color });
			}
		}

		// Filter sites with coordinates and build response
		const mapSites = await Promise.all(
			allSites
				.filter((s) => s.latitude != null && s.longitude != null)
				.map(async (site) => {
					const log = await logDb.getDailyLog(site.id, today);
					let todayTons = 0;
					let todayLoads = 0;
					let todayLogOpen = false;
					let logId: string | null = null;

					if (log) {
						const summary = await logDb.getLogSummary(log.id);
						todayTons = summary.total_tons;
						todayLoads = summary.total_loads;
						todayLogOpen = !log.closed_at;
						logId = log.id;
					}

					// Determine site status for map display
					let mapStatus: 'logging' | 'active' | 'paused' | 'completed' | 'archived';
					if (todayLogOpen) {
						mapStatus = 'logging';
					} else if (site.status === 'active') {
						mapStatus = 'active';
					} else if (site.status === 'completed') {
						mapStatus = 'completed';
					} else if (site.status === 'archived') {
						mapStatus = 'archived';
					} else {
						mapStatus = 'paused';
					}

					const crew = crewBySiteId.get(site.id);

					return {
						id: site.id,
						name: site.name,
						status: mapStatus,
						latitude: site.latitude as number,
						longitude: site.longitude as number,
						location_description: site.location_description,
						today_tons: todayTons,
						today_loads: todayLoads,
						today_log_open: todayLogOpen,
						log_id: logId,
						crew_name: crew?.name ?? null,
						crew_color: crew?.color ?? null,
					};
				})
		);

		return json({
			sites: mapSites,
			fetched_at: Math.floor(Date.now() / 1000),
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Map sites error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
