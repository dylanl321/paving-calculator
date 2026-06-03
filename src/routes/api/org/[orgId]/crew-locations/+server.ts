import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import type { DbCrewLocation } from '$lib/server/db';

const DEFAULT_STALE_SECONDS = 300; // 5 minutes

// GET /api/org/[orgId]/crew-locations - Get all crew locations for org
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const { orgId } = event.params;
		const db = event.platform!.env.DB;

		const jobSiteIdParam = event.url.searchParams.get('job_site_id');
		const staleSecondsParam = event.url.searchParams.get('stale_seconds');

		const jobSiteId = jobSiteIdParam ? parseInt(jobSiteIdParam, 10) : null;
		const staleSeconds = staleSecondsParam
			? parseInt(staleSecondsParam, 10)
			: DEFAULT_STALE_SECONDS;

		const now = Math.floor(Date.now() / 1000);
		const cutoff = now - staleSeconds;

		let query = `
      SELECT * FROM crew_locations
      WHERE org_id = ?
        AND updated_at >= ?
    `;
		const bindings: Array<string | number> = [orgId as string, cutoff];

		if (jobSiteId !== null && !isNaN(jobSiteId)) {
			query += ' AND job_site_id = ?';
			bindings.push(jobSiteId);
		}

		query += ' ORDER BY updated_at DESC';

		const result = await db.prepare(query).bind(...bindings).all<DbCrewLocation>();

		return json({ locations: result.results || [] });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get crew locations error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
