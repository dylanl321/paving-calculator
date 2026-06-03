import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { getAuthUser } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		const user = await getAuthUser(event);
		if (!user) {
			return json({ user: null, org: null });
		}
		const db = new DbHelper(event.platform.env.DB);

		// Pull the full user row so the client gets verification state.
		const fullUser = await db.getUserById(user.id);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				isGlobalAdmin: user.isGlobalAdmin,
				email_verified: !!fullUser?.email_verified
			},
			org: {
				id: org.id,
				name: org.name,
				slug: org.slug,
				role
			}
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get user error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
