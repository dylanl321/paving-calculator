import { json, error, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { SYSTEM_DEFAULTS, SYSTEM_TEMPLATE_KEYS, ORG_TEMPLATE_KEYS, type TemplateKey } from '$lib/server/email-templates';

const ALL_TEMPLATE_KEYS = [...SYSTEM_TEMPLATE_KEYS, ...ORG_TEMPLATE_KEYS];

interface TemplateResponse {
	key: string;
	source: 'system_default' | 'db_override';
	subject: string;
	body_html: string;
	body_text: string | null;
	updated_at: number | null;
	updated_by: string | null;
}

interface DbTemplateRow {
	template_key: string;
	subject: string;
	body_html: string;
	body_text: string | null;
	updated_at: number;
	updated_by: string | null;
}

export async function GET(event: RequestEvent) {
	const adminUser = await requireGlobalAdmin(event);
	const db = event.platform!.env.DB;

	const dbRows = await db
		.prepare('SELECT template_key, subject, body_html, body_text, updated_at, updated_by FROM email_templates WHERE org_id IS NULL')
		.all<DbTemplateRow>();

	const dbMap = new Map(dbRows.results.map((row: DbTemplateRow) => [row.template_key, row]));

	const templates: TemplateResponse[] = ALL_TEMPLATE_KEYS.map((key) => {
		const dbRow = dbMap.get(key);
		if (dbRow) {
			return {
				key,
				source: 'db_override',
				subject: dbRow.subject,
				body_html: dbRow.body_html,
				body_text: dbRow.body_text,
				updated_at: dbRow.updated_at,
				updated_by: dbRow.updated_by
			};
		}

		const systemDefault = SYSTEM_DEFAULTS[key as TemplateKey];
		return {
			key,
			source: 'system_default',
			subject: systemDefault.subject,
			body_html: systemDefault.body_html,
			body_text: systemDefault.body_text,
			updated_at: null,
			updated_by: null
		};
	});

	return json({ templates });
}

export async function PUT(event: RequestEvent) {
	const adminUser = await requireGlobalAdmin(event);
	const db = event.platform!.env.DB;

	const body = (await event.request.json()) as {
		key: string;
		subject: string;
		body_html: string;
		body_text: string | null;
	};
	const { key, subject, body_html, body_text } = body;

	if (!key || typeof key !== 'string' || !ALL_TEMPLATE_KEYS.includes(key as TemplateKey)) {
		return error(400, 'Invalid template key');
	}

	if (!subject || typeof subject !== 'string') {
		return error(400, 'Subject is required');
	}

	if (!body_html || typeof body_html !== 'string') {
		return error(400, 'body_html is required');
	}

	const id = Array.from(crypto.getRandomValues(new Uint8Array(8)))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');

	await db
		.prepare(`
			INSERT INTO email_templates (id, org_id, template_key, subject, body_html, body_text, updated_at, updated_by)
			VALUES (?, NULL, ?, ?, ?, ?, unixepoch(), ?)
			ON CONFLICT(org_id, template_key) DO UPDATE SET
				subject = excluded.subject,
				body_html = excluded.body_html,
				body_text = excluded.body_text,
				updated_at = excluded.updated_at,
				updated_by = excluded.updated_by
		`)
		.bind(id, key, subject, body_html, body_text || null, adminUser.email)
		.run();

	return json({ ok: true });
}

export async function DELETE(event: RequestEvent) {
	const adminUser = await requireGlobalAdmin(event);
	const db = event.platform!.env.DB;

	const key = event.url.searchParams.get('key');

	if (!key || !ALL_TEMPLATE_KEYS.includes(key as TemplateKey)) {
		return error(400, 'Invalid template key');
	}

	await db
		.prepare('DELETE FROM email_templates WHERE org_id IS NULL AND template_key = ?')
		.bind(key)
		.run();

	return json({ ok: true });
}
