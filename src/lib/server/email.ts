// NOTE: For DB-backed email templates with org branding, see email-templates.ts
// This file contains the legacy inline template functions. New features should
// use the template system in email-templates.ts for centralized template management.

interface Attachment {
	filename: string;
	content: string; // base64
}

interface EmailPayload {
	from: string;
	to: string;
	subject: string;
	html: string;
	replyTo?: string;
	attachments?: Attachment[];
}

export interface OrgBranding {
	orgName?: string;
	accentColor?: string;
	emailFromName?: string;
	emailReplyTo?: string;
}

export type EmailType = 'verification' | 'password-reset' | 'invitation' | 'welcome' | 'report';

/** Structured outcome of a single send attempt. */
export interface EmailSendResult {
	ok: boolean;
	/** Resend message id (from the `{ id }` response body) when the send succeeded. */
	providerId?: string;
	/** Error detail when the send failed or was skipped. */
	error?: string;
	/** 'sent' on success, 'failed' on error, 'skipped_no_key' when no API key was configured. */
	status: 'sent' | 'failed' | 'skipped_no_key';
}

/**
 * Minimal shape needed to persist an email_log row. Kept local so email.ts has
 * no hard dependency on DbHelper's full surface, avoiding an import cycle.
 */
export interface EmailLogger {
	logEmail(entry: {
		to: string;
		from: string;
		subject: string;
		type: EmailType;
		status: EmailSendResult['status'];
		orgId?: string | null;
		userId?: string | null;
		providerMessageId?: string | null;
		error?: string | null;
	}): Promise<void>;
}

/** Optional context used to write an email_log row from inside a sender. */
export interface SendContext {
	logger?: EmailLogger;
	orgId?: string | null;
	userId?: string | null;
}

interface ResendSuccessBody {
	id?: string;
}

async function sendEmail(apiKey: string, payload: EmailPayload): Promise<EmailSendResult> {
	try {
		const requestBody: Record<string, unknown> = {
			from: payload.from,
			to: payload.to,
			subject: payload.subject,
			html: payload.html
		};

		if (payload.replyTo) {
			requestBody.reply_to = payload.replyTo;
		}

		if (payload.attachments && payload.attachments.length > 0) {
			requestBody.attachments = payload.attachments;
		}

		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const error = await response.text();
			console.error('Resend API error:', response.status, error);
			return { ok: false, status: 'failed', error: `${response.status} ${error}`.trim() };
		}

		let providerId: string | undefined;
		try {
			const body = (await response.json()) as ResendSuccessBody;
			providerId = body?.id;
		} catch {
			// Resend should always return JSON with an id; tolerate a missing/invalid body.
			providerId = undefined;
		}

		return { ok: true, status: 'sent', providerId };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('Email send error:', error);
		return { ok: false, status: 'failed', error: message };
	}
}

/**
 * Runs a send and persists an email_log row for the attempt. Logging never
 * throws into the caller — a logging failure is swallowed so a transient DB
 * issue can't break the actual email flow.
 */
async function sendAndLog(
	apiKey: string | undefined,
	type: EmailType,
	payload: EmailPayload,
	ctx?: SendContext
): Promise<EmailSendResult> {
	let result: EmailSendResult;
	if (!apiKey) {
		console.warn(`RESEND_API_KEY not set, skipping ${type} email`);
		result = { ok: false, status: 'skipped_no_key', error: 'RESEND_API_KEY not set' };
	} else {
		result = await sendEmail(apiKey, payload);
	}

	if (ctx?.logger) {
		try {
			await ctx.logger.logEmail({
				to: payload.to,
				from: payload.from,
				subject: payload.subject,
				type,
				status: result.status,
				orgId: ctx.orgId ?? null,
				userId: ctx.userId ?? null,
				providerMessageId: result.providerId ?? null,
				error: result.error ?? null
			});
		} catch (logError) {
			console.error('Failed to write email_log row:', logError);
		}
	}

	return result;
}

/**
 * Builds an OrgBranding object from an org row + its settings, so every sender
 * call site assembles branding consistently (org name, accent, from-name, reply-to).
 */
export function buildOrgBranding(
	org: { name?: string | null } | null,
	settings: {
		accent_color?: string | null;
		email_from_name?: string | null;
		email_reply_to?: string | null;
	} | null
): OrgBranding {
	return {
		orgName: org?.name ?? undefined,
		accentColor: settings?.accent_color ?? undefined,
		emailFromName: settings?.email_from_name ?? undefined,
		emailReplyTo: settings?.email_reply_to ?? undefined
	};
}

function getContrastColor(hexColor: string): string {
	const hex = hexColor.replace('#', '');
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);
	const luma = 0.299 * r + 0.587 * g + 0.114 * b;
	return luma > 186 ? '#1b2228' : '#f4f6f7';
}

export function buildEmailTemplate(
	content: {
		title: string;
		greeting: string;
		message: string;
		ctaText: string;
		ctaUrl: string;
		footer: string;
	},
	branding?: OrgBranding
): string {
	const accentColor = branding?.accentColor ?? '#f2c037';
	const buttonTextColor = getContrastColor(accentColor);
	const orgName = branding?.orgName ?? 'PaveRate';
	const showPoweredBy = orgName !== 'PaveRate';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.title}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="background:#1b2228;padding:40px 20px;min-height:100vh;">
    <div style="max-width:480px;margin:0 auto;background:#232c34;border-radius:12px;padding:32px;border:1px solid #37444f;">
      <h1 style="color:${accentColor};margin:0 0 16px;font-size:24px;font-weight:700;">${orgName}</h1>

      <p style="color:#f4f6f7;font-size:16px;line-height:1.6;margin:0 0 12px;">
        ${content.greeting}
      </p>

      <p style="color:#cdd8e0;font-size:15px;line-height:1.6;margin:0 0 28px;">
        ${content.message}
      </p>

      <a href="${content.ctaUrl}" style="display:inline-block;padding:14px 28px;background:${accentColor};color:${buttonTextColor};text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">
        ${content.ctaText}
      </a>

      <p style="color:#7e8f9c;font-size:13px;line-height:1.5;margin:28px 0 0;padding-top:24px;border-top:1px solid #37444f;">
        ${content.footer}
      </p>${
				showPoweredBy
					? '\n      <p style="color:#7e8f9c;font-size:12px;margin:12px 0 0;text-align:center;">Powered by PaveRate</p>'
					: ''
			}
    </div>
  </div>
</body>
</html>`;
}

function buildInvitationEmailTemplate(
	params: {
		inviterName: string;
		orgName: string;
		inviteUrl: string;
	},
	branding?: OrgBranding
): string {
	const accentColor = branding?.accentColor ?? '#f2c037';
	const buttonTextColor = getContrastColor(accentColor);
	const displayOrgName = branding?.orgName ?? params.orgName;
	const showPoweredBy = displayOrgName !== 'PaveRate';

	const roadIconSvg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="20" width="32" height="8" fill="${buttonTextColor}" opacity="0.9"/>
  <rect x="16" y="22" width="3" height="4" fill="${accentColor}"/>
  <rect x="24" y="22" width="3" height="4" fill="${accentColor}"/>
  <rect x="32" y="22" width="3" height="4" fill="${accentColor}"/>
  <path d="M8 20 L6 14 L10 14 Z" fill="${buttonTextColor}" opacity="0.7"/>
  <path d="M40 20 L42 14 L38 14 Z" fill="${buttonTextColor}" opacity="0.7"/>
</svg>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been invited to ${displayOrgName}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { padding: 24px !important; }
      .header { padding: 32px 24px !important; }
      .org-name { font-size: 28px !important; }
      .cta-button { padding: 16px 32px !important; width: 100% !important; box-sizing: border-box; }
    }
  </style>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#1b2228;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1b2228;padding:20px 10px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#232c34;border:1px solid #37444f;border-radius:12px;overflow:hidden;">
          <tr>
            <td class="header" style="background:${accentColor};padding:40px 32px;text-align:center;">
              ${roadIconSvg}
              <h1 class="org-name" style="color:${buttonTextColor};margin:16px 0 0;font-size:32px;font-weight:700;line-height:1.2;">${displayOrgName}</h1>
            </td>
          </tr>
          <tr>
            <td class="container" style="padding:32px;">
              <h2 style="color:#f4f6f7;margin:0 0 24px;font-size:22px;font-weight:600;line-height:1.3;">
                You have been invited to join ${displayOrgName}
              </h2>

              <div style="background:#1b2228;border:2px solid ${accentColor};border-radius:8px;padding:20px;margin:0 0 28px;">
                <p style="color:#f4f6f7;font-size:16px;margin:0;line-height:1.5;">
                  <strong style="color:${accentColor};">${params.inviterName}</strong> has invited you to <strong>${displayOrgName}</strong>
                </p>
              </div>

              <p style="color:#cdd8e0;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Join the team and get access to:
              </p>

              <ul style="color:#cdd8e0;font-size:15px;line-height:1.8;margin:0 0 32px;padding-left:20px;">
                <li style="margin-bottom:8px;">Track daily paving progress</li>
                <li style="margin-bottom:8px;">Real-time spec compliance alerts</li>
                <li>Crew coordination tools</li>
              </ul>

              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${params.inviteUrl}" class="cta-button" style="display:inline-block;padding:16px 48px;background:${accentColor};color:${buttonTextColor};text-decoration:none;border-radius:8px;font-weight:700;font-size:18px;text-align:center;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#7e8f9c;font-size:13px;line-height:1.5;margin:28px 0 0;text-align:center;">
                This invitation expires in 7 days
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#141a1f;padding:24px 32px;border-top:1px solid #37444f;">
              <p style="color:#7e8f9c;font-size:12px;line-height:1.6;margin:0 0 ${showPoweredBy ? '12px' : '0'};text-align:center;">
                You received this because someone invited you to ${displayOrgName} on PaveRate
              </p>${
				showPoweredBy
					? `
              <p style="color:#7e8f9c;font-size:12px;margin:0;text-align:center;">
                Powered by <a href="https://paverate.com" style="color:${accentColor};text-decoration:none;">PaveRate</a>
              </p>`
					: ''
			}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendVerificationEmail(
	apiKey: string | undefined,
	to: string,
	name: string,
	token: string,
	baseUrl: string,
	branding?: OrgBranding,
	ctx?: SendContext
): Promise<EmailSendResult> {
	const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const orgName = branding?.orgName ?? 'PaveRate';

	const html = buildEmailTemplate(
		{
			title: 'Verify your email',
			greeting: `Hi ${name},`,
			message: `Thanks for signing up for ${orgName}! Click the button below to verify your email address and get full access to your account.`,
			ctaText: 'Verify Email',
			ctaUrl: verifyUrl,
			footer: `If you didn't create a ${orgName} account, you can safely ignore this email. This link will expire in 24 hours.`
		},
		branding
	);

	return await sendAndLog(
		apiKey,
		'verification',
		{
			from: `${fromName} <noreply@paverate.com>`,
			to,
			subject: `Verify your ${orgName} account`,
			html,
			replyTo: branding?.emailReplyTo
		},
		ctx
	);
}

export async function sendPasswordResetEmail(
	apiKey: string | undefined,
	to: string,
	name: string,
	token: string,
	baseUrl: string,
	branding?: OrgBranding,
	ctx?: SendContext
): Promise<EmailSendResult> {
	const resetUrl = `${baseUrl}/reset-password?token=${token}`;
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const orgName = branding?.orgName ?? 'PaveRate';

	const html = buildEmailTemplate(
		{
			title: 'Reset your password',
			greeting: `Hi ${name},`,
			message: `We received a request to reset your password. Click the button below to choose a new password. If you didn't request this, you can ignore this email.`,
			ctaText: 'Reset Password',
			ctaUrl: resetUrl,
			footer: `For security, this link will expire in 1 hour. If you didn't request a password reset, please ignore this email.`
		},
		branding
	);

	return await sendAndLog(
		apiKey,
		'password-reset',
		{
			from: `${fromName} <noreply@paverate.com>`,
			to,
			subject: `Reset your ${orgName} password`,
			html,
			replyTo: branding?.emailReplyTo
		},
		ctx
	);
}

export async function sendInvitationEmail(
	apiKey: string | undefined,
	to: string,
	inviterName: string,
	orgName: string,
	token: string,
	baseUrl: string,
	branding?: OrgBranding,
	ctx?: SendContext
): Promise<EmailSendResult> {
	const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const displayOrgName = branding?.orgName ?? orgName;

	const html = buildInvitationEmailTemplate(
		{
			inviterName,
			orgName,
			inviteUrl
		},
		branding
	);

	return await sendAndLog(
		apiKey,
		'invitation',
		{
			from: `${fromName} <noreply@paverate.com>`,
			to,
			subject: `${inviterName} invited you to ${displayOrgName} on PaveRate`,
			html,
			replyTo: branding?.emailReplyTo
		},
		ctx
	);
}

export async function sendWelcomeEmail(
	apiKey: string | undefined,
	to: string,
	name: string,
	orgName: string,
	baseUrl: string,
	branding?: OrgBranding,
	ctx?: SendContext
): Promise<EmailSendResult> {
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const displayOrgName = branding?.orgName ?? orgName;

	const html = buildEmailTemplate(
		{
			title: 'Welcome to PaveRate!',
			greeting: `Hi ${name},`,
			message: `You have successfully joined <strong>${displayOrgName}</strong> on PaveRate. You can now collaborate with your team, track paving jobs, and stay on top of daily progress.`,
			ctaText: 'Go to Dashboard',
			ctaUrl: `${baseUrl}/dashboard`,
			footer: `You received this email because you accepted an invitation to join ${displayOrgName} on PaveRate.`
		},
		branding
	);

	return await sendAndLog(
		apiKey,
		'welcome',
		{
			from: `${fromName} <noreply@paverate.com>`,
			to,
			subject: `Welcome to ${displayOrgName}!`,
			html,
			replyTo: branding?.emailReplyTo
		},
		ctx
	);
}

export function buildPreviewEmail(
	type: 'invitation' | 'verification' | 'password-reset',
	branding?: OrgBranding
): { html: string; subject: string; from: string } {
	const fromName = branding?.emailFromName ?? 'PaveRate';
	const orgName = branding?.orgName ?? 'PaveRate';
	const from = `${fromName} <noreply@paverate.com>`;

	if (type === 'invitation') {
		const html = buildEmailTemplate(
			{
				title: "You've been invited",
				greeting: 'Hi there,',
				message: `Jane Smith has invited you to join <strong>${orgName}</strong> on PaveRate. Click below to accept the invitation and get started.`,
				ctaText: 'Accept Invitation',
				ctaUrl: 'https://paverate.com/accept-invite?token=preview',
				footer: 'This invitation will expire in 7 days.'
			},
			branding
		);
		return {
			html,
			subject: `Jane Smith invited you to ${orgName} on PaveRate`,
			from
		};
	}

	if (type === 'verification') {
		const html = buildEmailTemplate(
			{
				title: 'Verify your email',
				greeting: 'Hi John,',
				message: `Thanks for signing up for ${orgName}! Click the button below to verify your email address and get full access to your account.`,
				ctaText: 'Verify Email',
				ctaUrl: 'https://paverate.com/api/auth/verify-email?token=preview',
				footer: `If you didn't create a ${orgName} account, you can safely ignore this email. This link will expire in 24 hours.`
			},
			branding
		);
		return {
			html,
			subject: `Verify your ${orgName} account`,
			from
		};
	}

	// password-reset
	const html = buildEmailTemplate(
		{
			title: 'Reset your password',
			greeting: 'Hi John,',
			message: 'We received a request to reset your password. Click the button below to choose a new password. If you didn\'t request this, you can ignore this email.',
			ctaText: 'Reset Password',
			ctaUrl: 'https://paverate.com/reset-password?token=preview',
			footer: 'For security, this link will expire in 1 hour. If you didn\'t request a password reset, please ignore this email.'
		},
		branding
	);
	return {
		html,
		subject: `Reset your ${orgName} password`,
		from
	};
}

export function buildPDFShareEmail(filename: string, branding?: OrgBranding): string {
	const accentColor = branding?.accentColor ?? '#f2c037';
	const buttonTextColor = getContrastColor(accentColor);
	const orgName = branding?.orgName ?? 'PaveRate';
	const showPoweredBy = orgName !== 'PaveRate';

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PaveRate Report: ${filename}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="background:#1b2228;padding:40px 20px;min-height:100vh;">
    <div style="max-width:480px;margin:0 auto;background:#232c34;border-radius:12px;padding:32px;border:1px solid #37444f;">
      <h1 style="color:${accentColor};margin:0 0 16px;font-size:24px;font-weight:700;">${orgName}</h1>

      <p style="color:#f4f6f7;font-size:16px;line-height:1.6;margin:0 0 12px;">
        A new paving report is ready for your review.
      </p>

      <p style="color:#cdd8e0;font-size:15px;line-height:1.6;margin:0 0 28px;">
        The attached PDF contains the latest production data, compliance metrics, and field notes.
      </p>

      <div style="background:#1b2228;border:2px solid ${accentColor};border-radius:8px;padding:20px;margin:0 0 28px;">
        <p style="color:#f4f6f7;font-size:14px;margin:0;line-height:1.5;">
          📄 <strong style="color:${accentColor};">${filename}</strong>
        </p>
      </div>

      <p style="color:#7e8f9c;font-size:13px;line-height:1.5;margin:28px 0 0;padding-top:24px;border-top:1px solid #37444f;">
        This report was automatically generated by PaveRate.
      </p>${
			showPoweredBy
				? '\n      <p style="color:#7e8f9c;font-size:12px;margin:12px 0 0;text-align:center;">Powered by PaveRate</p>'
				: ''
		}
    </div>
  </div>
</body>
</html>`;
}
