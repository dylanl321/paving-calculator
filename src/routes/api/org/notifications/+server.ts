import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbNotificationSchedule } from '$lib/server/db';
import { requireAuth, requireOrgRole } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;
const VALID_SCHEDULE_TYPES: DbNotificationSchedule['schedule_type'][] = [
	'eod_summary',
	'weekly_report'
];

// Role group shortcuts that map to dynamic recipient lists at send time.
const VALID_ROLE_GROUPS = new Set(['all_admins', 'all_foremen', 'all_members']);

function validateRecipients(recipients: unknown): string[] | null {
	if (!Array.isArray(recipients)) return null;
	if (recipients.length > 20) return null;
	for (const item of recipients) {
		if (typeof item !== 'string') return null;
		// Accept role group strings or valid email addresses.
		if (!VALID_ROLE_GROUPS.has(item) && !EMAIL_REGEX.test(item)) return null;
	}
	return recipients;
}

function validateSendTime(sendTime: unknown): string | null {
	if (typeof sendTime !== 'string') return null;
	if (!TIME_REGEX.test(sendTime)) return null;
	const [h, m] = sendTime.split(':').map(Number);
	if (h < 0 || h > 23 || m < 0 || m > 59) return null;
	return sendTime;
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

		const schedules = await db.getNotificationSchedules(org.id);

		return json({
			schedules: schedules.map((s) => ({
				id: s.id,
				scheduleType: s.schedule_type,
				enabled: s.enabled === 1,
				sendTime: s.send_time,
				timezone: s.timezone,
				recipients: JSON.parse(s.recipients),
				createdAt: s.created_at,
				updatedAt: s.updated_at
			}))
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get notification schedules error:', error);
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
		const scheduleType = body.scheduleType as string;
		const enabled = body.enabled !== false;
		const recipients = body.recipients;
		const timezone =
			typeof body.timezone === 'string' && body.timezone
				? body.timezone
				: 'America/Chicago';

		if (!scheduleType || !VALID_SCHEDULE_TYPES.includes(scheduleType as DbNotificationSchedule['schedule_type'])) {
			return json(
				{ error: 'Invalid scheduleType. Must be one of: ' + VALID_SCHEDULE_TYPES.join(', ') },
				{ status: 400 }
			);
		}

		const sendTimeRaw = body.sendTime ?? '17:00';
		const sendTime = validateSendTime(sendTimeRaw);
		if (!sendTime) {
			return json({ error: 'sendTime must be in HH:MM format (00:00-23:59)' }, { status: 400 });
		}

		const validatedRecipients = validateRecipients(recipients);
		if (!validatedRecipients) {
			return json(
				{ error: 'recipients must be an array of up to 20 valid email addresses or role groups (all_admins, all_foremen, all_members)' },
				{ status: 400 }
			);
		}

		await db.upsertNotificationSchedule({
			id,
			org_id: org.id,
			schedule_type: scheduleType as DbNotificationSchedule['schedule_type'],
			enabled: enabled ? 1 : 0,
			send_time: sendTime,
			timezone,
			recipients: JSON.stringify(validatedRecipients)
		});

		recordAudit(event.platform.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'notification_schedule',
			resourceId: id,
			action: 'upserted',
			newValue: { scheduleType, enabled, sendTime, timezone },
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ ok: true, id });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create notification schedule error:', error);
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

		await db.deleteNotificationSchedule(id, org.id);

		recordAudit(event.platform.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'notification_schedule',
			resourceId: id,
			action: 'deleted',
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ ok: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete notification schedule error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
