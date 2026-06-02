import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbCalculation } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.url.searchParams.get('job_site_id');
		const limitParam = event.url.searchParams.get('limit');
		const limit = limitParam ? parseInt(limitParam, 10) : 50;

		let calculations: DbCalculation[];

		if (jobSiteId) {
			const jobSite = await db.getJobSiteById(jobSiteId);
			if (!jobSite) {
				return json({ error: 'Job site not found' }, { status: 404 });
			}
			if (jobSite.org_id !== org.id) {
				return json({ error: 'Unauthorized' }, { status: 403 });
			}

			calculations = await db.getCalculations({ jobSiteId, limit });
		} else {
			const userRole = await db.getUserRole(user.id, org.id);
			if (userRole === 'owner' || userRole === 'admin') {
				const jobSites = await db.getJobSitesByOrgId(org.id);
				calculations = [];
				for (const site of jobSites) {
					const siteCalcs = await db.getCalculations({ jobSiteId: site.id, limit });
					calculations.push(...siteCalcs);
				}
				calculations.sort((a, b) => b.created_at - a.created_at);
				calculations = calculations.slice(0, limit);
			} else {
				calculations = await db.getCalculations({ userId: user.id, limit });
			}
		}

		return json({
			calculations: calculations.map((calc) => ({
				id: calc.id,
				job_site_id: calc.job_site_id,
				user_id: calc.user_id,
				calc_type: calc.calc_type,
				inputs: JSON.parse(calc.inputs),
				result: JSON.parse(calc.result),
				notes: calc.notes,
				created_at: calc.created_at
			}))
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get calculations error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface CreateCalculationRequest {
	job_site_id: string;
	calc_type: 'spread_rate' | 'feet_left' | 'tonnage' | 'tack_rate' | 'stick_check';
	inputs: object;
	result: object;
	notes?: string;
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const body: CreateCalculationRequest = await event.request.json();

		if (!body.job_site_id || !body.calc_type || !body.inputs || !body.result) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		const validCalcTypes = ['spread_rate', 'feet_left', 'tonnage', 'tack_rate', 'stick_check'];
		if (!validCalcTypes.includes(body.calc_type)) {
			return json({ error: 'Invalid calc_type' }, { status: 400 });
		}

		const jobSite = await db.getJobSiteById(body.job_site_id);
		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const calculation = await db.createCalculation(
			body.job_site_id,
			user.id,
			body.calc_type,
			body.inputs,
			body.result,
			body.notes || null
		);

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
		if (error instanceof Response) throw error;
		console.error('Create calculation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
