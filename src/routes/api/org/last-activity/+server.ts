import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

/**
 * GET /api/org/last-activity
 *
 * Returns the most recent daily_logs.created_at per job site for the caller's org.
 * Used by the dashboard to sort sites by last activity (most recently active first).
 *
 * Response: { sites: Array<{ id: string; last_activity: number | null }> }
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

		// One query: latest daily_log created_at per job site within the org.
		// daily_logs has job_site_id; job_sites has org_id.
		const rows = await d1
			.prepare(
				`SELECT dl.job_site_id AS id, MAX(dl.created_at) AS last_activity
				 FROM daily_logs dl
				 JOIN job_sites js ON js.id = dl.job_site_id
				 WHERE js.org_id = ?
				 GROUP BY dl.job_site_id`
			)
			.bind(org.id)
			.all<{ id: string; last_activity: number | null }>();

		return json({ sites: rows.results ?? [] });
	} catch (err) {
		if (err instanceof Response) return err;
		console.error('Last-activity endpoint error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
