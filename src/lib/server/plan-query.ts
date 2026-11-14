import type { D1Database } from '../../cloudflare';
import { DbHelper } from '$lib/server/db';
import { assessPlan, type PlanStatus } from '$lib/plan-status';

interface TonsRow {
	tons: number | null;
}
interface FeetRow {
	feet: number | null;
}
interface WeatherRow {
	days: number | null;
}

export async function loadPlanStatus(db: D1Database, jobSiteId: string, asOf?: string): Promise<PlanStatus | null> {
	const helper = new DbHelper(db);
	const site = await helper.getJobSiteById(jobSiteId);
	if (!site) return null;
	const config = await helper.getJobSiteConfig(jobSiteId);
	const today = asOf ?? new Date().toISOString().slice(0, 10);

	const tons = await db
		.prepare(
			`SELECT SUM(le.tons_placed) AS tons
			 FROM log_entries le
			 JOIN daily_logs dl ON dl.id = le.daily_log_id
			 WHERE dl.job_site_id = ? AND le.tons_placed IS NOT NULL`
		)
		.bind(jobSiteId)
		.first<TonsRow>();

	const feet = await db
		.prepare(
			`SELECT SUM(
				CASE
					WHEN le.distance_ft IS NOT NULL AND le.distance_ft > 0 THEN le.distance_ft
					WHEN le.station_start IS NOT NULL AND le.station_end IS NOT NULL
						THEN ABS(le.station_end - le.station_start) * 100
					ELSE 0
				END
			) AS feet
			 FROM log_entries le
			 JOIN daily_logs dl ON dl.id = le.daily_log_id
			 WHERE dl.job_site_id = ?`
		)
		.bind(jobSiteId)
		.first<FeetRow>();

	let weatherDays = 0;
	if (site.est_start_date) {
		try {
			const weather = await db
				.prepare(
					`SELECT COUNT(*) AS days FROM daily_logs
					 WHERE job_site_id = ?
					   AND log_date >= ? AND log_date <= ?
					   AND (weather_conditions = 'rain' OR is_raining = 1)`
				)
				.bind(jobSiteId, site.est_start_date, today)
				.first<WeatherRow>();
			weatherDays = weather?.days ?? 0;
		} catch {
			const weather = await db
				.prepare(
					`SELECT COUNT(*) AS days FROM daily_logs
					 WHERE job_site_id = ? AND log_date >= ? AND log_date <= ? AND weather_conditions = 'rain'`
				)
				.bind(jobSiteId, site.est_start_date, today)
				.first<WeatherRow>();
			weatherDays = weather?.days ?? 0;
		}
	}

	return assessPlan({
		plannedTons: config?.total_tonnage ?? null,
		placedTons: tons?.tons ?? 0,
		totalLengthFt: config?.total_length_ft ?? null,
		pavedFt: feet?.feet ?? 0,
		laneWidthFt: config?.lane_width_ft ?? null,
		numLanes: config?.num_lanes ?? null,
		targetSpreadLbsSy: config?.target_spread_rate ?? null,
		startDate: site.est_start_date ?? null,
		endDate: site.completion_date ?? null,
		asOf: today,
		weatherDays
	});
}
