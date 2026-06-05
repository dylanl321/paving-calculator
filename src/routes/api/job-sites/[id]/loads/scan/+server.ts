import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbPhotoHelper } from '$lib/server/db-photos';
import { requireAuth } from '$lib/server/auth';
import { extractTicketData, type WorkersAi, type TicketExtraction } from '$lib/server/ai/ticket-ocr';

/**
 * POST /api/job-sites/:id/loads/scan
 *
 * Accepts a truck ticket photo (multipart/form-data, field: 'photo').
 * Stores the image in R2 via the photo_attachments system and returns
 * { photo_id, photo, ocr_fields }.
 *
 * If Workers AI is available, attempts to extract structured data from
 * the ticket photo. Returns null ocr_fields if AI unavailable or fails.
 */
export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const photoDb = new DbPhotoHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const formData = await event.request.formData();
		const photoFile = formData.get('photo') as File | null;

		if (!photoFile || !(photoFile instanceof File)) {
			return json({ error: 'Photo file is required' }, { status: 400 });
		}

		const fileExt = photoFile.name.split('.').pop() ?? 'jpg';
		const r2Key = `photos/${jobSiteId}/tickets/${crypto.randomUUID()}.${fileExt}`;

		// Upload to R2
		const arrayBuffer = await photoFile.arrayBuffer();
		await event.platform!.env.ASSETS_BUCKET.put(r2Key, arrayBuffer, {
			httpMetadata: { contentType: photoFile.type || 'image/jpeg' }
		});

		const photo = await photoDb.createPhoto({
			job_site_id: jobSiteId,
			r2_key: r2Key,
			filename: photoFile.name || `ticket.${fileExt}`,
			caption: 'Truck ticket scan',
			taken_at: Math.floor(Date.now() / 1000),
			uploaded_by: user.id
		});

		// Try OCR if Workers AI is available
		let ocrFields: TicketExtraction | null = null;
		if (event.platform?.env.AI) {
			try {
				ocrFields = await extractTicketData(
					event.platform.env.AI as WorkersAi,
					arrayBuffer
				);
			} catch (err) {
				console.warn('Ticket OCR failed:', err);
			}
		}

		return json({
			photo_id: photo.id,
			photo,
			ocr_fields: ocrFields
		});
	} catch (err) {
		if (err instanceof Response) throw err;
		console.error('Ticket scan error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
