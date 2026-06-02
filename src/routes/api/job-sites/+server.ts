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

		const jobSites = await db.getJobSitesByOrgId(org.id);

		return json({
			job_sites: jobSites.map((site) => ({
				id: site.id,
				org_id: site.org_id,
				name: site.name,
				location_description: site.location_description,
				latitude: site.latitude,
				longitude: site.longitude,
				status: site.status,
				created_at: site.created_at,
				updated_at: site.updated_at
			}))
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get job sites error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface CreateJobSiteRequest {
	name: string;
	location_description?: string;
	latitude?: number;
	longitude?: number;
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const body: CreateJobSiteRequest = await event.request.json();

		if (!body.name) {
			return json({ error: 'Job site name is required' }, { status: 400 });
		}

		const jobSite = await db.createJobSite(
			org.id,
			body.name,
			body.location_description || null,
			body.latitude ?? null,
			body.longitude ?? null
		);

		return json({
			id: jobSite.id,
			org_id: jobSite.org_id,
			name: jobSite.name,
			location_description: jobSite.location_description,
			latitude: jobSite.latitude,
			longitude: jobSite.longitude,
			status: jobSite.status,
			created_at: jobSite.created_at,
			updated_at: jobSite.updated_at
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Create job site error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
