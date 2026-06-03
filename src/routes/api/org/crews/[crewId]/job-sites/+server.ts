import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

// GET /api/org/crews/[crewId]/job-sites - list job sites assigned to this crew
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const { crewId } = event.params;
		if (!crewId) return json({ error: 'Crew ID is required' }, { status: 400 });
		const jobSites = await db.getCrewJobSites(crewId);

		return json({ job_sites: jobSites });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get crew job-sites error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// POST /api/org/crews/[crewId]/job-sites - assign job site to this crew
export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		// Only admin/owner can assign job sites to crews
		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const { crewId } = event.params;
		if (!crewId) return json({ error: 'Crew ID is required' }, { status: 400 });
		const body = (await event.request.json()) as { job_site_id?: string };
		const { job_site_id } = body;

		if (!job_site_id) {
			return json({ error: 'job_site_id is required' }, { status: 400 });
		}

		// Verify job site belongs to this org
		const jobSite = await db.getJobSiteById(job_site_id);
		if (!jobSite || jobSite.org_id !== org.id) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		await db.assignJobSiteToCrew(crewId, job_site_id, org.id, user.id);

		return json({ success: true }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Assign job-site to crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
