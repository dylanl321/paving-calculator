import { error, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';

// GET: streams a schematic image from R2 after verifying the caller's org owns
// the parent job site.
export async function GET(event: RequestEvent) {
	if (!event.locals.user) throw error(401, 'Unauthorized');
	if (!event.platform?.env?.DB || !event.platform?.env?.ASSETS_BUCKET) {
		throw error(503, 'Storage not available');
	}
	const db = new DbHelper(event.platform.env.DB);

	const jobSite = await db.getJobSiteById(event.params.id!);
	if (!jobSite) throw error(404, 'Job site not found');
	const org = await db.getOrgByUserId(event.locals.user.id);
	if (!org || org.id !== jobSite.org_id) throw error(403, 'Access denied');

	const schematic = await db.getSchematic(event.params.schematicId!);
	if (!schematic || schematic.job_site_id !== jobSite.id) throw error(404, 'Not found');

	const object = await event.platform.env.ASSETS_BUCKET.get(schematic.r2_key);
	if (!object) throw error(404, 'Image not found');

	return new Response(object.body, {
		headers: {
			'Content-Type': schematic.content_type,
			'Cache-Control': 'private, max-age=3600',
			ETag: object.httpEtag
		}
	});
}
