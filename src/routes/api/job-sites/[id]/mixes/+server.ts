import { json, error } from '@sveltejs/kit';
import { DbHelper, type DbProductionMix } from '$lib/server/db';
import type { RequestHandler } from './$types';

async function authorize(locals: App.Locals, platform: App.Platform | undefined, jobSiteId: string) {
	if (!locals.user) throw error(401, 'Unauthorized');
	const db = new DbHelper(platform!.env.DB);
	const jobSite = await db.getJobSiteById(jobSiteId);
	if (!jobSite) throw error(404, 'Job site not found');
	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) throw error(403, 'Access denied');
	return db;
}

type MixBody = Partial<Omit<DbProductionMix, 'id' | 'job_site_id' | 'created_at'>>;

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	const db = await authorize(locals, platform, params.id);
	const mixes = await db.getProductionMixes(params.id);
	return json({ mixes });
};

export const POST: RequestHandler = async ({ params, locals, platform, request }) => {
	const db = await authorize(locals, platform, params.id);
	const body = (await request.json()) as MixBody;

	if (!body.mix_name || !body.mix_name.trim()) {
		return json({ error: 'Mix name is required' }, { status: 400 });
	}

	const existing = await db.getProductionMixes(params.id);
	const makeActive = existing.length === 0; // first mix is active by default

	const mix = await db.createProductionMix(params.id, {
		mix_name: body.mix_name.trim(),
		unit: body.unit ?? 'TN',
		bid_quantity: body.bid_quantity ?? null,
		takeoff_tonnage: body.takeoff_tonnage ?? null,
		quantity_per_day: body.quantity_per_day ?? null,
		est_days: body.est_days ?? null,
		mix_type: body.mix_type ?? null,
		target_thickness_in: body.target_thickness_in ?? null,
		target_spread_rate: body.target_spread_rate ?? null,
		tack_type: body.tack_type ?? null,
		target_tack_rate: body.target_tack_rate ?? null,
		is_active: makeActive ? 1 : 0,
		sort_order: existing.length
	});

	return json({ mix });
};
