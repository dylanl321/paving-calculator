import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { loadPlanStatus } from '$lib/server/plan-query';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) return json({ error: 'Database not available' }, { status: 503 });
		const id = event.params.id;
		if (!id) return json({ error: 'Job site ID is required' }, { status: 400 });
		const db = new DbHelper(event.platform.env.DB);
		const site = await db.getJobSiteById(id);
		const org = await db.getOrgByUserId(user.id);
		if (!site || !org || site.org_id !== org.id) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}
		const status = await loadPlanStatus(event.platform.env.DB, id);
		if (!status) return json({ error: 'Job site not found' }, { status: 404 });
		return json({ status });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Plan status error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
