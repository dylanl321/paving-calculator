import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
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

	await db.deleteJobSiteEquipment(params.equipId);

	return json({ success: true });
};
