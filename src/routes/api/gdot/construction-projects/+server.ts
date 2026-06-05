/**
 * GET /api/gdot/construction-projects?county=CHEROKEE
 *
 * Returns GDOT active paving/construction projects for a given county
 * from the locally-ingested gdot_construction_projects table.
 * Authenticated users only (requires valid session).
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';

export async function GET(event: RequestEvent) {
	if (!event.platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 503 });
	}

	const county = event.url.searchParams.get('county');
	if (!county) {
		return json({ error: 'Missing county parameter' }, { status: 400 });
	}

	try {
		const db = new DbHelper(event.platform.env.DB);
		const projects = await db.getGdotConstructionProjectsByCounty(county, 10);

		return json(
			projects.map((p) => ({
				projectNumber: p.project_number,
				description: p.description,
				county: p.county,
				district: p.district,
				projectType: p.project_type,
				route: p.route,
				letDate: p.let_date,
				compDate: p.comp_date,
				latitude: p.latitude,
				longitude: p.longitude
			}))
		);
	} catch (err) {
		console.error('[api:gdot/construction-projects] Error:', err);
		return json({ error: 'Failed to fetch construction projects' }, { status: 500 });
	}
}
