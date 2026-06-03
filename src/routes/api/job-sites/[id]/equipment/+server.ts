import { json, error } from '@sveltejs/kit';
import { DbHelper, type DbJobSiteEquipment } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

interface EquipmentRequestBody {
	equipment_type?: DbJobSiteEquipment['equipment_type'];
	name?: string;
	capacity?: string | null;
	notes?: string | null;
}

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

	const equipment = await db.getJobSiteEquipment(params.id);

	return json({ equipment });
};

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
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

	const body = (await request.json()) as EquipmentRequestBody;
	const { equipment_type, name, capacity, notes } = body;

	if (!equipment_type || !name) {
		throw error(400, 'equipment_type and name are required');
	}

	const equipment = await db.createJobSiteEquipment(
		params.id,
		equipment_type,
		name,
		capacity || null,
		notes || null
	);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'equipment',
		resourceId: equipment.id,
		action: 'create',
		newValue: equipment,
		ipAddress:
			request.headers.get('cf-connecting-ip') ||
			request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: request.headers.get('user-agent') || undefined
	});

	return json({ equipment });
};
