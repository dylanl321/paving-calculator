import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import type { RequestHandler } from './$types';

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

	const config = await db.getJobSiteConfig(params.id);

	return json({ config });
};

export const PUT: RequestHandler = async ({ params, locals, platform, request }) => {
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

	const body = await request.json();

	await db.upsertJobSiteConfig(params.id, body);

	const config = await db.getJobSiteConfig(params.id);

	return json({ config });
};
