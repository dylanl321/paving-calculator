/**
 * POST /api/cron/eod-notify
 *
 * Cloudflare cron-trigger endpoint (or HTTP POST with CRON_SECRET) that:
 *  1. Fetches all enabled eod_summary notification_schedules whose send_time
 *     matches the current hour in the schedule's configured timezone.
 *  2. For each matching schedule, generates an EOD summary for the org.
 *  3. Renders the eod_summary email template and sends to every recipient.
 *
 * Auth: CRON_SECRET header (x-cron-secret) or unauthenticated when no secret is configured.
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { type DbNotificationSchedule } from '$lib/server/db';
import { getOrgBranding } from '$lib/server/email-templates';
import { sendTemplatedEmail } from '$lib/server/email-template-senders';
import { generateEodSummary, eodSummaryToTemplateVars } from '$lib/server/notifications';

type D1Database = import('../../../../cloudflare').D1Database;

/**
 * Get the current YYYY-MM-DD date string in a given IANA timezone.
 * Falls back to UTC if the timezone is unrecognised.
 */
function localDateString(timezone: string): string {
	try {
		const formatter = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
		// en-CA locale returns YYYY-MM-DD
		return formatter.format(new Date());
	} catch {
		return new Date().toISOString().slice(0, 10);
	}
}

/**
 * Get the current HH:MM time string in a given IANA timezone.
 */
function localTimeHHMM(timezone: string): string {
	try {
		const formatter = new Intl.DateTimeFormat('en-GB', {
			timeZone: timezone,
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});
		return formatter.format(new Date()); // "17:30"
	} catch {
		const now = new Date();
		return `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
	}
}

export async function POST(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		// Auth: accept CRON_SECRET header, or allow if no secret is configured (dev).
		const cronSecret = event.platform.env.CRON_SECRET;
		const headerSecret = event.request.headers.get('x-cron-secret');
		const isAuthorized = !cronSecret || headerSecret === cronSecret;

		if (!isAuthorized) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const db: D1Database = event.platform.env.DB;
		const apiKey = event.platform.env.RESEND_API_KEY;

		if (!apiKey) {
			console.warn('RESEND_API_KEY not set — skipping eod-notify');
			return json({ ok: true, sent: 0, skipped: 0, message: 'No API key configured' });
		}

		// Load all enabled eod_summary schedules.
		const allSchedules = await db
			.prepare(
				"SELECT * FROM notification_schedules WHERE schedule_type = 'eod_summary' AND enabled = 1"
			)
			.all<DbNotificationSchedule>()
			.then((r) => r.results);

		let sent = 0;
		let skipped = 0;
		const errors: string[] = [];

		for (const schedule of allSchedules) {
			try {
				// Check if now (in the schedule's timezone) matches the configured send_time (HH:MM).
				const localTime = localTimeHHMM(schedule.timezone);
				const scheduleHHMM = schedule.send_time.slice(0, 5); // normalise to HH:MM

				if (localTime !== scheduleHHMM) {
					skipped++;
					continue;
				}

				// Parse recipients from JSON
				let recipients: string[] = [];
				try {
					const parsed = JSON.parse(schedule.recipients);
					if (Array.isArray(parsed)) {
						recipients = parsed.filter((r): r is string => typeof r === 'string' && r.includes('@'));
					}
				} catch {
					console.warn(`Invalid recipients JSON for schedule ${schedule.id}`);
					skipped++;
					continue;
				}

				if (recipients.length === 0) {
					skipped++;
					continue;
				}

				// Determine the "today" date string in the schedule's timezone.
				const dateStr = localDateString(schedule.timezone);

				// Generate EOD summary data.
				const summaryData = await generateEodSummary(db, schedule.org_id, dateStr);

				// Get org branding for logo / accent color.
				const branding = await getOrgBranding(db, schedule.org_id);

				// Build report URL (deep link into the dashboard).
				const baseUrl = new URL(event.request.url).origin;
				const reportUrl = `${baseUrl}/dashboard`;

				const vars = eodSummaryToTemplateVars(summaryData, {
					logoUrl: branding.logo_url,
					accentColor: branding.accent_color,
					reportUrl
				});

				// Send to each recipient.
				for (const recipient of recipients) {
					const result = await sendTemplatedEmail(
						db,
						apiKey,
						'report',
						recipient,
						'eod_summary',
						vars,
						{
							orgId: schedule.org_id,
							fromName: branding.org_name
						}
					);

					if (result.ok) {
						sent++;
					} else {
						errors.push(
							`org=${schedule.org_id} to=${recipient}: ${result.error ?? 'unknown error'}`
						);
					}
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`eod-notify error for schedule ${schedule.id}:`, msg);
				errors.push(`schedule=${schedule.id}: ${msg}`);
			}
		}

		return json({
			ok: true,
			sent,
			skipped,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('eod-notify fatal error:', message);
		return json({ error: message }, { status: 500 });
	}
}
