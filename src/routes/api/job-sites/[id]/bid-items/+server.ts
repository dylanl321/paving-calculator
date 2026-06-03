import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import type { RequestHandler } from './$types';

/**
 * GET /api/job-sites/:id/bid-items
 * Returns bid items, production mixes, and scope tags for a job site.
 */
export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const [bidItems, productionMixes] = await Promise.all([
		db.getBidItems(params.id),
		db.getProductionMixes(params.id)
	]);

	let scopes: string[] = [];
	if (jobSite.scopes_json) {
		try {
			scopes = JSON.parse(jobSite.scopes_json);
		} catch {
			scopes = [];
		}
	}

	return json({
		bid_items: bidItems,
		production_mixes: productionMixes,
		scopes,
		contract: {
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
			asphalt_supplier: jobSite.asphalt_supplier
		}
	});
};
