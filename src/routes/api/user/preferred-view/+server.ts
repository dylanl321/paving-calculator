import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

const ALLOWED_VIEWS = new Set(['field', 'full']);

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const body = (await event.request.json()) as { preferred_view?: string };
		const view = body.preferred_view;

		if (!view || !ALLOWED_VIEWS.has(view)) {
			return json({ error: 'preferred_view must be "field" or "full"' }, { status: 400 });
		}

		// Get the user's org to know which org_members row to update
		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'User is not a member of any organisation' }, { status: 404 });
		}

		await event.platform.env.DB
			.prepare('UPDATE org_members SET preferred_view = ? WHERE user_id = ? AND org_id = ?')
			.bind(view, user.id, org.id)
			.run();

		return json({ ok: true, preferred_view: view });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('PATCH preferred-view error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
