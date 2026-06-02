import { json, type RequestEvent } from '@sveltejs/kit';
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
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const logId = event.url.searchParams.get('log_id') ?? undefined;
		const photos = await photoDb.listPhotos(jobSiteId, logId);

		return json({ photos });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get photos error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

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
		const photoFile = formData.get('photo') as File;
		if (!photoFile || !(photoFile instanceof File)) {
			return json({ error: 'Photo file is required' }, { status: 400 });
		}

		const caption = formData.get('caption') as string | null;
		const latStr = formData.get('lat') as string | null;
		const lngStr = formData.get('lng') as string | null;
		const accuracyStr = formData.get('gps_accuracy_m') as string | null;
		const dailyLogId = formData.get('daily_log_id') as string | null;
		const logEntryId = formData.get('log_entry_id') as string | null;

		const lat = latStr ? parseFloat(latStr) : null;
		const lng = lngStr ? parseFloat(lngStr) : null;
		const gps_accuracy_m = accuracyStr ? parseFloat(accuracyStr) : null;

		// Generate R2 key
		const fileExt = photoFile.name.split('.').pop() ?? 'jpg';
		const r2Key = `photos/${jobSiteId}/${crypto.randomUUID()}.${fileExt}`;

		// Upload to R2
		const arrayBuffer = await photoFile.arrayBuffer();
		await event.platform!.env.ASSETS_BUCKET.put(r2Key, arrayBuffer, {
			httpMetadata: {
				contentType: photoFile.type || 'image/jpeg'
			}
		});

		// Insert DB record
		const photo = await photoDb.createPhoto({
			job_site_id: jobSiteId,
			daily_log_id: dailyLogId,
			log_entry_id: logEntryId,
			r2_key: r2Key,
			filename: photoFile.name,
			caption,
			lat,
			lng,
			gps_accuracy_m,
			taken_at: Math.floor(Date.now() / 1000),
			uploaded_by: user.id
		});

		return json({
			photo,
			url: `/api/job-sites/${jobSiteId}/photos/${photo.id}/view`
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Upload photo error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
