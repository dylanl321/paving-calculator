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

export const SYSTEM_TEMPLATE_KEYS = ['password_reset', 'admin_notif'] as const;
export const ORG_TEMPLATE_KEYS = ['invite', 'welcome', 'eod_report', 'daily_summary'] as const;
export type TemplateKey = typeof SYSTEM_TEMPLATE_KEYS[number] | typeof ORG_TEMPLATE_KEYS[number];

export const DEFAULT_TEMPLATES: Record<TemplateKey, { subject: string; body_html: string; body_text: string }> = {
  password_reset: {
    subject: 'Reset your PaveRate password',
    body_html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin: 0 0 20px 0;">Reset your password</h1>
    <p style="margin: 0 0 20px 0;">Click the link below to reset your PaveRate password:</p>
    <a href="{{reset_link}}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">Reset Password</a>
    <p style="margin: 20px 0 0 0; color: #666; font-size: 14px;">This link expires in {{expiry_hours}} hours. If you did not request this, please ignore this email.</p>
  </div>
  <p style="margin: 20px 0 0 0; color: #999; font-size: 12px; text-align: center;">&copy; 2026 PaveRate</p>
</body>
</html>
    `,
    body_text: 'Reset your PaveRate password: {{reset_link}}\n\nThis link expires in {{expiry_hours}} hours.'
  },
  admin_notif: {
    subject: 'PaveRate Admin Notification',
    body_html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; border-radius: 4px;">
    <h2 style="color: #856404; margin: 0 0 15px 0;">Admin Notification</h2>
    <p style="margin: 0 0 10px 0; color: #333;">{{message}}</p>
  </div>
  <p style="margin: 20px 0 0 0; color: #999; font-size: 12px; text-align: center;">&copy; 2026 PaveRate</p>
</body>
</html>
    `,
    body_text: 'PaveRate Admin Notification\n\n{{message}}'
  },
  invite: {
    subject: 'You\'re invited to {{org_name}} on PaveRate',
    body_html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    {{#if logo_url}}
    <img src="{{logo_url}}" alt="{{org_name}}" style="max-width: 120px; margin-bottom: 20px;">
    {{/if}}
    <h1 style="color: #1a1a1a; margin: 0 0 20px 0;">Join {{org_name}}</h1>
    <p style="margin: 0 0 20px 0;">{{invited_by}} has invited you to join {{org_name}} on PaveRate.</p>
    <a href="{{invite_link}}" style="display: inline-block; background: {{accent_color}}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">Accept Invitation</a>
    <p style="margin: 20px 0 0 0; color: #666; font-size: 14px;">This invitation expires in {{expiry_days}} days.</p>
  </div>
  <p style="margin: 20px 0 0 0; color: #999; font-size: 12px; text-align: center;">Powered by <a href="https://paverate.com" style="color: #0066cc;">PaveRate</a></p>
</body>
</html>
    `,
    body_text: 'Join {{org_name}} on PaveRate\n\n{{invited_by}} has invited you to join {{org_name}}.\n\nAccept invitation: {{invite_link}}\n\nThis invitation expires in {{expiry_days}} days.\n\nPowered by PaveRate (https://paverate.com)'
  },
  welcome: {
    subject: 'Welcome to {{org_name}}',
    body_html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    {{#if logo_url}}
    <img src="{{logo_url}}" alt="{{org_name}}" style="max-width: 120px; margin-bottom: 20px;">
    {{/if}}
    <h1 style="color: #1a1a1a; margin: 0 0 20px 0;">Welcome to {{org_name}}!</h1>
    <p style="margin: 0 0 15px 0;">Your account has been created. You can now access PaveRate and start managing your paving projects.</p>
    <a href="{{app_url}}" style="display: inline-block; background: {{accent_color}}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0;">Open PaveRate</a>
  </div>
  <p style="margin: 20px 0 0 0; color: #999; font-size: 12px; text-align: center;">Powered by <a href="https://paverate.com" style="color: #0066cc;">PaveRate</a></p>
</body>
</html>
    `,
    body_text: 'Welcome to {{org_name}}!\n\nYour account has been created. You can now access PaveRate at {{app_url}}\n\nPowered by PaveRate (https://paverate.com)'
  },
  eod_report: {
    subject: '{{org_name}} - End of Day Report for {{date}}',
    body_html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    {{#if logo_url}}
    <img src="{{logo_url}}" alt="{{org_name}}" style="max-width: 120px; margin-bottom: 20px;">
    {{/if}}
    <h1 style="color: #1a1a1a; margin: 0 0 10px 0;">End of Day Report</h1>
    <p style="color: #666; margin: 0 0 20px 0; font-size: 14px;">{{date}}</p>
    <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 15px;">
      {{report_content}}
    </div>
  </div>
  <p style="margin: 20px 0 0 0; color: #999; font-size: 12px; text-align: center;">Powered by <a href="https://paverate.com" style="color: #0066cc;">PaveRate</a></p>
</body>
</html>
    `,
    body_text: '{{org_name}} - End of Day Report for {{date}}\n\n{{report_content}}\n\nPowered by PaveRate (https://paverate.com)'
  },
  daily_summary: {
    subject: '{{org_name}} - Daily Summary for {{date}}',
    body_html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    {{#if logo_url}}
    <img src="{{logo_url}}" alt="{{org_name}}" style="max-width: 120px; margin-bottom: 20px;">
    {{/if}}
    <h1 style="color: #1a1a1a; margin: 0 0 10px 0;">Daily Summary</h1>
    <p style="color: #666; margin: 0 0 20px 0; font-size: 14px;">{{date}}</p>
    <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 15px;">
      {{summary_content}}
    </div>
  </div>
  <p style="margin: 20px 0 0 0; color: #999; font-size: 12px; text-align: center;">Powered by <a href="https://paverate.com" style="color: #0066cc;">PaveRate</a></p>
</body>
</html>
    `,
    body_text: '{{org_name}} - Daily Summary for {{date}}\n\n{{summary_content}}\n\nPowered by PaveRate (https://paverate.com)'
  }
};

export async function getTemplate(
  db: D1Database,
  orgId: string | null,
  templateKey: TemplateKey
): Promise<{ subject: string; body_html: string; body_text: string | null }> {
  const isSystemTemplate = SYSTEM_TEMPLATE_KEYS.includes(templateKey as any);

  if (isSystemTemplate) {
    return DEFAULT_TEMPLATES[templateKey];
  }

  if (orgId) {
    const orgTemplate = await db
      .prepare('SELECT subject, body_html, body_text FROM email_templates WHERE org_id = ? AND template_key = ?')
      .bind(orgId, templateKey)
      .first<{ subject: string; body_html: string; body_text: string | null }>();

    if (orgTemplate) {
      return orgTemplate;
    }
  }

  const systemDefault = await db
    .prepare('SELECT subject, body_html, body_text FROM email_templates WHERE org_id IS NULL AND template_key = ?')
    .bind(templateKey)
    .first<{ subject: string; body_html: string; body_text: string | null }>();

  if (systemDefault) {
    return systemDefault;
  }

  return DEFAULT_TEMPLATES[templateKey];
}

export function renderTemplate(
  template: { subject: string; body_html: string; body_text: string | null },
  vars: Record<string, string>
): { subject: string; body_html: string; body_text: string | null } {
  const replace = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const lowerKey = key.toLowerCase();
      const foundKey = Object.keys(vars).find(k => k.toLowerCase() === lowerKey);
      return foundKey ? vars[foundKey] : match;
    });
  };

  return {
    subject: replace(template.subject),
    body_html: replace(template.body_html),
    body_text: template.body_text ? replace(template.body_text) : null
  };
}

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
    accent_color: row?.accent_color ?? null
  };
}

/** Alias for getOrgBranding - returns email wrapper branding (logo, color, name) for an org. */
export const getEmailWrapper = getOrgBranding;
