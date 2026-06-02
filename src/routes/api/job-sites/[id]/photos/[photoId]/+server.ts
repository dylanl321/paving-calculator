import { json, error, type RequestEvent } from '@sveltejs/kit';
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
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const photoId = event.params.photoId!;

		const jobSite = await db.getJobSiteById(jobSiteId);
		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const photo = await photoDb.getPhoto(photoId);
		if (!photo || photo.job_site_id !== jobSiteId) {
			return json({ error: 'Photo not found' }, { status: 404 });
		}

		return json({
			photo,
			url: `/api/job-sites/${jobSiteId}/photos/${photoId}/view`
		});
	} catch (err) {
		if (err instanceof Response) throw err;
		console.error('Get photo error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const photoDb = new DbPhotoHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const photoId = event.params.photoId!;

		const jobSite = await db.getJobSiteById(jobSiteId);
		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const photo = await photoDb.getPhoto(photoId);
		if (!photo || photo.job_site_id !== jobSiteId) {
			return json({ error: 'Photo not found' }, { status: 404 });
		}

		// Only uploader can delete
		if (photo.uploaded_by !== user.id) {
			return json({ error: 'Only the uploader can delete this photo' }, { status: 403 });
		}

		// Delete from R2
		await event.platform!.env.ASSETS_BUCKET.delete(photo.r2_key);

		// Delete from DB
		await photoDb.deletePhoto(photoId, user.id);

		return json({ success: true });
	} catch (err) {
		if (err instanceof Response) throw err;
		console.error('Delete photo error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
