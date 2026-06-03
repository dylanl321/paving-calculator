import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbEmailReportSchedule } from '$lib/server/db';
import { requireAuth, requireOrgRole } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateRecipients(recipients: unknown): string[] | null {
	if (!Array.isArray(recipients)) return null;
	if (recipients.length === 0 || recipients.length > 10) return null;
	for (const email of recipients) {
		if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) return null;
	}
	return recipients;
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		await requireOrgRole(event, org.id, ['owner', 'admin']);

		const schedules = await db.getEmailReportSchedules(org.id);

		return json({
			schedules: schedules.map((s) => ({
				id: s.id,
				reportType: s.report_type,
				frequency: s.frequency,
				sendHour: s.send_hour,
				dayOfWeek: s.day_of_week,
				recipients: JSON.parse(s.recipients),
				enabled: s.enabled === 1,
				lastSentAt: s.last_sent_at
			}))
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get email report schedules error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		await requireOrgRole(event, org.id, ['owner', 'admin']);

		const body = (await event.request.json()) as Record<string, unknown>;

		const id = typeof body.id === 'string' && body.id ? body.id : crypto.randomUUID();
		const reportType = body.reportType as string;
		const frequency = body.frequency as string;
		const sendHour = body.sendHour as number;
		const dayOfWeek = body.dayOfWeek as number | null;
		const recipients = body.recipients;
		const enabled = body.enabled === true ? 1 : 0;

		if (
			!reportType ||
			!['daily_summary', 'weekly_rollup', 'monthly_rollup'].includes(reportType)
		) {
			return json({ error: 'Invalid reportType' }, { status: 400 });
		}

		if (!frequency || !['daily', 'weekly', 'monthly'].includes(frequency)) {
			return json({ error: 'Invalid frequency' }, { status: 400 });
		}

		if (typeof sendHour !== 'number' || sendHour < 0 || sendHour > 23) {
			return json({ error: 'sendHour must be 0-23' }, { status: 400 });
		}

		if (frequency === 'weekly') {
			if (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6) {
				return json({ error: 'dayOfWeek must be 0-6 for weekly schedules' }, { status: 400 });
			}
		}

		const validatedRecipients = validateRecipients(recipients);
		if (!validatedRecipients) {
			return json({ error: 'Recipients must be 1-10 valid email addresses' }, { status: 400 });
		}

		await db.upsertEmailReportSchedule({
			id,
			org_id: org.id,
			report_type: reportType as DbEmailReportSchedule['report_type'],
			frequency: frequency as DbEmailReportSchedule['frequency'],
			send_hour: sendHour,
			day_of_week: frequency === 'weekly' ? dayOfWeek : null,
			recipients: JSON.stringify(validatedRecipients),
			enabled,
			created_by: user.id
		});

		// Record audit log
		recordAudit(event.platform.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'email_schedule',
			resourceId: id,
			action: 'upserted',
			newValue: { reportType, frequency },
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ ok: true, id });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create email report schedule error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		await requireOrgRole(event, org.id, ['owner', 'admin']);

		const body = (await event.request.json()) as Record<string, unknown>;
		const id = body.id as string;

		if (!id) {
			return json({ error: 'id is required' }, { status: 400 });
		}

		await db.deleteEmailReportSchedule(id, org.id);

		// Record audit log
		recordAudit(event.platform.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'email_schedule',
			resourceId: id,
			action: 'deleted',
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ ok: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete email report schedule error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
