import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbMilestoneHelper } from '$lib/server/db-milestones';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

interface MilestoneUpdateBody {
	name?: string;
	description?: string | null;
	status?: string;
	target_date?: string | null;
	sort_order?: number;
	completed_at?: number | null;
}

export const PATCH: RequestHandler = async ({ params, locals, platform, request }) => {
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

	// Fetch old milestone before update for audit
	const oldMilestone = await platform!.env.DB
		.prepare('SELECT * FROM milestones WHERE id = ?')
		.bind(params.milestoneId)
		.first();

	const body = (await request.json()) as MilestoneUpdateBody;
	const { name, description, status, target_date, sort_order, completed_at } = body;

	const milestone = await milestoneDb.updateMilestone(params.milestoneId, {
		name,
		description,
		status,
		target_date,
		sort_order,
		completed_at
	});

	if (!milestone) {
		throw error(404, 'Milestone not found');
	}

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'milestone',
		resourceId: params.milestoneId,
		action: 'update',
		oldValue: oldMilestone || undefined,
		newValue: milestone,
		ipAddress:
			request.headers.get('cf-connecting-ip') ||
			request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: request.headers.get('user-agent') || undefined
	});

	return json({ milestone });
};

export const DELETE: RequestHandler = async ({ params, locals, platform, request }) => {
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

	// Fetch milestone before deletion for audit
	const milestone = await platform!.env.DB
		.prepare('SELECT * FROM milestones WHERE id = ?')
		.bind(params.milestoneId)
		.first();

	await milestoneDb.deleteMilestone(params.milestoneId);

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'milestone',
		resourceId: params.milestoneId,
		action: 'delete',
		oldValue: milestone || undefined,
		ipAddress:
			request.headers.get('cf-connecting-ip') ||
			request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: request.headers.get('user-agent') || undefined
	});

	return json({ success: true });
};
