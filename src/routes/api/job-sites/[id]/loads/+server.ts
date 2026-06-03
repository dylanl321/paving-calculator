import { json, error } from '@sveltejs/kit';
import { DbHelper, type DbLoad } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

interface LoadRequestBody {
	tons?: number;
	lane_number?: number | null;
	pass_number?: number | null;
	timestamp?: number;
	ticket_number?: string | null;
	spread_rate?: number | null;
	notes?: string | null;
}

export const GET: RequestHandler = async ({ params, locals, platform, url }) => {
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

	const limit = parseInt(url.searchParams.get('limit') || '100');
	const startDate = url.searchParams.get('start_date');
	const endDate = url.searchParams.get('end_date');

	let query = 'SELECT * FROM loads WHERE job_site_id = ?';
	const bindings: unknown[] = [params.id];

	if (startDate) {
		const startTs = Math.floor(new Date(startDate + 'T00:00:00').getTime() / 1000);
		query += ' AND timestamp >= ?';
		bindings.push(startTs);
	}

	if (endDate) {
		// end of day: next day midnight minus 1
		const endTs = Math.floor(new Date(endDate + 'T00:00:00').getTime() / 1000) + 86400 - 1;
		query += ' AND timestamp <= ?';
		bindings.push(endTs);
	}

	query += ' ORDER BY timestamp ASC LIMIT ?';
	bindings.push(limit);

	const loads = await platform!.env.DB
		.prepare(query)
		.bind(...bindings)
		.all<DbLoad>()
		.then((r) => r.results);

	return json({ loads });
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

	const body = (await request.json()) as LoadRequestBody;

	if (typeof body.tons !== 'number' || body.tons <= 0) {
		throw error(400, 'Tons must be a positive number');
	}

	if (body.lane_number !== undefined && body.lane_number !== null) {
		if (typeof body.lane_number !== 'number' || body.lane_number <= 0 || !Number.isInteger(body.lane_number)) {
			throw error(400, 'Lane number must be a positive integer');
		}
	}

	if (body.pass_number !== undefined && body.pass_number !== null) {
		if (typeof body.pass_number !== 'number' || body.pass_number <= 0 || !Number.isInteger(body.pass_number)) {
			throw error(400, 'Pass number must be a positive integer');
		}
	}

	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const timestamp = typeof body.timestamp === 'number' ? body.timestamp : now;

	await platform!.env.DB
		.prepare(
			'INSERT INTO loads (id, job_site_id, user_id, ticket_number, tons, timestamp, spread_rate, notes, lane_number, pass_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(
			id,
			params.id,
			locals.user.id,
			body.ticket_number || null,
			body.tons,
			timestamp,
			body.spread_rate || null,
			body.notes || null,
			body.lane_number || null,
			body.pass_number || null,
			now
		)
		.run();

	const load: DbLoad = {
		id,
		job_site_id: params.id,
		user_id: locals.user.id,
		ticket_number: body.ticket_number || null,
		tons: body.tons,
		timestamp,
		spread_rate: body.spread_rate || null,
		notes: body.notes || null,
		lane_number: body.lane_number || null,
		pass_number: body.pass_number || null,
		created_at: now,
		rejected: 0,
		rejection_reason: null,
		rejection_notes: null,
		ticket_photo_id: null
	};

	await recordAudit(platform!.env.DB, {
		actorUserId: locals.user.id,
		actorName: locals.user.name,
		orgId: org.id,
		resourceType: 'load',
		resourceId: id,
		action: 'create',
		newValue: load,
		ipAddress:
			request.headers.get('cf-connecting-ip') ||
			request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: request.headers.get('user-agent') || undefined
	});

	return json({ load }, { status: 201 });
};
