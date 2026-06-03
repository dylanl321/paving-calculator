import { json, error } from '@sveltejs/kit';
import { DbHelper, type DbProductionMix } from '$lib/server/db';
import type { RequestHandler } from './$types';

async function authorizeMix(
	locals: App.Locals,
	platform: App.Platform | undefined,
	jobSiteId: string,
	mixId: string
) {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = new DbHelper(platform!.env.DB);
	const jobSite = await db.getJobSiteById(jobSiteId);
	if (!jobSite) throw error(404, 'Job site not found');
	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) throw error(403, 'Access denied');
	const mix = await db.getProductionMix(mixId);
	if (!mix || mix.job_site_id !== jobSiteId) throw error(404, 'Mix not found');
	return db;
}

type MixUpdate = Partial<Omit<DbProductionMix, 'id' | 'job_site_id' | 'created_at'>>;

export const PATCH: RequestHandler = async ({ params, locals, platform, request }) => {
	const db = await authorizeMix(locals, platform, params.id, params.mixId);
	const body = (await request.json()) as MixUpdate;
	await db.updateProductionMix(params.mixId, body);
	const mix = await db.getProductionMix(params.mixId);
	return json({ mix });
};

// PUT marks this mix as the active (currently-placing) mix for the job.
export const PUT: RequestHandler = async ({ params, locals, platform }) => {
	const db = await authorizeMix(locals, platform, params.id, params.mixId);
	await db.setActiveMix(params.id, params.mixId);
	const mixes = await db.getProductionMixes(params.id);
	return json({ mixes });
};

export const DELETE: RequestHandler = async ({ params, locals, platform }) => {
	const db = await authorizeMix(locals, platform, params.id, params.mixId);
	const wasActive = (await db.getProductionMix(params.mixId))?.is_active === 1;
	await db.deleteProductionMix(params.mixId);

	// If we removed the active mix, promote the first remaining mix.
	if (wasActive) {
		const remaining = await db.getProductionMixes(params.id);
		if (remaining.length > 0) {
			await db.setActiveMix(params.id, remaining[0].id);
		}
	}

	return json({ success: true });
};
