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
		const members = await db.getOrgMembersByOrgId(org.id);

		return json({
			id: org.id,
			name: org.name,
			slug: org.slug,
			created_at: org.created_at,
			role,
			members
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get org error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
