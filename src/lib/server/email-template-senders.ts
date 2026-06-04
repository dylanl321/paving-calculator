/**
 * Template-based email senders.
 *
 * These functions use getTemplate/renderTemplate from email-templates.ts
 * so all email content is managed in the DB/defaults rather than hardcoded HTML.
 */

import { getTemplate, renderTemplate, getOrgBranding, type TemplateKey } from '$lib/server/email-templates';
import type { EmailSendResult, EmailType, SendContext } from '$lib/server/email';

type D1Database = import('@cloudflare/workers-types').D1Database;

interface ResendSuccessBody {
  id?: string;
}

async function sendViaResend(
  apiKey: string,
  payload: {
    from: string;
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
  }
): Promise<EmailSendResult> {
  try {
    const body: Record<string, unknown> = {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html
    };
    if (payload.replyTo) body.reply_to = payload.replyTo;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend API error:', response.status, error);
      return { ok: false, status: 'failed', error: `${response.status} ${error}`.trim() };
    }

    let providerId: string | undefined;
    try {
      const rb = (await response.json()) as ResendSuccessBody;
      providerId = rb?.id;
    } catch {
      providerId = undefined;
    }
    return { ok: true, status: 'sent', providerId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Email send error:', error);
    return { ok: false, status: 'failed', error: message };
  }
}

async function sendAndLogTemplated(
  apiKey: string | undefined,
  type: EmailType,
  payload: { from: string; to: string; subject: string; html: string; replyTo?: string },
  ctx?: SendContext
): Promise<EmailSendResult> {
  let result: EmailSendResult;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY not set, skipping ${type} email`);
    result = { ok: false, status: 'skipped_no_key', error: 'RESEND_API_KEY not set' };
  } else {
    result = await sendViaResend(apiKey, payload);
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
 * Low-level template send: look up template, render vars, and send.
 */
export async function sendTemplatedEmail(
  db: D1Database,
  apiKey: string | undefined,
  type: EmailType,
  to: string,
  templateKey: TemplateKey,
  vars: Record<string, string>,
  opts: {
    orgId?: string | null;
    fromName?: string;
    replyTo?: string;
    ctx?: SendContext;
  } = {}
): Promise<EmailSendResult> {
  const tmpl = await getTemplate(db, opts.orgId ?? null, templateKey);
  const rendered = renderTemplate(tmpl, vars);
  const fromName = opts.fromName ?? 'PaveRate';

  return sendAndLogTemplated(
    apiKey,
    type,
    {
      from: `${fromName} <noreply@paverate.com>`,
      to,
      subject: rendered.subject,
      html: rendered.body_html,
      replyTo: opts.replyTo
    },
    opts.ctx
  );
}

/** Send email verification email via template */
export async function sendVerificationEmailTemplated(
  db: D1Database,
  apiKey: string | undefined,
  to: string,
  name: string,
  token: string,
  baseUrl: string,
  ctx?: SendContext
): Promise<EmailSendResult> {
  const verifyLink = `${baseUrl}/api/auth/verify-email?token=${token}`;
  return sendTemplatedEmail(db, apiKey, 'verification', to, 'email_verification', {
    name,
    email: to,
    verify_link: verifyLink
  }, { orgId: null, ctx });
}

/** Send password reset email via template */
export async function sendPasswordResetEmailTemplated(
  db: D1Database,
  apiKey: string | undefined,
  to: string,
  name: string,
  token: string,
  baseUrl: string,
  orgId: string | null,
  ctx?: SendContext
): Promise<EmailSendResult> {
  const resetLink = `${baseUrl}/reset-password?token=${token}`;
  return sendTemplatedEmail(db, apiKey, 'password-reset', to, 'password_reset', {
    name,
    email: to,
    reset_link: resetLink,
    expiry_hours: '1'
  }, { orgId, ctx });
}

/** Send org invitation email via template */
export async function sendInvitationEmailTemplated(
  db: D1Database,
  apiKey: string | undefined,
  to: string,
  inviterName: string,
  orgId: string,
  token: string,
  baseUrl: string,
  ctx?: SendContext
): Promise<EmailSendResult> {
  const branding = await getOrgBranding(db, orgId);
  const inviteLink = `${baseUrl}/accept-invite?token=${token}`;
  return sendTemplatedEmail(db, apiKey, 'invitation', to, 'invite', {
    org_name: branding.org_name,
    invited_by: inviterName,
    invite_link: inviteLink,
    expiry_days: '7',
    logo_url: branding.logo_url ?? '',
    accent_color: branding.accent_color ?? '#f5a623'
  }, { orgId, fromName: branding.org_name, ctx });
}

/** Send welcome email via template after accepting an invite */
export async function sendWelcomeEmailTemplated(
  db: D1Database,
  apiKey: string | undefined,
  to: string,
  name: string,
  orgId: string,
  baseUrl: string,
  ctx?: SendContext
): Promise<EmailSendResult> {
  const branding = await getOrgBranding(db, orgId);
  const firstName = name.split(' ')[0] ?? name;
  return sendTemplatedEmail(db, apiKey, 'welcome', to, 'welcome', {
    org_name: branding.org_name,
    first_name: firstName,
    app_url: `${baseUrl}/dashboard`,
    logo_url: branding.logo_url ?? '',
    accent_color: branding.accent_color ?? '#f5a623'
  }, { orgId, fromName: branding.org_name, ctx });
}
