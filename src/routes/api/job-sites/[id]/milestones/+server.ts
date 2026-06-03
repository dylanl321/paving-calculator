import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbMilestoneHelper } from '$lib/server/db-milestones';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

interface MilestoneCreateBody {
	name?: string;
	description?: string | null;
	status?: string;
	target_date?: string | null;
	sort_order?: number;
}

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const milestoneDb = new DbMilestoneHelper(platform!.env.DB);

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const milestones = await milestoneDb.getMilestones(params.id);

	return json({ milestones });
};

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const milestoneDb = new DbMilestoneHelper(platform!.env.DB);

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const body = (await request.json()) as MilestoneCreateBody;
	const { name, description, status, target_date, sort_order } = body;

	if (!name) {
		throw error(400, 'name is required');
	}

	const milestone = await milestoneDb.createMilestone(params.id, {
		name,
		description,
		status,
		target_date,
		sort_order
	});

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'milestone',
		resourceId: milestone.id,
		action: 'create',
		newValue: milestone,
		ipAddress:
			request.headers.get('cf-connecting-ip') ||
			request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: request.headers.get('user-agent') || undefined
	});

	return json({ milestone });
};
