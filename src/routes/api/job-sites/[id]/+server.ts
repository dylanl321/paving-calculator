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
			location_source: jobSite.location_source,
			location_precision: jobSite.location_precision,
			gdot_county: jobSite.gdot_county,
			gdot_district: jobSite.gdot_district,
			status: jobSite.status,
			job_number: jobSite.job_number,
			project_number: jobSite.project_number,
			contract_id: jobSite.contract_id,
			work_type: jobSite.work_type,
			contract_type: jobSite.contract_type,
			contract_amount: jobSite.contract_amount,
			retainage_pct: jobSite.retainage_pct,
			est_start_date: jobSite.est_start_date,
			completion_date: jobSite.completion_date,
			customer_name: jobSite.customer_name,
			customer_address: jobSite.customer_address,
			customer_contact: jobSite.customer_contact,
			customer_phone: jobSite.customer_phone,
			customer_email: jobSite.customer_email,
			owner_name: jobSite.owner_name,
			owner_address: jobSite.owner_address,
			project_manager: jobSite.project_manager,
			asphalt_supplier: jobSite.asphalt_supplier,
			scopes_json: jobSite.scopes_json,
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

		const updates: Partial<
			Pick<
				DbJobSite,
				| 'name'
				| 'location_description'
				| 'latitude'
				| 'longitude'
				| 'location_source'
				| 'location_precision'
				| 'status'
			>
		> = {};

		if (body.name !== undefined) updates.name = body.name;
		if (body.location_description !== undefined)
			updates.location_description = body.location_description;
		if (body.latitude !== undefined) updates.latitude = body.latitude;
		if (body.longitude !== undefined) updates.longitude = body.longitude;
		if (body.latitude !== undefined || body.longitude !== undefined) {
			const nextLat = body.latitude !== undefined ? body.latitude : jobSite.latitude;
			const nextLng = body.longitude !== undefined ? body.longitude : jobSite.longitude;
			updates.location_source = 'manual';
			updates.location_precision = nextLat != null && nextLng != null ? 'point' : 'none';
		}
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
			location_source: updatedJobSite!.location_source,
			location_precision: updatedJobSite!.location_precision,
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
