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
		const orgId = params.get('orgId') ?? undefined;

		const dateFromRaw = params.get('dateFrom');
		const dateFrom = dateFromRaw ? Number(dateFromRaw) : undefined;
		const dateToRaw = params.get('dateTo');
		const dateTo = dateToRaw ? Number(dateToRaw) : undefined;

		const pageRaw = Number(params.get('page'));
		const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0;
		const limitRaw = Number(params.get('limit'));
		const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 50;

		const result = await db.getEmailLog({
			status,
			type,
			toEmail,
			failedOnly,
			dateFrom,
			dateTo,
			orgId,
			offset: page * limit,
			limit
		});

		return json({
			emails: result.rows,
			total: result.total,
			page,
			pageSize: limit
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error fetching email log:', error);
		return json({ error: 'Failed to fetch email log' }, { status: 500 });
	}
}
