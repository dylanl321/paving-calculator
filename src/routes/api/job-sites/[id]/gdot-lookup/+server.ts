import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { lookupGdotBoundaries } from '$lib/server/gdot-boundaries';

export async function POST(event: RequestEvent) {
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

		if (jobSite.latitude == null || jobSite.longitude == null) {
			return json({ error: 'Job site coordinates not set' }, { status: 400 });
		}

		const { county, district } = await lookupGdotBoundaries(
			jobSite.latitude,
			jobSite.longitude
		);

		await db.updateJobSite(jobSiteId, {
			gdot_county: county,
			gdot_district: district
		});

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'job_site',
			resourceId: jobSiteId,
			action: 'gdot_lookup_updated',
			oldValue: {
				gdot_county: jobSite.gdot_county,
				gdot_district: jobSite.gdot_district
			},
			newValue: {
				gdot_county: county,
				gdot_district: district
			},
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({
			county,
			district
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('GDOT lookup error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
