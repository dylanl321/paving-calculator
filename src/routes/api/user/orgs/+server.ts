import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);
		const orgs = await db.listUserOrgs(user.id);
		const active = await db.getOrgByUserId(user.id);
		return json({
			orgs,
			active_org_id: active?.id ?? null
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('List user orgs error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
