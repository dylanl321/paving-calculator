type D1Database = import('@cloudflare/workers-types').D1Database;

export interface EmailTemplate {
  id: string;
  org_id: string | null;
  template_key: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  updated_at: number;
  updated_by: string | null;
}

export interface OrgBrandingData {
  org_name: string;
  logo_url: string | null;
  accent_color: string | null;
}

export const SYSTEM_TEMPLATE_KEYS = ['password_reset', 'admin_notification', 'email_verification'] as const;
export const ORG_TEMPLATE_KEYS = ['invite', 'welcome', 'eod_summary'] as const;
export type TemplateKey =
  | typeof SYSTEM_TEMPLATE_KEYS[number]
  | typeof ORG_TEMPLATE_KEYS[number];

// ---------------------------------------------------------------------------
// Shared CSS reset injected into every template
// ---------------------------------------------------------------------------
const EMAIL_BASE_STYLES = `
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
`.trim();

// ---------------------------------------------------------------------------
// SYSTEM_DEFAULTS — keyed templates used when no DB row exists
// ---------------------------------------------------------------------------
export const SYSTEM_DEFAULTS: Record<
  TemplateKey,
  { subject: string; body_html: string; body_text: string }
> = {
  // -------------------------------------------------------------------------
  // password_reset — PaveRate branded
  // -------------------------------------------------------------------------
  password_reset: {
    subject: 'Reset your PaveRate password',
    body_html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Reset your PaveRate password</title>
  <style type="text/css">${EMAIL_BASE_STYLES}</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
  <!-- Outer wrapper -->
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <!-- Container -->
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color:#1a1a2e;padding:28px 40px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#f5a623;letter-spacing:-0.5px;">Pave</span><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Rate</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 20px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#1a1a2e;line-height:1.3;">Reset your password</h1>
                    <p style="margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:#555555;line-height:1.6;">We received a request to reset the password for your PaveRate account. Click the button below to choose a new password:</p>
                  </td>
                </tr>
                <!-- CTA button -->
                <tr>
                  <td align="center" style="padding:8px 0 24px 0;">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius:6px;background-color:#f5a623;">
                          <a href="{{reset_link}}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:600;color:#1a1a2e;text-decoration:none;border-radius:6px;mso-padding-alt:0;text-align:center;">Reset Password</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Expiry notice -->
                <tr>
                  <td style="padding:0 0 16px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fff8ec;border-left:4px solid #f5a623;border-radius:0 4px 4px 0;">
                      <tr>
                        <td style="padding:12px 16px;">
                          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#8a6200;line-height:1.5;">This link expires in <strong>{{expiry_hours}} hours</strong>. After that you will need to request a new reset link.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#888888;line-height:1.5;">If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.</p>
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#888888;line-height:1.5;">If the button above does not work, copy and paste this URL into your browser:</p>
                    <p style="margin:8px 0 0 0;font-family:monospace;font-size:12px;color:#0066cc;word-break:break-all;">{{reset_link}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;line-height:1.5;text-align:center;">&copy; 2026 PaveRate &mdash; Built for asphalt paving crews</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    body_text: `RESET YOUR PAVEATE PASSWORD
===========================

We received a request to reset the password for your PaveRate account.

Click the link below to reset your password:
{{reset_link}}

This link expires in {{expiry_hours}} hours.

If you did not request a password reset, you can safely ignore this email.

-- PaveRate Team`
  },

  // -------------------------------------------------------------------------
  // admin_notification — PaveRate branded system alert
  // -------------------------------------------------------------------------
  admin_notification: {
    subject: '[PaveRate Admin] {{alert_title}}',
    body_html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>PaveRate Admin Notification</title>
  <style type="text/css">${EMAIL_BASE_STYLES}</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color:#1a1a2e;padding:28px 40px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#f5a623;">Pave</span><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#ffffff;">Rate</span>
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#888888;margin-left:8px;vertical-align:middle;">ADMIN ALERT</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Alert banner -->
          <tr>
            <td style="background-color:#fff3cd;border-bottom:3px solid #ffc107;padding:16px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="32" valign="middle" style="padding-right:12px;">
                    <span style="font-size:24px;">&#9888;</span>
                  </td>
                  <td valign="middle">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;color:#856404;">{{alert_title}}</p>
                    <p style="margin:4px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#8a6200;">Severity: {{severity}} &mdash; {{timestamp}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 20px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <p style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:#333333;line-height:1.6;">{{message}}</p>
                  </td>
                </tr>
                <!-- Details block -->
                <tr>
                  <td style="padding:0 0 16px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;">
                      <tr>
                        <td style="padding:16px 20px;">
                          <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;font-weight:600;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Details</p>
                          <p style="margin:0;font-family:monospace;font-size:13px;color:#333333;white-space:pre-wrap;word-break:break-word;">{{details}}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#888888;">Affected org: <strong>{{org_name}}</strong> &bull; User: <strong>{{user_email}}</strong></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;line-height:1.5;text-align:center;">&copy; 2026 PaveRate &mdash; This alert was sent to PaveRate administrators</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    body_text: `PAVEATE ADMIN NOTIFICATION
==========================

Alert: {{alert_title}}
Severity: {{severity}}
Time: {{timestamp}}

{{message}}

Details:
{{details}}

Org: {{org_name}}
User: {{user_email}}

-- PaveRate System`
  },

  // -------------------------------------------------------------------------
  // invite — org branded, join link + inviter name
  // -------------------------------------------------------------------------
  invite: {
    subject: "You're invited to join {{org_name}} on PaveRate",
    body_html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>You're invited to {{org_name}}</title>
  <style type="text/css">${EMAIL_BASE_STYLES}</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Org header with optional logo -->
          <tr>
            <td align="center" style="background-color:#1a1a2e;padding:28px 40px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    {{#if logo_url}}
                    <img src="{{logo_url}}" alt="{{org_name}}" width="120" style="display:block;max-width:120px;margin:0 auto 12px auto;border-radius:4px;">
                    {{/if}}
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">{{org_name}}</p>
                    <p style="margin:4px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#888888;">powered by <span style="color:#f5a623;">PaveRate</span></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 20px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#1a1a2e;line-height:1.3;">You've been invited!</h1>
                    <p style="margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:#555555;line-height:1.6;"><strong>{{invited_by}}</strong> has invited you to join <strong>{{org_name}}</strong> on PaveRate &mdash; the production tracking app built for asphalt paving crews.</p>
                  </td>
                </tr>
                <!-- What you get -->
                <tr>
                  <td style="padding:0 0 24px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8f9fa;border-radius:6px;">
                      <tr>
                        <td style="padding:20px 24px;">
                          <p style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:700;color:#1a1a2e;">With PaveRate you can:</p>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#555555;">&#10003;&nbsp; Track daily paving production in real time</td></tr>
                            <tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#555555;">&#10003;&nbsp; Log tonnage, mix, and crew notes from the field</td></tr>
                            <tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#555555;">&#10003;&nbsp; View end-of-day reports and summaries</td></tr>
                            <tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#555555;">&#10003;&nbsp; Collaborate with your crew and management</td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- CTA -->
                <tr>
                  <td align="center" style="padding:0 0 24px 0;">
                    <table border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="border-radius:6px;background-color:{{accent_color}};">
                          <a href="{{invite_link}}" target="_blank" style="display:inline-block;padding:14px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">Accept Invitation</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td>
                    <p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#888888;">This invitation expires in <strong>{{expiry_days}} days</strong>. After that you will need to request a new invitation.</p>
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#888888;">Or copy this URL into your browser:<br><span style="font-family:monospace;font-size:12px;color:#0066cc;word-break:break-all;">{{invite_link}}</span></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;line-height:1.5;text-align:center;">&copy; 2026 PaveRate &mdash; <a href="https://paverate.com" style="color:#888888;text-decoration:none;">paverate.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    body_text: `YOU'VE BEEN INVITED TO {{org_name}}
=====================================

{{invited_by}} has invited you to join {{org_name}} on PaveRate.

Accept your invitation here:
{{invite_link}}

This invitation expires in {{expiry_days}} days.

-- PaveRate Team
https://paverate.com`
  },

  // -------------------------------------------------------------------------
  // welcome — org branded, getting started guide
  // -------------------------------------------------------------------------
  welcome: {
    subject: 'Welcome to {{org_name}} on PaveRate',
    body_html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Welcome to {{org_name}}</title>
  <style type="text/css">${EMAIL_BASE_STYLES}</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Org header -->
          <tr>
            <td align="center" style="background-color:#1a1a2e;padding:28px 40px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    {{#if logo_url}}
                    <img src="{{logo_url}}" alt="{{org_name}}" width="120" style="display:block;max-width:120px;margin:0 auto 12px auto;border-radius:4px;">
                    {{/if}}
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">{{org_name}}</p>
                    <p style="margin:4px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#888888;">powered by <span style="color:#f5a623;">PaveRate</span></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Hero -->
          <tr>
            <td style="padding:40px 40px 20px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:26px;font-weight:700;color:#1a1a2e;line-height:1.3;">Welcome, {{first_name}}! &#128075;</h1>
                    <p style="margin:0 0 24px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:#555555;line-height:1.6;">Your account is all set. You're now part of <strong>{{org_name}}</strong> on PaveRate. Here's how to get started:</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Getting started steps -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <!-- Step 1 -->
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width:28px;height:28px;background-color:#f5a623;border-radius:50%;text-align:center;line-height:28px;">
                            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:700;color:#1a1a2e;">1</span>
                          </div>
                        </td>
                        <td valign="top" style="padding-left:12px;">
                          <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:700;color:#1a1a2e;">Open PaveRate on your phone</p>
                          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#666666;">PaveRate is a mobile-first app. Visit it in your phone's browser for the best experience.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Step 2 -->
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width:28px;height:28px;background-color:#f5a623;border-radius:50%;text-align:center;line-height:28px;">
                            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:700;color:#1a1a2e;">2</span>
                          </div>
                        </td>
                        <td valign="top" style="padding-left:12px;">
                          <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:700;color:#1a1a2e;">Log your first paving session</p>
                          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#666666;">Tap "New Session" and enter tonnage, mix type, and crew details. It only takes 2 minutes.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Step 3 -->
                <tr>
                  <td style="padding:12px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="40" valign="top">
                          <div style="width:28px;height:28px;background-color:#f5a623;border-radius:50%;text-align:center;line-height:28px;">
                            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;font-weight:700;color:#1a1a2e;">3</span>
                          </div>
                        </td>
                        <td valign="top" style="padding-left:12px;">
                          <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:700;color:#1a1a2e;">Review your end-of-day report</p>
                          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#666666;">At the end of the day, check your production summary and share it with your team.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td align="center" style="padding:0 40px 32px 40px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:6px;background-color:{{accent_color}};">
                    <a href="{{app_url}}" target="_blank" style="display:inline-block;padding:14px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">Open PaveRate</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;line-height:1.5;text-align:center;">Questions? Contact your team admin or visit <a href="https://paverate.com" style="color:#888888;">paverate.com</a><br>&copy; 2026 PaveRate</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    body_text: `WELCOME TO {{org_name}}, {{first_name}}!
=========================================

Your PaveRate account is ready. Here's how to get started:

1. Open PaveRate at {{app_url}}
2. Log your first paving session (takes ~2 minutes)
3. Review your end-of-day report

Open PaveRate: {{app_url}}

Questions? Contact your team admin.

-- PaveRate Team
https://paverate.com`
  },

  // -------------------------------------------------------------------------
  // eod_summary — org branded, daily production stats
  // -------------------------------------------------------------------------
  eod_summary: {
    subject: '{{org_name}} — End of Day Summary for {{date}}',
    body_html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>End of Day Summary</title>
  <style type="text/css">${EMAIL_BASE_STYLES}</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Org header -->
          <tr>
            <td align="center" style="background-color:#1a1a2e;padding:28px 40px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    {{#if logo_url}}
                    <img src="{{logo_url}}" alt="{{org_name}}" width="120" style="display:block;max-width:120px;margin:0 auto 12px auto;border-radius:4px;">
                    {{/if}}
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:700;color:#ffffff;">{{org_name}}</p>
                    <p style="margin:4px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#888888;">End of Day Summary &bull; {{date}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Stats row -->
          <tr>
            <td style="padding:32px 40px 16px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h2 style="margin:0 0 20px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:18px;font-weight:700;color:#1a1a2e;">Production Stats</h2>
                  </td>
                </tr>
              </table>
              <!-- 3-column stat boxes -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td width="31%" style="padding:0 8px 0 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8f9fa;border-radius:6px;border-top:3px solid #f5a623;">
                      <tr>
                        <td style="padding:16px 14px;">
                          <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;font-weight:600;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Tonnage</p>
                          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#1a1a2e;">{{total_tons}}</p>
                          <p style="margin:2px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#888888;">tons placed</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="31%" style="padding:0 8px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8f9fa;border-radius:6px;border-top:3px solid #0066cc;">
                      <tr>
                        <td style="padding:16px 14px;">
                          <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;font-weight:600;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Area</p>
                          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#1a1a2e;">{{total_sqyd}}</p>
                          <p style="margin:2px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#888888;">sq yards paved</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="31%" style="padding:0 0 0 8px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8f9fa;border-radius:6px;border-top:3px solid #28a745;">
                      <tr>
                        <td style="padding:16px 14px;">
                          <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;font-weight:600;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Loads</p>
                          <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#1a1a2e;">{{total_loads}}</p>
                          <p style="margin:2px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#888888;">truck loads</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Mix breakdown -->
          <tr>
            <td style="padding:8px 40px 24px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h3 style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:700;color:#1a1a2e;">Mix Breakdown</h3>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#f8f9fa;border-radius:6px;padding:16px 20px;">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#333333;white-space:pre-line;">{{mix_breakdown}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Crew notes -->
          <tr>
            <td style="padding:0 40px 24px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <h3 style="margin:0 0 12px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:700;color:#1a1a2e;">Crew Notes</h3>
                  </td>
                </tr>
                <tr>
                  <td style="background-color:#fffbf0;border-left:3px solid #f5a623;border-radius:0 4px 4px 0;padding:14px 16px;">
                    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#555555;line-height:1.6;white-space:pre-line;">{{crew_notes}}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td align="center" style="padding:0 40px 32px 40px;">
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="border-radius:6px;background-color:{{accent_color}};">
                    <a href="{{report_url}}" target="_blank" style="display:inline-block;padding:12px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">View Full Report</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px 40px;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#aaaaaa;line-height:1.5;text-align:center;">Generated by PaveRate &bull; <a href="https://paverate.com" style="color:#888888;text-decoration:none;">paverate.com</a><br>&copy; 2026 PaveRate</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    body_text: `{{org_name}} - END OF DAY SUMMARY
{{date}}
================================

PRODUCTION STATS
----------------
Tonnage:  {{total_tons}} tons placed
Area:     {{total_sqyd}} sq yards paved
Loads:    {{total_loads}} truck loads

MIX BREAKDOWN
-------------
{{mix_breakdown}}

CREW NOTES
----------
{{crew_notes}}

View full report: {{report_url}}

-- PaveRate
https://paverate.com`
  },

  // -------------------------------------------------------------------------
  // email_verification — PaveRate branded (system-level)
  // -------------------------------------------------------------------------
  email_verification: {
    subject: 'Verify your PaveRate account',
    body_html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:40px 10px;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" style="background-color:#1a1a2e;padding:28px 40px;">
              <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#f5a623;letter-spacing:-0.5px;">Pave</span><span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:24px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Rate</span>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 20px 40px;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:22px;font-weight:600;color:#1a1a2e;margin:0 0 16px;">Verify your email address</p>
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;color:#333333;line-height:1.6;margin:0 0 24px;">Hi {{name}}, thanks for signing up for PaveRate! Click the button below to verify your email address and activate your account.</p>
              <table border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background-color:#f5a623;">
                    <a href="{{verify_link}}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:600;color:#1a1a2e;text-decoration:none;border-radius:6px;">Verify Email</a>
                  </td>
                </tr>
              </table>
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#888888;line-height:1.5;margin:24px 0 0;">If you did not create a PaveRate account, you can safely ignore this email. This link expires in 24 hours.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f8f8;padding:20px 40px;border-top:1px solid #eeeeee;">
              <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#888888;margin:0;">PaveRate &mdash; Asphalt Paving Tools</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    body_text: `Hi {{name}},

Thanks for signing up for PaveRate! Click the link below to verify your email address:

{{verify_link}}

This link expires in 24 hours.

If you did not create a PaveRate account, you can safely ignore this email.

-- PaveRate
https://paverate.com`
  }
};

/** @deprecated Use SYSTEM_DEFAULTS instead */
export const DEFAULT_TEMPLATES = SYSTEM_DEFAULTS;

// ---------------------------------------------------------------------------
// getTemplate — looks up DB row first, falls back to SYSTEM_DEFAULTS
// ---------------------------------------------------------------------------
export async function getTemplate(
  db: D1Database,
  orgId: string | null,
  templateKey: TemplateKey
): Promise<{ subject: string; body_html: string; body_text: string | null }> {
  const isSystemTemplate = SYSTEM_TEMPLATE_KEYS.includes(templateKey as typeof SYSTEM_TEMPLATE_KEYS[number]);

  // System templates (password_reset, admin_notification) skip org lookup
  if (isSystemTemplate) {
    const systemDefault = await db
      .prepare('SELECT subject, body_html, body_text FROM email_templates WHERE org_id IS NULL AND template_key = ?')
      .bind(templateKey)
      .first<{ subject: string; body_html: string; body_text: string | null }>();

    return systemDefault ?? SYSTEM_DEFAULTS[templateKey];
  }

  // Org templates: try org-specific row first
  if (orgId) {
    const orgTemplate = await db
      .prepare('SELECT subject, body_html, body_text FROM email_templates WHERE org_id = ? AND template_key = ?')
      .bind(orgId, templateKey)
      .first<{ subject: string; body_html: string; body_text: string | null }>();

    if (orgTemplate) {
      return orgTemplate;
    }
  }

  // Try system-level DB default (org_id IS NULL) then fall back to SYSTEM_DEFAULTS constant
  const systemDefault = await db
    .prepare('SELECT subject, body_html, body_text FROM email_templates WHERE org_id IS NULL AND template_key = ?')
    .bind(templateKey)
    .first<{ subject: string; body_html: string; body_text: string | null }>();

  return systemDefault ?? SYSTEM_DEFAULTS[templateKey];
}

// ---------------------------------------------------------------------------
// renderTemplate — replace {{variable}} placeholders
// ---------------------------------------------------------------------------
export function renderTemplate(
  template: { subject: string; body_html: string; body_text: string | null },
  vars: Record<string, string>
): { subject: string; body_html: string; body_text: string | null } {
  const replace = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const lowerKey = key.toLowerCase();
      const foundKey = Object.keys(vars).find(k => k.toLowerCase() === lowerKey);
      return foundKey ? vars[foundKey] : '';
    });
  };

  return {
    subject: replace(template.subject),
    body_html: replace(template.body_html),
    body_text: template.body_text ? replace(template.body_text) : null
  };
}

// ---------------------------------------------------------------------------
// getOrgBranding — fetch org name, logo, and accent colour from the DB
// ---------------------------------------------------------------------------
export async function getOrgBranding(
  db: D1Database,
  orgId: string
): Promise<OrgBrandingData> {
  const row = await db
    .prepare('SELECT o.name, os.logo_url, os.accent_color FROM orgs o LEFT JOIN org_settings os ON os.org_id = o.id WHERE o.id = ?')
    .bind(orgId)
    .first<{ name: string; logo_url: string | null; accent_color: string | null }>();

  return {
    org_name: row?.name ?? 'PaveRate',
    logo_url: row?.logo_url ?? null,
    accent_color: row?.accent_color ?? '#f5a623'
  };
}

/** Alias for getOrgBranding */
export const getEmailWrapper = getOrgBranding;
