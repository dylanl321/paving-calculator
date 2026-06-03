import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { buildOrgBranding } from '$lib/server/email';

interface ReportStats {
	activeJobSites: number;
	totalLoads: number;
	totalTons: number;
}

function buildReportEmailTemplate(
	reportType: string,
	dateRange: string,
	stats: ReportStats,
	orgName: string,
	accentColor: string,
	dashboardUrl: string
): string {
	const buttonTextColor = getContrastColor(accentColor);

	const reportTitle =
		reportType === 'daily_summary'
			? 'Daily Summary'
			: reportType === 'weekly_rollup'
				? 'Weekly Rollup'
				: 'Monthly Rollup';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportTitle} Report</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="background:#1b2228;padding:40px 20px;min-height:100vh;">
    <div style="max-width:560px;margin:0 auto;background:#232c34;border-radius:12px;padding:32px;border:1px solid #37444f;">
      <h1 style="color:${accentColor};margin:0 0 8px;font-size:24px;font-weight:700;">${orgName}</h1>
      <h2 style="color:#f4f6f7;margin:0 0 24px;font-size:18px;font-weight:600;">${reportTitle} Report</h2>

      <p style="color:#cdd8e0;font-size:14px;line-height:1.5;margin:0 0 24px;">
        ${dateRange}
      </p>

      <div style="background:#1b2228;border-radius:8px;padding:24px;margin:0 0 28px;">
        <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #37444f;">
          <div style="color:#7e8f9c;font-size:13px;margin-bottom:4px;">Active Job Sites</div>
          <div style="color:#f4f6f7;font-size:28px;font-weight:700;">${stats.activeJobSites}</div>
        </div>

        <div style="margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #37444f;">
          <div style="color:#7e8f9c;font-size:13px;margin-bottom:4px;">Total Loads Logged</div>
          <div style="color:#f4f6f7;font-size:28px;font-weight:700;">${stats.totalLoads}</div>
        </div>

        <div>
          <div style="color:#7e8f9c;font-size:13px;margin-bottom:4px;">Total Tons</div>
          <div style="color:#f4f6f7;font-size:28px;font-weight:700;">${stats.totalTons.toFixed(1)}</div>
        </div>
      </div>

      <a href="${dashboardUrl}" style="display:inline-block;padding:14px 28px;background:${accentColor};color:${buttonTextColor};text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">
        View Full Report
      </a>

      <p style="color:#7e8f9c;font-size:13px;line-height:1.5;margin:28px 0 0;padding-top:24px;border-top:1px solid #37444f;">
        You are receiving this automated report because you are subscribed to ${orgName} paving reports on PaveRate.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function getContrastColor(hexColor: string): string {
	const hex = hexColor.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const luma = 0.299 * r + 0.587 * g + 0.114 * b;
	return luma > 186 ? '#1b2228' : '#f4f6f7';
}

function formatDateRange(reportType: string, now: Date): string {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	if (reportType === 'daily_summary') {
		return today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
	}

	if (reportType === 'weekly_rollup') {
		const weekAgo = new Date(today);
		weekAgo.setDate(weekAgo.getDate() - 7);
		return `${weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
	}

	const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
	return monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

async function getReportStats(
	db: DbHelper,
	orgId: string,
	reportType: string,
	now: Date
): Promise<ReportStats> {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayTs = Math.floor(today.getTime() / 1000);

	let startTs: number;
	if (reportType === 'daily_summary') {
		startTs = todayTs;
	} else if (reportType === 'weekly_rollup') {
		const weekAgo = new Date(today);
		weekAgo.setDate(weekAgo.getDate() - 7);
		startTs = Math.floor(weekAgo.getTime() / 1000);
	} else {
		const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
		startTs = Math.floor(monthStart.getTime() / 1000);
	}

	const jobSites = await db.getJobSitesByOrgId(orgId);
	const activeJobSites = jobSites.filter((js) => js.status === 'active').length;

	const loadsQuery = await db
		.prepare(
			`SELECT COUNT(*) as count, SUM(tons) as totalTons
       FROM loads l
       JOIN job_sites js ON js.id = l.job_site_id
       WHERE js.org_id = ? AND l.timestamp >= ? AND l.rejected = 0`
		)
		.bind(orgId, startTs)
		.first<{ count: number; totalTons: number | null }>();

	return {
		activeJobSites,
		totalLoads: loadsQuery?.count ?? 0,
		totalTons: loadsQuery?.totalTons ?? 0
	};
}

async function sendReportEmail(
	db: DbHelper,
	apiKey: string,
	schedule: { org_id: string; report_type: string; recipients: string[] },
	baseUrl: string
): Promise<void> {
	const org = await db.getOrganizationById(schedule.org_id);
	if (!org) return;

	const settings = await db.getOrgSettings(org.id);
	const branding = buildOrgBranding(org, settings);
	const now = new Date();

	const stats = await getReportStats(db, org.id, schedule.report_type, now);
	const dateRange = formatDateRange(schedule.report_type, now);

	const accentColor = branding.accentColor ?? '#f2c037';
	const orgName = branding.orgName ?? org.name;
	const fromName = branding.emailFromName ?? 'PaveRate';

	const reportTitle =
		schedule.report_type === 'daily_summary'
			? 'Daily Summary'
			: schedule.report_type === 'weekly_rollup'
				? 'Weekly Rollup'
				: 'Monthly Rollup';

	const html = buildReportEmailTemplate(
		schedule.report_type,
		dateRange,
		stats,
		orgName,
		accentColor,
		`${baseUrl}/dashboard`
	);

	for (const recipient of schedule.recipients) {
		try {
			const response = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					from: `${fromName} <noreply@paverate.com>`,
					to: recipient,
					subject: `${orgName} ${reportTitle} - ${dateRange}`,
					html,
					reply_to: branding.emailReplyTo
				})
			});

			let providerId: string | undefined;
			let status: 'sent' | 'failed' = 'sent';
			let error: string | undefined;

			if (!response.ok) {
				status = 'failed';
				error = `${response.status} ${await response.text()}`.trim();
				console.error('Resend API error:', error);
			} else {
				try {
					const body = (await response.json()) as { id?: string };
					providerId = body?.id;
				} catch {
					providerId = undefined;
				}
			}

			await db.logEmail({
				to: recipient,
				from: `${fromName} <noreply@paverate.com>`,
				subject: `${orgName} ${reportTitle} - ${dateRange}`,
				type: 'report',
				status,
				orgId: org.id,
				userId: null,
				providerMessageId: providerId ?? null,
				error: error ?? null
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('Email send error:', err);
			await db.logEmail({
				to: recipient,
				from: `${fromName} <noreply@paverate.com>`,
				subject: `${orgName} ${reportTitle} - ${dateRange}`,
				type: 'report',
				status: 'failed',
				orgId: org.id,
				userId: null,
				providerMessageId: null,
				error: message
			});
		}
	}
}

export async function POST(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		const cronSecret = event.platform.env.CRON_SECRET;
		const headerSecret = event.request.headers.get('x-cron-secret');

		let isAuthorized = false;

		if (cronSecret && headerSecret === cronSecret) {
			isAuthorized = true;
		} else if (!cronSecret) {
			isAuthorized = true;
		} else {
			try {
				const user = await requireAuth(event);
				const db = new DbHelper(event.platform.env.DB);
				const org = await db.getOrgByUserId(user.id);
				if (org) {
					const role = await db.getUserRole(user.id, org.id);
					if (role === 'owner' || role === 'admin') {
						isAuthorized = true;
					}
				}
			} catch {
				isAuthorized = false;
			}
		}

		if (!isAuthorized) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const db = new DbHelper(event.platform.env.DB);
		const apiKey = event.platform.env.RESEND_API_KEY;

		if (!apiKey) {
			console.warn('RESEND_API_KEY not set, skipping report emails');
			return json({ ok: true, sent: 0, message: 'No API key configured' });
		}

		const now = new Date();
		const currentHour = now.getUTCHours();
		const currentDayOfWeek = now.getUTCDay();

		const allSchedules = await db
			.prepare(
				'SELECT * FROM email_report_schedules WHERE enabled = 1 ORDER BY created_at DESC'
			)
			.all<{
				id: string;
				org_id: string;
				report_type: string;
				frequency: string;
				send_hour: number;
				day_of_week: number | null;
				recipients: string;
			}>()
			.then((r) => r.results);

		const schedulesToSend = allSchedules.filter((s) => {
			if (s.send_hour !== currentHour) return false;
			if (s.frequency === 'weekly' && s.day_of_week !== currentDayOfWeek) return false;
			return true;
		});

		const baseUrl = event.url.origin;
		let sent = 0;

		for (const schedule of schedulesToSend) {
			const recipients = JSON.parse(schedule.recipients) as string[];
			await sendReportEmail(
				db,
				apiKey,
				{
					org_id: schedule.org_id,
					report_type: schedule.report_type,
					recipients
				},
				baseUrl
			);
			await db.markEmailReportScheduleSent(schedule.id, Math.floor(Date.now() / 1000));
			sent++;
		}

		return json({ ok: true, sent });
	} catch (error) {
		console.error('Send email reports error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
