import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

const ALLOWED_VIEWS = new Set(['field', 'full']);
const ALLOWED_UNITS = new Set(['imperial', 'metric']);

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const body = (await event.request.json()) as {
			preferred_view?: string;
			units?: string;
		};

		const view = body.preferred_view;
		const units = body.units;

		if (view !== undefined && !ALLOWED_VIEWS.has(view)) {
			return json({ error: 'preferred_view must be "field" or "full"' }, { status: 400 });
		}

		if (units !== undefined && !ALLOWED_UNITS.has(units)) {
			return json({ error: 'units must be "imperial" or "metric"' }, { status: 400 });
		}

		if (view === undefined && units === undefined) {
			return json({ error: 'At least one of preferred_view or units must be provided' }, { status: 400 });
		}

		// Get the user's org to know which org_members row to update
		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'User is not a member of any organisation' }, { status: 404 });
		}

		const updates: string[] = [];
		const bindings: unknown[] = [];

		if (view !== undefined) {
			updates.push('preferred_view = ?');
			bindings.push(view);
		}

		if (units !== undefined) {
			updates.push('preferred_units = ?');
			bindings.push(units);
		}

		bindings.push(user.id, org.id);

		await event.platform.env.DB
			.prepare(`UPDATE org_members SET ${updates.join(', ')} WHERE user_id = ? AND org_id = ?`)
			.bind(...bindings)
			.run();

		return json({ ok: true, preferred_view: view, units });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('PATCH preferred-view error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
