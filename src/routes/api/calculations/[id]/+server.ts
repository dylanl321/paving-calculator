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

		const calculationId = event.params.id!;
		const calculation = await db.getCalculationById(calculationId);

		if (!calculation) {
			return json({ error: 'Calculation not found' }, { status: 404 });
		}

		const jobSite = await db.getJobSiteById(calculation.job_site_id);
		if (!jobSite || jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		return json({
			id: calculation.id,
			job_site_id: calculation.job_site_id,
			user_id: calculation.user_id,
			calc_type: calculation.calc_type,
			inputs: JSON.parse(calculation.inputs),
			result: JSON.parse(calculation.result),
			notes: calculation.notes,
			created_at: calculation.created_at
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get calculation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
