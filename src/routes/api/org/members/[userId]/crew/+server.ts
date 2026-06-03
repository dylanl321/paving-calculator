import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		// Check if user is admin or owner
		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const { userId } = event.params;
		if (!userId) return json({ error: 'User ID is required' }, { status: 400 });
		const body = (await event.request.json()) as { crew_id?: string | null };
		const { crew_id } = body;

		if (crew_id === null || crew_id === undefined || crew_id === '') {
			// Remove member from crew
			await db.removeCrewMember(userId, org.id);
		} else {
			// Assign member to crew
			await db.setCrewMember(crew_id, userId, org.id);
		}

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Update member crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
