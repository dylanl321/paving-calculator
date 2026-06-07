import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import type { DbJobSite } from '$lib/server/db-jobsites';
import { scoreJobSite, type JobSiteCompletenessRow } from '$lib/server/completeness';

/**
 * GET /api/org/portfolio
 *
 * Org-wide rollups computed server-side from EXISTING tables (job_sites,
 * job_site_config, job_production_mixes, daily_logs, log_entries). No schema
 * change. Powers the Owner portfolio command center + needs-attention views.
 *
 * Role scoping mirrors `GET /api/job-sites`: foreman/laborer see only their
 * crew's jobs; everyone else sees all org jobs.
 *
 * Best-effort: every sub-rollup is independently guarded — a failing sub-query
 * degrades that field to 0/empty rather than 500ing the whole endpoint.
 */

interface MixTotalsRow {
	job_site_id: string;
	bid_quantity_total: number | null;
	takeoff_tonnage_total: number | null;
}

interface PlacedTonsRow {
	job_site_id: string;
	tons_placed: number | null;
}

interface TodayLogRow {
	job_site_id: string;
	tons_today: number | null;
}

interface ConfigContractRow {
	job_site_id: string;
	total_contract_value: number | null;
}

interface SetupGap {
	id: string;
	name: string;
	missing: string[];
}

interface PortfolioJob {
	id: string;
	name: string;
	status: DbJobSite['status'];
	contract_value: number;
	tonnage_awarded: number;
	tonnage_target: number;
	tonnage_placed: number;
	progress_pct: number;
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const crewDb = new DbCrewHelper(event.platform!.env.DB);
		const d1 = event.platform!.env.DB;

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);

		// Role scoping mirrors GET /api/job-sites: foreman/laborer see only
		// their crew's jobs; everyone else sees all org jobs.
		let sites: DbJobSite[];
		if (role === 'foreman' || role === 'laborer') {
			sites = await crewDb.getJobSitesByForeman(user.id, org.id);
		} else {
			sites = await db.getJobSitesByOrgId(org.id);
		}

		const siteIds = sites.map((s) => s.id);
		const today = new Date().toISOString().split('T')[0];

		// SQLite parameter list for the scoped site set.
		const placeholders = siteIds.map(() => '?').join(', ');

		// ── Mix totals: awarded (bid_quantity) + target (takeoff_tonnage) ────
		const mixTotalsBySite = new Map<string, { awarded: number; target: number }>();
		if (siteIds.length > 0) {
			try {
				const rows = await d1
					.prepare(
						`SELECT job_site_id,
							SUM(bid_quantity)   AS bid_quantity_total,
							SUM(takeoff_tonnage) AS takeoff_tonnage_total
						 FROM job_production_mixes
						 WHERE job_site_id IN (${placeholders})
						 GROUP BY job_site_id`
					)
					.bind(...siteIds)
					.all<MixTotalsRow>()
					.then((r) => r.results ?? []);
				for (const row of rows) {
					mixTotalsBySite.set(row.job_site_id, {
						awarded: row.bid_quantity_total ?? 0,
						target: row.takeoff_tonnage_total ?? 0
					});
				}
			} catch (err) {
				console.error('Portfolio: mix totals query failed:', err);
			}
		}

		// ── Placed-to-date tonnage: SUM of real logged tons per job ──────────
		// Sums log_entries.tons_placed joined through daily_logs (the same
		// source LogSummary.total_tons sums), scoped to the org's job sites.
		const placedBySite = new Map<string, number>();
		if (siteIds.length > 0) {
			try {
				const rows = await d1
					.prepare(
						`SELECT dl.job_site_id AS job_site_id,
							SUM(le.tons_placed) AS tons_placed
						 FROM log_entries le
						 JOIN daily_logs dl ON dl.id = le.daily_log_id
						 WHERE dl.job_site_id IN (${placeholders})
						 GROUP BY dl.job_site_id`
					)
					.bind(...siteIds)
					.all<PlacedTonsRow>()
					.then((r) => r.results ?? []);
				for (const row of rows) {
					placedBySite.set(row.job_site_id, row.tons_placed ?? 0);
				}
			} catch (err) {
				console.error('Portfolio: placed tonnage query failed:', err);
			}
		}

		// ── Today: open logs + tons logged today ─────────────────────────────
		const todayTonsBySite = new Map<string, number>();
		let loggingToday = 0;
		let tonsToday = 0;
		if (siteIds.length > 0) {
			try {
				const rows = await d1
					.prepare(
						`SELECT dl.job_site_id AS job_site_id,
							SUM(le.tons_placed) AS tons_today
						 FROM daily_logs dl
						 LEFT JOIN log_entries le ON le.daily_log_id = dl.id
						 WHERE dl.job_site_id IN (${placeholders}) AND dl.log_date = ?
						 GROUP BY dl.job_site_id`
					)
					.bind(...siteIds, today)
					.all<TodayLogRow>()
					.then((r) => r.results ?? []);
				for (const row of rows) {
					loggingToday += 1;
					const tons = row.tons_today ?? 0;
					todayTonsBySite.set(row.job_site_id, tons);
					tonsToday += tons;
				}
			} catch (err) {
				console.error('Portfolio: today logs query failed:', err);
			}
		}

		// ── Config contract value per job (preferred over contract_amount) ───
		const configContractBySite = new Map<string, number | null>();
		if (siteIds.length > 0) {
			try {
				const rows = await d1
					.prepare(
						`SELECT job_site_id, total_contract_value
						 FROM job_site_config
						 WHERE job_site_id IN (${placeholders})`
					)
					.bind(...siteIds)
					.all<ConfigContractRow>()
					.then((r) => r.results ?? []);
				for (const row of rows) {
					configContractBySite.set(row.job_site_id, row.total_contract_value);
				}
			} catch (err) {
				console.error('Portfolio: config contract value query failed:', err);
			}
		}

		// ── Setup gaps: reuse the completeness scoring over the scoped sites ─
		const setupGaps: SetupGap[] = [];
		if (siteIds.length > 0) {
			try {
				const rows = await d1
					.prepare(
						`SELECT
							js.id,
							js.name,
							js.status,
							js.latitude,
							js.longitude,
							js.est_start_date,
							js.completion_date,
							js.customer_name,
							js.project_manager,
							js.job_number,
							jsc.road_type,
							jsc.num_lanes,
							jsc.lane_width_ft,
							jsc.total_length_ft,
							jsc.scope_of_work,
							jsc.mix_type,
							jsc.target_thickness_in,
							jsc.target_spread_rate,
							jsc.tack_type,
							jsc.target_tack_rate,
							jsc.num_lifts,
							jsc.total_tonnage,
							COALESCE(dl.daily_log_count, 0)  AS daily_log_count,
							COALESCE(bi.bid_item_count, 0)   AS bid_item_count,
							COALESCE(pm.mix_count, 0)        AS mix_count,
							COALESCE(jd.document_count, 0)   AS document_count,
							COALESCE(ms.milestone_count, 0)  AS milestone_count
						FROM job_sites js
						LEFT JOIN job_site_config jsc ON jsc.job_site_id = js.id
						LEFT JOIN (
							SELECT job_site_id, COUNT(*) AS daily_log_count
							FROM daily_logs GROUP BY job_site_id
						) dl ON dl.job_site_id = js.id
						LEFT JOIN (
							SELECT job_site_id, COUNT(*) AS bid_item_count
							FROM job_bid_items GROUP BY job_site_id
						) bi ON bi.job_site_id = js.id
						LEFT JOIN (
							SELECT job_site_id, COUNT(*) AS mix_count
							FROM job_production_mixes GROUP BY job_site_id
						) pm ON pm.job_site_id = js.id
						LEFT JOIN (
							SELECT job_site_id, COUNT(*) AS document_count
							FROM job_documents GROUP BY job_site_id
						) jd ON jd.job_site_id = js.id
						LEFT JOIN (
							SELECT job_site_id, COUNT(*) AS milestone_count
							FROM job_site_milestones GROUP BY job_site_id
						) ms ON ms.job_site_id = js.id
						WHERE js.id IN (${placeholders})`
					)
					.bind(...siteIds)
					.all<JobSiteCompletenessRow>()
					.then((r) => r.results ?? []);

				for (const row of rows) {
					if (row.status === 'archived') continue;
					const completeness = scoreJobSite(row);
					if (completeness.status !== 'complete') {
						setupGaps.push({
							id: row.id,
							name: row.name ?? '',
							missing: completeness.required.missing
						});
					}
				}
			} catch (err) {
				console.error('Portfolio: setup gaps query failed:', err);
			}
		}

		// ── Assemble per-job + org-wide aggregates ───────────────────────────
		let contractValueTotal = 0;
		let tonnageAwardedTotal = 0;
		let tonnageTargetTotal = 0;
		let tonnagePlacedTotal = 0;
		let activeProjects = 0;

		const perJob: PortfolioJob[] = sites.map((site) => {
			const configValue = configContractBySite.get(site.id);
			const contractValue =
				configValue != null && configValue > 0 ? configValue : (site.contract_amount ?? 0);

			const mix = mixTotalsBySite.get(site.id);
			const awarded = mix?.awarded ?? 0;
			const target = mix?.target ?? 0;
			const placed = placedBySite.get(site.id) ?? 0;

			// Progress against the best available denominator: target → awarded.
			const denom = target > 0 ? target : awarded;
			const progressPct =
				denom > 0 ? Math.min(100, Math.round((placed / denom) * 1000) / 10) : 0;

			contractValueTotal += contractValue;
			tonnageAwardedTotal += awarded;
			tonnageTargetTotal += target;
			tonnagePlacedTotal += placed;
			if (site.status === 'active') activeProjects += 1;

			return {
				id: site.id,
				name: site.name,
				status: site.status,
				contract_value: contractValue,
				tonnage_awarded: awarded,
				tonnage_target: target,
				tonnage_placed: placed,
				progress_pct: progressPct
			};
		});

		return json({
			org_id: org.id,
			computed_at: new Date().toISOString(),
			contract_value_total: contractValueTotal,
			tonnage_awarded_total: tonnageAwardedTotal,
			tonnage_target_total: tonnageTargetTotal,
			tonnage_placed_total: tonnagePlacedTotal,
			counts: {
				active_projects: activeProjects,
				total_projects: sites.length,
				logging_today: loggingToday,
				tons_today: tonsToday
			},
			setup_gaps: setupGaps,
			per_job: perJob
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Portfolio endpoint error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
