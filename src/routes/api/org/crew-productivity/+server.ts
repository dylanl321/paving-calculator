import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import { requireAuth } from '$lib/server/auth';

interface CrewProductivity {
	id: string;
	name: string;
	color: string;
	total_tons: number;
	total_loads: number;
	total_days: number;
	total_distance_ft: number;
	hours_worked: number;
	avg_tons_per_day: number;
	avg_crew_count: number;
	best_day_tons: number;
	member_count: number;
}

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

		const url = new URL(event.request.url);
		const endDateParam = url.searchParams.get('end_date');
		const startDateParam = url.searchParams.get('start_date');

		const endDate = endDateParam || new Date().toISOString().split('T')[0];
		const startDate =
			startDateParam ||
			new Date(new Date(endDate).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

		const crews = await db.listCrews(org.id);
		const allJobSites = await db.getJobSitesByOrgId(org.id);

		const crewProductivityList: CrewProductivity[] = await Promise.all(
			crews.map(async (crew) => {
				const members = await db.getCrewMembers(crew.id);
				const jobSites = await db.getCrewJobSites(crew.id);
				const jobSiteIds = jobSites.map((site) => site.id);

				let totalTons = 0;
				let totalLoads = 0;
				let totalDistanceFt = 0;
				let hoursWorked = 0;
				const dailyStats: Map<
					string,
					{ tons: number; crewCount: number | null; hasTime: boolean }
				> = new Map();

				for (const siteId of jobSiteIds) {
					const logs = await event.platform!.env.DB.prepare(
						`SELECT * FROM daily_logs
						WHERE job_site_id = ?
						AND log_date >= ?
						AND log_date <= ?`
					)
						.bind(siteId, startDate, endDate)
						.all<{
							id: string;
							log_date: string;
							crew_count: number | null;
							start_time: string | null;
							end_time: string | null;
						}>();

					for (const log of logs.results) {
						const entries = await event.platform!.env.DB.prepare(
							`SELECT tons_placed, loads_count, distance_ft
							FROM log_entries
							WHERE daily_log_id = ?`
						)
							.bind(log.id)
							.all<{ tons_placed: number | null; loads_count: number | null; distance_ft: number | null }>();

						let dayTons = 0;
						let dayLoads = 0;
						let dayDistance = 0;

						for (const entry of entries.results) {
							if (entry.tons_placed) {
								dayTons += entry.tons_placed;
								totalTons += entry.tons_placed;
							}
							if (entry.loads_count) {
								dayLoads += entry.loads_count;
								totalLoads += entry.loads_count;
							}
							if (entry.distance_ft) {
								dayDistance += entry.distance_ft;
								totalDistanceFt += entry.distance_ft;
							}
						}

						const key = log.log_date;
						const existing = dailyStats.get(key);
						if (existing) {
							existing.tons += dayTons;
							if (log.crew_count !== null) {
								existing.crewCount = log.crew_count;
							}
						} else {
							dailyStats.set(key, {
								tons: dayTons,
								crewCount: log.crew_count,
								hasTime: false
							});
						}

						if (log.start_time && log.end_time) {
							const [startHour, startMin] = log.start_time.split(':').map(Number);
							const [endHour, endMin] = log.end_time.split(':').map(Number);
							const hours = endHour + endMin / 60 - (startHour + startMin / 60);
							if (hours > 0) {
								hoursWorked += hours;
								const stats = dailyStats.get(key)!;
								stats.hasTime = true;
							}
						}
					}
				}

				const totalDays = dailyStats.size;
				const avgTonsPerDay = totalDays > 0 ? totalTons / totalDays : 0;

				let crewCountSum = 0;
				let crewCountCount = 0;
				for (const stats of dailyStats.values()) {
					if (stats.crewCount !== null) {
						crewCountSum += stats.crewCount;
						crewCountCount++;
					}
				}
				const avgCrewCount = crewCountCount > 0 ? crewCountSum / crewCountCount : 0;

				let bestDayTons = 0;
				for (const stats of dailyStats.values()) {
					if (stats.tons > bestDayTons) {
						bestDayTons = stats.tons;
					}
				}

				return {
					id: crew.id,
					name: crew.name,
					color: crew.color,
					total_tons: totalTons,
					total_loads: totalLoads,
					total_days: totalDays,
					total_distance_ft: totalDistanceFt,
					hours_worked: hoursWorked,
					avg_tons_per_day: avgTonsPerDay,
					avg_crew_count: avgCrewCount,
					best_day_tons: bestDayTons,
					member_count: members.length
				};
			})
		);

		const assignedSiteIds = new Set<string>();
		for (const crew of crews) {
			const sites = await db.getCrewJobSites(crew.id);
			for (const site of sites) {
				assignedSiteIds.add(site.id);
			}
		}

		const unassignedSiteIds = allJobSites
			.filter((site) => !assignedSiteIds.has(site.id))
			.map((site) => site.id);

		let unassignedTotalTons = 0;
		let unassignedTotalLoads = 0;
		let unassignedTotalDistanceFt = 0;
		let unassignedHoursWorked = 0;
		const unassignedDailyStats: Map<
			string,
			{ tons: number; crewCount: number | null; hasTime: boolean }
		> = new Map();

		for (const siteId of unassignedSiteIds) {
			const logs = await event.platform!.env.DB.prepare(
				`SELECT * FROM daily_logs
				WHERE job_site_id = ?
				AND log_date >= ?
				AND log_date <= ?`
			)
				.bind(siteId, startDate, endDate)
				.all<{
					id: string;
					log_date: string;
					crew_count: number | null;
					start_time: string | null;
					end_time: string | null;
				}>();

			for (const log of logs.results) {
				const entries = await event.platform!.env.DB.prepare(
					`SELECT tons_placed, loads_count, distance_ft
					FROM log_entries
					WHERE daily_log_id = ?`
				)
					.bind(log.id)
					.all<{ tons_placed: number | null; loads_count: number | null; distance_ft: number | null }>();

				let dayTons = 0;
				let dayLoads = 0;
				let dayDistance = 0;

				for (const entry of entries.results) {
					if (entry.tons_placed) {
						dayTons += entry.tons_placed;
						unassignedTotalTons += entry.tons_placed;
					}
					if (entry.loads_count) {
						dayLoads += entry.loads_count;
						unassignedTotalLoads += entry.loads_count;
					}
					if (entry.distance_ft) {
						dayDistance += entry.distance_ft;
						unassignedTotalDistanceFt += entry.distance_ft;
					}
				}

				const key = log.log_date;
				const existing = unassignedDailyStats.get(key);
				if (existing) {
					existing.tons += dayTons;
					if (log.crew_count !== null) {
						existing.crewCount = log.crew_count;
					}
				} else {
					unassignedDailyStats.set(key, {
						tons: dayTons,
						crewCount: log.crew_count,
						hasTime: false
					});
				}

				if (log.start_time && log.end_time) {
					const [startHour, startMin] = log.start_time.split(':').map(Number);
					const [endHour, endMin] = log.end_time.split(':').map(Number);
					const hours = endHour + endMin / 60 - (startHour + startMin / 60);
					if (hours > 0) {
						unassignedHoursWorked += hours;
						const stats = unassignedDailyStats.get(key)!;
						stats.hasTime = true;
					}
				}
			}
		}

		if (unassignedDailyStats.size > 0) {
			const unassignedTotalDays = unassignedDailyStats.size;
			const unassignedAvgTonsPerDay =
				unassignedTotalDays > 0 ? unassignedTotalTons / unassignedTotalDays : 0;

			let unassignedCrewCountSum = 0;
			let unassignedCrewCountCount = 0;
			for (const stats of unassignedDailyStats.values()) {
				if (stats.crewCount !== null) {
					unassignedCrewCountSum += stats.crewCount;
					unassignedCrewCountCount++;
				}
			}
			const unassignedAvgCrewCount =
				unassignedCrewCountCount > 0 ? unassignedCrewCountSum / unassignedCrewCountCount : 0;

			let unassignedBestDayTons = 0;
			for (const stats of unassignedDailyStats.values()) {
				if (stats.tons > unassignedBestDayTons) {
					unassignedBestDayTons = stats.tons;
				}
			}

			crewProductivityList.push({
				id: 'unassigned',
				name: 'Unassigned',
				color: 'slate',
				total_tons: unassignedTotalTons,
				total_loads: unassignedTotalLoads,
				total_days: unassignedTotalDays,
				total_distance_ft: unassignedTotalDistanceFt,
				hours_worked: unassignedHoursWorked,
				avg_tons_per_day: unassignedAvgTonsPerDay,
				avg_crew_count: unassignedAvgCrewCount,
				best_day_tons: unassignedBestDayTons,
				member_count: 0
			});
		}

		crewProductivityList.sort((a, b) => b.total_tons - a.total_tons);

		return json({
			crews: crewProductivityList,
			date_range: { start: startDate, end: endDate },
			fetched_at: Math.floor(Date.now() / 1000)
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Crew productivity error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
