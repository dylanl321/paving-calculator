import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

const VALID_TYPES = new Set([
	'gdot_contract_summary', 'gdot_job_setup', 'gdot_roadway_log',
	'weight_ticket', 'material_certification', 'plan_sheet',
	'inspection_report', 'change_order', 'daily_report', 'other', 'unknown'
]);

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Storage not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);
		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const body = await event.request.json() as {
			filename?: string;
			detected_type?: string | null;
			user_corrected_type?: string;
		};

		const filename = typeof body.filename === 'string' ? body.filename.slice(0, 255) : '';
		const detectedType = typeof body.detected_type === 'string' ? body.detected_type : null;
		const userType = typeof body.user_corrected_type === 'string' ? body.user_corrected_type : '';

		if (!userType || !VALID_TYPES.has(userType)) {
			return json({ error: 'Invalid document type' }, { status: 400 });
		}

		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await event.platform.env.DB.prepare(
			`INSERT INTO document_feedback
			  (id, org_id, uploaded_at, original_filename, detected_type, user_corrected_type)
			 VALUES (?, ?, ?, ?, ?, ?)`
		).bind(id, org.id, now, filename, detectedType, userType).run();

		return json({ ok: true, id });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Document feedback error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
