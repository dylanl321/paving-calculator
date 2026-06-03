import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals, platform, request }) => {
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

	// Fetch equipment before deletion for audit
	const equipment = await platform!.env.DB
		.prepare('SELECT * FROM job_site_equipment WHERE id = ?')
		.bind(params.equipId)
		.first();

	await db.deleteJobSiteEquipment(params.equipId);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'equipment',
		resourceId: params.equipId,
		action: 'delete',
		oldValue: equipment || undefined,
		ipAddress:
			request.headers.get('cf-connecting-ip') ||
			request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: request.headers.get('user-agent') || undefined
	});

	return json({ success: true });
};
