import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbJobSite } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

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
			latitude: jobSite.latitude,
			longitude: jobSite.longitude,
			gdot_county: jobSite.gdot_county,
			gdot_district: jobSite.gdot_district,
			status: jobSite.status,
			created_at: jobSite.created_at,
			updated_at: jobSite.updated_at
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get job site error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface UpdateJobSiteRequest {
	name?: string;
	location_description?: string;
	latitude?: number | null;
	longitude?: number | null;
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

		const updates: Partial<Pick<DbJobSite, 'name' | 'location_description' | 'latitude' | 'longitude' | 'status'>> = {};

		if (body.name !== undefined) updates.name = body.name;
		if (body.location_description !== undefined)
			updates.location_description = body.location_description;
		if (body.latitude !== undefined) updates.latitude = body.latitude;
		if (body.longitude !== undefined) updates.longitude = body.longitude;
		if (body.status !== undefined) {
			if (!['active', 'completed', 'archived'].includes(body.status)) {
				return json({ error: 'Invalid status' }, { status: 400 });
			}
			updates.status = body.status;
		}

		await db.updateJobSite(jobSiteId, updates);

		const updatedJobSite = await db.getJobSiteById(jobSiteId);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'job_site',
			resourceId: jobSiteId,
			action: 'updated',
			oldValue: {
				name: jobSite.name,
				location_description: jobSite.location_description,
				status: jobSite.status
			},
			newValue: {
				name: updatedJobSite!.name,
				location_description: updatedJobSite!.location_description,
				status: updatedJobSite!.status
			},
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({
			id: updatedJobSite!.id,
			org_id: updatedJobSite!.org_id,
			name: updatedJobSite!.name,
			location_description: updatedJobSite!.location_description,
			latitude: updatedJobSite!.latitude,
			longitude: updatedJobSite!.longitude,
			gdot_county: updatedJobSite!.gdot_county,
			gdot_district: updatedJobSite!.gdot_district,
			status: updatedJobSite!.status,
			created_at: updatedJobSite!.created_at,
			updated_at: updatedJobSite!.updated_at
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Update job site error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
