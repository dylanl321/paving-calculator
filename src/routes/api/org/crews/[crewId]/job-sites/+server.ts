import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import { requireAuth } from '$lib/server/auth';
import { notifyOrg, quietSender } from '$lib/server/notify';

// GET /api/org/crews/[crewId]/job-sites - list job sites assigned to this crew
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const crewDb = new DbCrewHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const { crewId } = event.params;
		if (!crewId) return json({ error: 'Crew ID is required' }, { status: 400 });
		const crew = await crewDb.getCrew(crewId, org.id);
		if (!crew) {
			return json({ error: 'Crew not found' }, { status: 404 });
		}
		const jobSites = await crewDb.getCrewJobSites(crewId);

		return json({ job_sites: jobSites });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get crew job-sites error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// POST /api/org/crews/[crewId]/job-sites - assign job site to this crew
export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const crewDb = new DbCrewHelper(event.platform!.env.DB);

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
		const crew = await crewDb.getCrew(crewId, org.id);
		if (!crew) {
			return json({ error: 'Crew not found' }, { status: 404 });
		}
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

		await crewDb.assignJobSiteToCrew(crewId, job_site_id, org.id, user.id);

		try {
			const members = await crewDb.getCrewMembers(crewId);
			const crew = await crewDb.getCrew(crewId, org.id);
			await notifyOrg(
				event.platform!.env.DB,
				{
					orgId: org.id,
					eventKey: `crew_assigned:${crewId}:${job_site_id}`,
					eventType: 'crew_assigned',
					subject: `Crew assigned: ${jobSite.name}`,
					text: `${crew?.name ?? 'A crew'} is assigned to ${jobSite.name}.`,
					onlyUserIds: members.map((member) => member.user_id)
				},
				quietSender
			);
		} catch (err) {
			console.error('crew assign notice failed:', err);
		}

		return json({ success: true }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Assign job-site to crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
