import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { buildPreviewEmail } from '$lib/server/email';

export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const db = new DbHelper(event.platform!.env.DB);

		const params = event.url.searchParams;

		// Preview mode: render an example of a given template (reuses buildPreviewEmail).
		const previewType = params.get('preview');
		if (previewType) {
			if (
				previewType !== 'invitation' &&
				previewType !== 'verification' &&
				previewType !== 'password-reset'
			) {
				return json({ error: 'Invalid preview type' }, { status: 400 });
			}
			const preview = buildPreviewEmail(previewType);
			return json({ preview: { type: previewType, ...preview } });
		}

		const status = params.get('status') ?? undefined;
		const type = params.get('type') ?? undefined;
		const toEmail = params.get('to') ?? undefined;
		const failedOnly = params.get('failedOnly') === 'true';
		const limitRaw = Number(params.get('limit'));
		const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

		const emails = await db.getEmailLog({
			status,
			type,
			toEmail,
			failedOnly,
			limit
		});

		return json({ emails });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error fetching email log:', error);
		return json({ error: 'Failed to fetch email log' }, { status: 500 });
	}
}
