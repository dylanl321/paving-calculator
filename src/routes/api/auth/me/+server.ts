import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

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
				isGlobalAdmin: user.isGlobalAdmin
			},
			org: {
				id: org.id,
				name: org.name,
				slug: org.slug,
				role
			}
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get user error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
