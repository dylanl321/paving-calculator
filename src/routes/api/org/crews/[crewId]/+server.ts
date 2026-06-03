import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export async function DELETE(event: RequestEvent) {
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

		const { crewId } = event.params;
		if (!crewId) return json({ error: 'Crew ID is required' }, { status: 400 });
		await db.deleteCrew(crewId);

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Delete crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
