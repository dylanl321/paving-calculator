import { json, error } from '@sveltejs/kit';
import { DbHelper, type DbJobSiteConfig } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

type ConfigRequestBody = Partial<Omit<DbJobSiteConfig, 'job_site_id' | 'created_at' | 'updated_at'>>;

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

	const body = (await request.json()) as ConfigRequestBody;

	// Fetch old config for audit
	const oldConfig = await db.getJobSiteConfig(params.id);

	await db.upsertJobSiteConfig(params.id, body);

	const config = await db.getJobSiteConfig(params.id);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'job_site_config',
		resourceId: params.id,
		action: oldConfig ? 'update' : 'create',
		oldValue: oldConfig || undefined,
		newValue: config,
		ipAddress:
			request.headers.get('cf-connecting-ip') ||
			request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: request.headers.get('user-agent') || undefined
	});

	return json({ config });
};
