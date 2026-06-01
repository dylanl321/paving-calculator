import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals, platform, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const logDb = new DbLogHelper(platform!.env.DB);

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');

	const logs = await logDb.listDailyLogs(params.id, limit, offset);

	return json({ logs });
};

export const POST: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const logDb = new DbLogHelper(platform!.env.DB);

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const today = new Date().toISOString().split('T')[0];

	const existing = await logDb.getDailyLog(params.id, today);
	if (existing) {
		return json({ log: existing });
	}

	const log = await logDb.createDailyLog(params.id, today, locals.user.id);

	return json({ log }, { status: 201 });
};
