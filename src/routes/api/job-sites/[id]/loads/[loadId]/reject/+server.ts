import { json, error } from '@sveltejs/kit';
import { DbHelper, type DbLoad } from '$lib/server/db';
import type { RequestHandler } from './$types';

const VALID_REASONS = [
	'temp_too_low',
	'temp_too_high',
	'wrong_mix',
	'contaminated',
	'overloaded',
	'underweight',
	'damaged_in_transit',
	'other'
] as const;

interface RejectRequestBody {
	reason?: (typeof VALID_REASONS)[number];
	notes?: string | null;
}

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);

	const load = await platform!.env.DB
		.prepare('SELECT * FROM loads WHERE id = ?')
		.bind(params.loadId)
		.first<DbLoad>();

	if (!load) {
		throw error(404, 'Load not found');
	}

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite || jobSite.id !== load.job_site_id) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const body = (await request.json()) as RejectRequestBody;

	if (!body.reason || !VALID_REASONS.includes(body.reason)) {
		throw error(400, 'Invalid rejection reason');
	}

	const now = Math.floor(Date.now() / 1000);
	const rejectionId = crypto.randomUUID();

	await platform!.env.DB
		.prepare(
			'INSERT INTO load_rejections (id, load_id, reason, notes, rejected_by, rejected_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(
			rejectionId,
			params.loadId,
			body.reason,
			body.notes || null,
			locals.user.id,
			now
		)
		.run();

	await platform!.env.DB
		.prepare(
			'UPDATE loads SET rejected = 1, rejection_reason = ?, rejection_notes = ? WHERE id = ?'
		)
		.bind(body.reason, body.notes || null, params.loadId)
		.run();

	const updatedLoad = await platform!.env.DB
		.prepare('SELECT * FROM loads WHERE id = ?')
		.bind(params.loadId)
		.first<DbLoad>();

	return json({ load: updatedLoad });
};

export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);

	const load = await platform!.env.DB
		.prepare('SELECT * FROM loads WHERE id = ?')
		.bind(params.loadId)
		.first<DbLoad>();

	if (!load) {
		throw error(404, 'Load not found');
	}

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite || jobSite.id !== load.job_site_id) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	await platform!.env.DB
		.prepare('UPDATE loads SET rejected = 0, rejection_reason = NULL, rejection_notes = NULL WHERE id = ?')
		.bind(params.loadId)
		.run();

	const updatedLoad = await platform!.env.DB
		.prepare('SELECT * FROM loads WHERE id = ?')
		.bind(params.loadId)
		.first<DbLoad>();

	return json({ load: updatedLoad });
};
