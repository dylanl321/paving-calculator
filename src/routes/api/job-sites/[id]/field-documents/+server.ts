import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { commitFieldDocument, extractFieldDocumentSmart, type TextCompleter } from '$lib/server/field-documents';
import { notifyOrg, quietSender } from '$lib/server/notify';
import { pdfToPositionedText } from '$lib/server/pdf/parse-gdot';

function workersAiCompleter(ai: unknown): TextCompleter | undefined {
	if (!ai || typeof ai !== 'object' || !('run' in ai) || typeof (ai as { run?: unknown }).run !== 'function') {
		return undefined;
	}
	const run = (ai as { run: (model: string, input: Record<string, unknown>) => Promise<unknown> }).run.bind(ai);
	return {
		async complete(prompt: string) {
			const result = await run('@cf/meta/llama-3.1-8b-instruct', {
				messages: [{ role: 'user', content: prompt }],
				max_tokens: 500
			});
			if (typeof result === 'string') return result;
			if (result && typeof result === 'object' && 'response' in result) {
				return String((result as { response: unknown }).response ?? '');
			}
			return JSON.stringify(result ?? '');
		}
	};
}

async function readText(request: Request): Promise<{ text: string; filename: string | null; action: string; kind?: string; fields?: unknown }> {
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('multipart/form-data')) {
		const form = await request.formData();
		const file = form.get('file');
		let text = typeof form.get('text') === 'string' ? String(form.get('text')) : '';
		let filename: string | null = null;
		if (file instanceof File && file.size > 0) {
			filename = file.name;
			if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
				const pages = await pdfToPositionedText(await file.arrayBuffer());
				text = `${text}\n${pages.map((page) => page.text).join('\n')}`.trim();
			} else {
				text = `${text}\n${await file.text()}`.trim();
			}
		}
		return { text, filename, action: 'preview' };
	}
	const body = (await request.json()) as {
		action?: string;
		text?: string;
		kind?: string;
		fields?: unknown;
		filename?: string;
	};
	return {
		text: body.text ?? '',
		filename: body.filename ?? null,
		action: body.action ?? 'preview',
		kind: body.kind,
		fields: body.fields
	};
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);
		const jobSiteId = event.params.id;
		if (!jobSiteId) return json({ error: 'Job site ID is required' }, { status: 400 });
		const jobSite = await db.getJobSiteById(jobSiteId);
		const org = await db.getOrgByUserId(user.id);
		if (!jobSite || !org || jobSite.org_id !== org.id) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		const payload = await readText(event.request);
		if (payload.action === 'commit') {
			try {
				const saved = await commitFieldDocument(event.platform.env.DB, {
					jobSiteId,
					orgId: org.id,
					userId: user.id,
					kind: payload.kind ?? '',
					fields: payload.fields,
					filename: payload.filename
				});
				return json({ saved }, { status: 201 });
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Could not save document';
				return json({ error: message }, { status: 400 });
			}
		}

		if (!payload.text.trim()) {
			return json({ error: 'Paste the document text or upload a file' }, { status: 400 });
		}
		const completer = workersAiCompleter(event.platform.env.AI);
		const draft = await extractFieldDocumentSmart(payload.text, completer);
		if (!draft) {
			return json(
				{
					error:
						'This does not look like a weight ticket, material certification, or daily report. Check the text and try again.'
				},
				{ status: 422 }
			);
		}
		const day = new Date().toISOString().slice(0, 10);
		try {
			await notifyOrg(
				event.platform.env.DB,
				{
					orgId: org.id,
					eventKey: `document_review:${jobSiteId}:${draft.kind}:${day}`,
					eventType: 'document_review',
					subject: `Document needs review: ${draft.kind.replaceAll('_', ' ')}`,
					text: `${jobSite.name} has a ${draft.kind.replaceAll('_', ' ')} waiting for confirmation.`
				},
				quietSender
			);
		} catch (err) {
			console.error('document review notice failed:', err);
		}
		return json({ draft, filename: payload.filename });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Field document import error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
