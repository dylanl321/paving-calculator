import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org) {
		throw error(404, 'Organization not found');
	}

	const role = await db.getUserRole(locals.user.id, org.id);
	const isGlobalAdmin = locals.user.isGlobalAdmin ?? false;

	return json({ role, isGlobalAdmin });
};
