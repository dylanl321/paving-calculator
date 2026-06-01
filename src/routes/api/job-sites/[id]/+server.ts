import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbJobSite } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		return json({
			id: jobSite.id,
			org_id: jobSite.org_id,
			name: jobSite.name,
			location_description: jobSite.location_description,
			status: jobSite.status,
			created_at: jobSite.created_at,
			updated_at: jobSite.updated_at
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get job site error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface UpdateJobSiteRequest {
	name?: string;
	location_description?: string;
	status?: 'active' | 'completed' | 'archived';
}

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const body: UpdateJobSiteRequest = await event.request.json();

		const updates: Partial<Pick<DbJobSite, 'name' | 'location_description' | 'status'>> = {};

		if (body.name !== undefined) updates.name = body.name;
		if (body.location_description !== undefined)
			updates.location_description = body.location_description;
		if (body.status !== undefined) {
			if (!['active', 'completed', 'archived'].includes(body.status)) {
				return json({ error: 'Invalid status' }, { status: 400 });
			}
			updates.status = body.status;
		}

		await db.updateJobSite(jobSiteId, updates);

		const updatedJobSite = await db.getJobSiteById(jobSiteId);

		return json({
			id: updatedJobSite!.id,
			org_id: updatedJobSite!.org_id,
			name: updatedJobSite!.name,
			location_description: updatedJobSite!.location_description,
			status: updatedJobSite!.status,
			created_at: updatedJobSite!.created_at,
			updated_at: updatedJobSite!.updated_at
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Update job site error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
