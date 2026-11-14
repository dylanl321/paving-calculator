import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import { requireAuth } from '$lib/server/auth';

// DELETE /api/org/crews/[crewId]/job-sites/[jobSiteId] - remove job site from crew
export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const crewDb = new DbCrewHelper(event.platform!.env.DB);

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
		if (!crewId || !jobSiteId) {
			return json({ error: 'Crew ID and job site ID are required' }, { status: 400 });
		}
		const crew = await crewDb.getCrew(crewId, org.id);
		if (!crew) {
			return json({ error: 'Crew not found' }, { status: 404 });
		}
		const jobSite = await db.getJobSiteById(jobSiteId);
		if (!jobSite || jobSite.org_id !== org.id) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}
		await crewDb.removeJobSiteFromCrew(crewId, jobSiteId);

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Remove job-site from crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const crewDb = new DbCrewHelper(event.platform!.env.DB);
		const org = await db.getOrgByUserId(user.id);
		if (!org) return json({ error: 'Organization not found' }, { status: 404 });
		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}
		const { crewId, jobSiteId } = event.params;
		if (!crewId || !jobSiteId) {
			return json({ error: 'Crew ID and job site ID are required' }, { status: 400 });
		}
		const crew = await crewDb.getCrew(crewId, org.id);
		if (!crew) return json({ error: 'Crew not found' }, { status: 404 });
		const jobSite = await db.getJobSiteById(jobSiteId);
		if (!jobSite || jobSite.org_id !== org.id) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}
		const body = (await event.request.json()) as { start_date?: string | null; end_date?: string | null };
		const start = body.start_date ?? null;
		const end = body.end_date ?? null;
		if ((start && !ISO.test(start)) || (end && !ISO.test(end))) {
			return json({ error: 'Dates must be YYYY-MM-DD' }, { status: 400 });
		}
		if (start && end && end < start) {
			return json({ error: 'End date is before the start date' }, { status: 400 });
		}
		await crewDb.setCrewJobWindow(crewId, jobSiteId, org.id, start, end);
		return json({ success: true, start_date: start, end_date: end });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Update crew schedule error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
