import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { buildPDFShareEmail, buildOrgBranding } from '$lib/server/email';

interface SharePDFBody {
	pdfBase64: string;
	filename: string;
	subject?: string;
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

		const body = (await event.request.json()) as SharePDFBody;

		if (!body.pdfBase64 || typeof body.pdfBase64 !== 'string') {
			return json({ error: 'pdfBase64 is required' }, { status: 400 });
		}

		if (!body.filename || typeof body.filename !== 'string') {
			return json({ error: 'filename is required' }, { status: 400 });
		}

		// Load org settings to get report_recipients
		const settings = await db.getOrgSettings(org.id);
		let recipients: string[] = [];
		if (settings?.report_recipients) {
			try {
				const parsed = JSON.parse(settings.report_recipients);
				if (Array.isArray(parsed)) {
					recipients = parsed.filter((e): e is string => typeof e === 'string');
				}
			} catch {
				// Invalid JSON, treat as no recipients
			}
		}

		if (recipients.length === 0) {
			return json({ error: 'No report recipients configured' }, { status: 400 });
		}

		const resendApiKey = event.platform?.env?.RESEND_API_KEY;
		if (!resendApiKey) {
			return json({ error: 'Email service not configured' }, { status: 503 });
		}

		// Build email
		const branding = buildOrgBranding(org, settings);
		const fromName = branding.emailFromName ?? 'PaveRate';
		const subject = body.subject ?? `PaveRate Report: ${body.filename}`;
		const html = buildPDFShareEmail(body.filename, branding);

		// Send to all recipients
		let sentCount = 0;
		const errors: string[] = [];

		for (const recipient of recipients) {
			try {
				const response = await fetch('https://api.resend.com/emails', {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${resendApiKey}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						from: `${fromName} <noreply@paverate.com>`,
						to: recipient,
						subject,
						html,
						reply_to: branding.emailReplyTo,
						attachments: [
							{
								filename: body.filename,
								content: body.pdfBase64
							}
						]
					})
				});

				if (response.ok) {
					sentCount++;
					await db.logEmail({
						to: recipient,
						from: `${fromName} <noreply@paverate.com>`,
						subject,
						type: 'report-share',
						status: 'sent',
						orgId: org.id,
						userId: user.id
					}).catch((err: unknown) => {
						console.error('Failed to log email:', err);
					});
				} else {
					const errorText = await response.text();
					errors.push(`${recipient}: ${errorText}`);
					await db.logEmail({
						to: recipient,
						from: `${fromName} <noreply@paverate.com>`,
						subject,
						type: 'report-share',
						status: 'failed',
						orgId: org.id,
						userId: user.id,
						error: errorText
					}).catch((err: unknown) => {
						console.error('Failed to log email:', err);
					});
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				errors.push(`${recipient}: ${message}`);
				await db.logEmail({
					to: recipient,
					from: `${fromName} <noreply@paverate.com>`,
					subject,
					type: 'report-share',
					status: 'failed',
					orgId: org.id,
					userId: user.id,
					error: message
				}).catch((err: unknown) => {
					console.error('Failed to log email:', err);
				});
			}
		}

		if (sentCount === 0) {
			return json(
				{
					error: `Failed to send to any recipients. Errors: ${errors.join('; ')}`,
					sent: 0
				},
				{ status: 500 }
			);
		}

		return json({
			ok: true,
			sent: sentCount,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Share PDF error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
