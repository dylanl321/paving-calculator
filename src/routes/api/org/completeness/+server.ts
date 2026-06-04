import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { scoreJobSite, type JobSiteCompletenessRow } from '$lib/server/completeness';

/**
 * GET /api/org/completeness
 *
 * Returns completeness scores for all job sites belonging to the caller's org.
 *
 * Query params:
 *   status          — filter by completeness status: complete | needs-attention | incomplete
 *   include_archived — include archived job sites (default: false)
 */
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const d1 = event.platform!.env.DB;

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const url = new URL(event.request.url);
		const statusFilter = url.searchParams.get('status') ?? null;
		const includeArchived = url.searchParams.get('include_archived') === 'true';

		// One SQL query with all the aggregates we need for scoring.
		const archivedClause = includeArchived ? '' : "AND js.status != 'archived'";

		const rows = await d1
			.prepare(
				`
				SELECT
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
					COALESCE(pm.mix_count, 0)         AS mix_count,
					COALESCE(jd.document_count, 0)   AS document_count,
					COALESCE(ms.milestone_count, 0)  AS milestone_count
				FROM job_sites js
				LEFT JOIN job_site_config jsc ON jsc.job_site_id = js.id
				LEFT JOIN (
					SELECT job_site_id, COUNT(*) AS daily_log_count
					FROM daily_logs
					GROUP BY job_site_id
				) dl ON dl.job_site_id = js.id
				LEFT JOIN (
					SELECT job_site_id, COUNT(*) AS bid_item_count
					FROM job_bid_items
					GROUP BY job_site_id
				) bi ON bi.job_site_id = js.id
				LEFT JOIN (
					SELECT job_site_id, COUNT(*) AS mix_count
					FROM job_production_mixes
					GROUP BY job_site_id
				) pm ON pm.job_site_id = js.id
				LEFT JOIN (
					SELECT job_site_id, COUNT(*) AS document_count
					FROM job_documents
					GROUP BY job_site_id
				) jd ON jd.job_site_id = js.id
				LEFT JOIN (
					SELECT job_site_id, COUNT(*) AS milestone_count
					FROM job_site_milestones
					GROUP BY job_site_id
				) ms ON ms.job_site_id = js.id
				WHERE js.org_id = ? ${archivedClause}
				ORDER BY js.name ASC
			`
			)
			.bind(org.id)
			.all<JobSiteCompletenessRow>()
			.then((r) => r.results);

		// Score each site
		const scoredSites = rows.map((row) => ({
			id: row.id,
			name: row.name ?? '',
			status: row.status ?? 'active',
			completeness: scoreJobSite(row)
		}));

		// Apply status filter if provided
		const filtered =
			statusFilter && ['complete', 'needs-attention', 'incomplete'].includes(statusFilter)
				? scoredSites.filter((s) => s.completeness.status === statusFilter)
				: scoredSites;

		// Sort: lowest score first (needs most attention), ties alpha by name
		filtered.sort((a, b) => {
			const diff = a.completeness.score - b.completeness.score;
			if (diff !== 0) return diff;
			return a.name.localeCompare(b.name);
		});

		// Summary counts
		const complete = scoredSites.filter((s) => s.completeness.status === 'complete').length;
		const needsAttention = scoredSites.filter(
			(s) => s.completeness.status === 'needs-attention'
		).length;
		const incomplete = scoredSites.filter((s) => s.completeness.status === 'incomplete').length;
		const avgScore =
			scoredSites.length > 0
				? Math.round(
						(scoredSites.reduce((sum, s) => sum + s.completeness.score, 0) /
							scoredSites.length) *
							10
					) / 10
				: 0;

		return json({
			org_id: org.id,
			computed_at: new Date().toISOString(),
			summary: {
				total_sites: scoredSites.length,
				complete,
				needs_attention: needsAttention,
				incomplete,
				avg_score: avgScore
			},
			sites: filtered
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Completeness GET error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
