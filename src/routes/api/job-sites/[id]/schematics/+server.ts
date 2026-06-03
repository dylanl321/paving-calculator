import { json, error, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB per rendered page

async function authorize(event: RequestEvent, jobSiteId: string) {
	if (!event.locals.user) throw error(401, 'Unauthorized');
	if (!event.platform?.env?.DB || !event.platform?.env?.ASSETS_BUCKET) {
		throw error(503, 'Storage not available');
	}
	const db = new DbHelper(event.platform.env.DB);
	const jobSite = await db.getJobSiteById(jobSiteId);
	if (!jobSite) throw error(404, 'Job site not found');
	const org = await db.getOrgByUserId(event.locals.user.id);
	if (!org || org.id !== jobSite.org_id) throw error(403, 'Access denied');
	return db;
}

export async function GET(event: RequestEvent) {
	try {
		const db = await authorize(event, event.params.id!);
		const schematics = await db.getSchematics(event.params.id!);
		return json({ schematics });
	} catch (err) {
		if (err instanceof Response) return err;
		console.error('Get schematics error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// POST: stores a single rendered schematic page (PNG) in R2 + a metadata row.
// The image is rendered client-side from the contract-summary PDF (the Workers
// runtime has no canvas to render PDF pages itself).
export async function POST(event: RequestEvent) {
	try {
		const db = await authorize(event, event.params.id!);
		const jobSiteId = event.params.id!;

		const form = await event.request.formData();
		const file = form.get('image');
		if (!(file instanceof File)) {
			return json({ error: 'No image provided' }, { status: 400 });
		}
		const bytes = await file.arrayBuffer();
		if (bytes.byteLength > MAX_IMAGE_BYTES) {
			return json({ error: 'Image too large' }, { status: 400 });
		}

		const pageRaw = form.get('page_number');
		const pageNumber = typeof pageRaw === 'string' && pageRaw.trim() !== '' ? Number(pageRaw) : null;
		const label = typeof form.get('label') === 'string' ? (form.get('label') as string) : null;

		const key = `schematics/${jobSiteId}/${crypto.randomUUID()}.png`;
		await event.platform!.env.ASSETS_BUCKET.put(key, bytes, {
			httpMetadata: { contentType: 'image/png' }
		});

		const schematic = await db.createSchematic(jobSiteId, {
			r2_key: key,
			page_number: pageNumber != null && Number.isFinite(pageNumber) ? pageNumber : null,
			label,
			content_type: 'image/png',
			sort_order: pageNumber != null && Number.isFinite(pageNumber) ? pageNumber : 0
		});

		return json({ schematic });
	} catch (err) {
		if (err instanceof Response) return err;
		console.error('Upload schematic error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
