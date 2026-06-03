import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import type { RequestHandler } from './$types';
import type { DbTruck } from '../+server';

interface TruckUpdateBody {
	status?: DbTruck['status'];
}

export const PATCH: RequestHandler = async ({ params, locals, platform, request }) => {
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

	const truck = await platform!.env.DB
		.prepare('SELECT * FROM truck_queue WHERE id = ? AND job_site_id = ?')
		.bind(params.truckId, params.id)
		.first<DbTruck>();

	if (!truck) {
		throw error(404, 'Truck not found');
	}

	const body = (await request.json()) as TruckUpdateBody;
	const now = Math.floor(Date.now() / 1000);

	if (body.status) {
		if (!['en_route', 'arrived', 'dismissed'].includes(body.status)) {
			throw error(400, 'Invalid status');
		}

		const arrivedAt = body.status === 'arrived' ? now : truck.arrived_at;

		await platform!.env.DB
			.prepare('UPDATE truck_queue SET status = ?, arrived_at = ?, updated_at = ? WHERE id = ?')
			.bind(body.status, arrivedAt, now, params.truckId)
			.run();

		const updatedTruck: DbTruck = {
			...truck,
			status: body.status,
			arrived_at: arrivedAt,
			updated_at: now
		};

		return json({ truck: updatedTruck });
	}

	return json({ truck });
};
