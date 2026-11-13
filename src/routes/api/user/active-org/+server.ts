import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);
		const body = (await event.request.json()) as { org_id?: string };
		const orgId = body.org_id;
		if (!orgId || typeof orgId !== 'string') {
			return json({ error: 'org_id is required' }, { status: 400 });
		}
		const role = await db.getUserRole(user.id, orgId);
		if (!role) {
			return json({ error: 'You are not a member of that organization' }, { status: 403 });
		}
		await db.setActiveOrg(user.id, orgId);
		const active = await db.getOrgByUserId(user.id);
		return json({ ok: true, active_org_id: active?.id ?? orgId });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Set active org error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
