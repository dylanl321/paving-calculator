import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { deliverWebhook } from '$lib/server/webhooks';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);

		// Foreman: only sees job sites assigned to their crew
		// Laborer: only sees job sites assigned to their crew (same as foreman scope)
		// Admin/Owner/others: sees all job sites
		let jobSites;
		if (role === 'foreman' || role === 'laborer') {
			jobSites = await db.getJobSitesByForeman(user.id, org.id);
		} else {
			jobSites = await db.getJobSitesByOrgId(org.id);
		}

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
		if (error instanceof Response) return error;
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

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'job_site',
			resourceId: jobSite.id,
			action: 'created',
			newValue: {
				name: jobSite.name,
				location_description: jobSite.location_description,
				status: jobSite.status
			},
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		// Fire webhook event (fire and forget)
		void deliverWebhook(event.platform!.env.DB, {
			type: 'job_site.created',
			orgId: org.id,
			payload: {
				job_site_id: jobSite.id,
				name: jobSite.name,
				org_id: org.id
			},
			occurredAt: jobSite.created_at
		});

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
		if (error instanceof Response) return error;
		console.error('Create job site error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
