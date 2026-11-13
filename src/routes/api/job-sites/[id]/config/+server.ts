import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { canEditProject } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { sanitizeJobSiteConfigInput } from '$lib/server/jobsite-config-input';
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

	const role = await db.getUserRole(locals.user.id, org.id);
	if (!canEditProject(role)) {
		throw error(403, 'Insufficient permissions');
	}

	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		throw error(400, 'Configuration body must be JSON');
	}
	const sanitized = sanitizeJobSiteConfigInput(parsed);
	if (!sanitized.ok) {
		throw error(400, sanitized.error);
	}
	const body = sanitized.value;

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
