import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import { canManage, requireAuth } from '$lib/server/auth';

async function loadSite(event: RequestEvent) {
	const user = await requireAuth(event);
	const db = new DbHelper(event.platform!.env.DB);
	const crewDb = new DbCrewHelper(event.platform!.env.DB);
	const org = await db.getOrgByUserId(user.id);
	if (!org) return { error: json({ error: 'Organization not found' }, { status: 404 }) };

	const jobSiteId = event.params.id;
	if (!jobSiteId) return { error: json({ error: 'Job site ID is required' }, { status: 400 }) };
	const jobSite = await db.getJobSiteById(jobSiteId);
	if (!jobSite || jobSite.org_id !== org.id) {
		return { error: json({ error: 'Job site not found' }, { status: 404 }) };
	}

	const role = await db.getUserRole(user.id, org.id);
	return { user, db, crewDb, org, jobSite, role: role ?? '' };
}

export async function GET(event: RequestEvent) {
	try {
		const loaded = await loadSite(event);
		if ('error' in loaded) return loaded.error;
		const { crewDb, org, jobSite } = loaded;

		const crews = await crewDb.listCrewsForJobSite(jobSite.id, org.id);
		const withMembers = await Promise.all(
			crews.map(async (crew) => ({
				...crew,
				members: await crewDb.getCrewMembers(crew.id)
			}))
		);
		return json({ crews: withMembers });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('List project crews error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent) {
	try {
		const loaded = await loadSite(event);
		if ('error' in loaded) return loaded.error;
		const { user, crewDb, org, jobSite, role } = loaded;
		if (!canManage(role)) {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const body = (await event.request.json()) as { crew_id?: string };
		const crewId = body.crew_id;
		if (!crewId) return json({ error: 'crew_id is required' }, { status: 400 });

		const crew = await crewDb.getCrew(crewId, org.id);
		if (!crew) return json({ error: 'Crew not found' }, { status: 404 });

		await crewDb.assignJobSiteToCrew(crew.id, jobSite.id, org.id, user.id);
		return json({ success: true }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Assign project crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE(event: RequestEvent) {
	try {
		const loaded = await loadSite(event);
		if ('error' in loaded) return loaded.error;
		const { crewDb, org, jobSite, role } = loaded;
		if (!canManage(role)) {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const crewId = event.url.searchParams.get('crew_id');
		if (!crewId) return json({ error: 'crew_id is required' }, { status: 400 });

		const crew = await crewDb.getCrew(crewId, org.id);
		if (!crew) return json({ error: 'Crew not found' }, { status: 404 });

		await crewDb.removeJobSiteFromCrew(crew.id, jobSite.id);
		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Remove project crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
