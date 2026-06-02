import { error, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbPhotoHelper } from '$lib/server/db-photos';
import { requireAuth } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const photoDb = new DbPhotoHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			throw error(404, 'Organization not found');
		}

		const jobSiteId = event.params.id!;
		const photoId = event.params.photoId!;

		const jobSite = await db.getJobSiteById(jobSiteId);
		if (!jobSite) {
			throw error(404, 'Job site not found');
		}

		if (jobSite.org_id !== org.id) {
			throw error(403, 'Unauthorized');
		}

		const photo = await photoDb.getPhoto(photoId);
		if (!photo || photo.job_site_id !== jobSiteId) {
			throw error(404, 'Photo not found');
		}

		// Fetch from R2
		const obj = await event.platform!.env.ASSETS_BUCKET.get(photo.r2_key);
		if (!obj) {
			throw error(404, 'Photo file not found in storage');
		}

		return new Response(obj.body, {
			headers: {
				'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
				'Cache-Control': 'private, max-age=3600'
			}
		});
	} catch (err) {
		if (err instanceof Response) throw err;
		console.error('View photo error:', err);
		throw error(500, 'Internal server error');
	}
}
