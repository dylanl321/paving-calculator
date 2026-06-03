import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import type { RequestHandler } from './$types';

export interface DbTruck {
	id: string;
	job_site_id: string;
	truck_number: string;
	estimated_tons: number | null;
	departure_time: number;
	travel_time_minutes: number;
	status: 'en_route' | 'arrived' | 'dismissed';
	arrived_at: number | null;
	created_by: string;
	created_at: number;
	updated_at: number;
}

interface TruckRequestBody {
	truck_number?: string;
	estimated_tons?: number | null;
	departure_time?: number;
	travel_time_minutes?: number;
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

	const status = url.searchParams.get('status') || 'en_route';

	const trucks = await platform!.env.DB
		.prepare('SELECT * FROM truck_queue WHERE job_site_id = ? AND status = ? ORDER BY departure_time ASC')
		.bind(params.id, status)
		.all<DbTruck>()
		.then((r) => r.results);

	return json({ trucks });
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

	const body = (await request.json()) as TruckRequestBody;

	if (!body.truck_number || typeof body.truck_number !== 'string') {
		throw error(400, 'Truck number is required');
	}

	if (typeof body.departure_time !== 'number' || body.departure_time <= 0) {
		throw error(400, 'Valid departure time is required');
	}

	if (typeof body.travel_time_minutes !== 'number' || body.travel_time_minutes <= 0) {
		throw error(400, 'Valid travel time is required');
	}

	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);

	await platform!.env.DB
		.prepare(
			'INSERT INTO truck_queue (id, job_site_id, truck_number, estimated_tons, departure_time, travel_time_minutes, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.bind(
			id,
			params.id,
			body.truck_number,
			body.estimated_tons || null,
			body.departure_time,
			body.travel_time_minutes,
			'en_route',
			locals.user.id,
			now,
			now
		)
		.run();

	const truck: DbTruck = {
		id,
		job_site_id: params.id,
		truck_number: body.truck_number,
		estimated_tons: body.estimated_tons || null,
		departure_time: body.departure_time,
		travel_time_minutes: body.travel_time_minutes,
		status: 'en_route',
		arrived_at: null,
		created_by: locals.user.id,
		created_at: now,
		updated_at: now
	};

	return json({ truck }, { status: 201 });
};
