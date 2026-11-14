import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

function prefsRecord(
	rows: Array<{ pref_key: string; enabled: number }>
): Record<string, boolean> {
	const record: Record<string, boolean> = {};
	for (const key of ALLOWED_PREF_KEYS) record[key] = true;
	for (const row of rows) {
		if (ALLOWED_PREF_KEYS.has(row.pref_key)) record[row.pref_key] = row.enabled === 1;
	}
	return record;
}

const ALLOWED_PREF_KEYS = new Set([
	'email_daily_summary',
	'email_invite',
	'email_spec_alerts',
	'email_job_updates',
	'email_document_review',
	'email_crew_assigned',
	'push_spec_alerts',
	'push_job_updates'
]);

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const prefs = prefsRecord(await db.getNotificationPrefs(user.id));
		return json({ prefs });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get notification prefs error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function PUT(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const body = (await event.request.json()) as { prefs?: Record<string, boolean> };

		if (!body.prefs || typeof body.prefs !== 'object') {
			return json({ error: 'prefs object is required' }, { status: 400 });
		}

		// Validate all keys are allowed
		for (const key of Object.keys(body.prefs)) {
			if (!ALLOWED_PREF_KEYS.has(key)) {
				return json({ error: `Invalid preference key: ${key}` }, { status: 400 });
			}
			if (typeof body.prefs[key] !== 'boolean') {
				return json({ error: `Preference ${key} must be a boolean` }, { status: 400 });
			}
		}

		await db.bulkSetNotificationPrefs(user.id, body.prefs);

		// Record audit log if user is part of an org
		try {
			const org = await db.getOrgByUserId(user.id);
			if (org) {
				recordAudit(event.platform.env.DB, {
					actorUserId: user.id,
					actorName: user.name,
					orgId: org.id,
					resourceType: 'notification_prefs',
					resourceId: user.id,
					action: 'updated',
					newValue: body.prefs,
					ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
					userAgent: event.request.headers.get('user-agent') || undefined
				});
			}
		} catch (auditError) {
			console.error('Failed to record audit for notification prefs update:', auditError);
		}

		const prefs = prefsRecord(await db.getNotificationPrefs(user.id));
		return json({ prefs });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Update notification prefs error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
