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

		const members = await db.getOrgMembersByOrgId(org.id);

		return json({
			members: members.map((m) => ({
				user_id: m.user_id,
				name: m.user_name,
				email: m.user_email,
				role: m.role,
				invited_at: m.invited_at,
				accepted_at: m.accepted_at
			}))
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get members error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
