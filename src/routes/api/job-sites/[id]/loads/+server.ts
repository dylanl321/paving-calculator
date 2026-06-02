import { json, error } from '@sveltejs/kit';
import { DbHelper, type DbLoad } from '$lib/server/db';
import type { RequestHandler } from './$types';

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

	let query = 'SELECT * FROM loads WHERE job_site_id = ?';
	const bindings: unknown[] = [params.id];

	if (startDate) {
		const startTs = Math.floor(new Date(startDate).getTime() / 1000);
		query += ' AND timestamp >= ?';
		bindings.push(startTs);
	}

	query += ' ORDER BY timestamp DESC LIMIT ?';
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

	const body = await request.json();

	if (typeof body.tons !== 'number' || body.tons <= 0) {
		throw error(400, 'Tons must be a positive number');
	}

	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const timestamp = typeof body.timestamp === 'number' ? body.timestamp : now;

	await platform!.env.DB
		.prepare(
			'INSERT INTO loads (id, job_site_id, user_id, ticket_number, tons, timestamp, spread_rate, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
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
		created_at: now
	};

	return json({ load }, { status: 201 });
};
