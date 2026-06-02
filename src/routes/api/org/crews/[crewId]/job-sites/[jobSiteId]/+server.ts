import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

// DELETE /api/org/crews/[crewId]/job-sites/[jobSiteId] - remove job site from crew
export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		// Only admin/owner can remove job sites from crews
		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const { crewId, jobSiteId } = event.params;
		await db.removeJobSiteFromCrew(crewId, jobSiteId);

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Remove job-site from crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
