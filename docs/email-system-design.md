# PaveRate Email System Design

## Overview

PaveRate uses [Resend](https://resend.com) as its email delivery provider, accessed via the REST API
using the `RESEND_API_KEY` environment variable. All email sends go through
`src/lib/server/email.ts`, are logged to the `email_log` D1 table, and now draw their HTML from
the template system in `src/lib/server/email-templates.ts`.

---

## Current Email Types

### Implemented

| EmailType constant | Trigger | Sender function |
|---|---|---|
| `verification` | User registers or resends verification | `sendVerificationEmail()` |
| `password-reset` | Forgot-password flow or admin trigger | `sendPasswordResetEmail()` |
| `invitation` | Admin invites a new team member | `sendInvitationEmail()` |
| `welcome` | User accepts an org invitation | `sendWelcomeEmail()` |
| `report` | Scheduled report run (daily / weekly / monthly) | `sendReportEmail()` in `/api/email-reports/send` |

### Planned (template keys exist, send path not yet wired)

| TemplateKey | EmailType constant | Trigger |
|---|---|---|
| `eod_report` | `eod_report` | End-of-day summary per job site, triggered at shift end |
| `admin_notif` | `admin_notification` | System alerts to PaveRate admins |

---

## Branding Rules

PaveRate applies a two-tier branding model.

### System emails - PaveRate brand only

These emails are sent on behalf of the PaveRate platform. Org branding must never override the
sender identity. Templates are resolved from `DEFAULT_TEMPLATES` only (no org override lookup).

Applies to: `password_reset`, `admin_notif`

- **From**: `PaveRate <noreply@paverate.com>`
- **No "Powered by" footer** (they ARE PaveRate)
- Template key is in `SYSTEM_TEMPLATE_KEYS` in `email-templates.ts`; `getTemplate()` short-circuits
  the D1 lookup and returns the hardcoded default directly.

### Org emails - org brand plus "Powered by PaveRate" footer

These emails are sent on behalf of the organization. When an org has custom branding set, it is
applied. The "Powered by PaveRate" footer is part of every org template and links to paverate.com.

Applies to: `invite`, `welcome`, `eod_report`, `daily_summary`

- **From**: `{org.emailFromName ?? 'PaveRate'} <noreply@paverate.com>`
- **"Powered by PaveRate" footer** is baked into the default org template HTML
- Template key is in `ORG_TEMPLATE_KEYS`; `getTemplate()` checks for an org-specific override in D1
  before falling back to the system default and then the hardcoded `DEFAULT_TEMPLATES`

### OrgBranding shape (src/lib/server/email.ts)

```ts
export interface OrgBranding {
  orgName?: string;        // Display name in header (default: 'PaveRate')
  accentColor?: string;    // Hex color for buttons/headers (default: #f2c037)
  emailFromName?: string;  // "From" display name override
  emailReplyTo?: string;   // Reply-To address
}
```

`buildOrgBranding(org, settings)` assembles this from the D1 `organizations` + `org_settings` rows.
Call sites should use this function rather than constructing OrgBranding manually.

---

## Template Architecture

### D1 schema (migration 0058_email_templates.sql)

```sql
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  org_id TEXT,                    -- NULL = system default; orgId = org-specific override
  template_key TEXT NOT NULL,     -- see TemplateKey union type
  subject TEXT NOT NULL,          -- {{variable}} substitution supported
  body_html TEXT NOT NULL,        -- full HTML with {{variable}} placeholders
  body_text TEXT,                 -- plain-text fallback (optional)
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by TEXT,
  UNIQUE(org_id, template_key)
);
CREATE INDEX IF NOT EXISTS idx_email_templates_org_key ON email_templates(org_id, template_key);
```

### Template resolution order (getTemplate in email-templates.ts)

1. If the key is in `SYSTEM_TEMPLATE_KEYS` - return `DEFAULT_TEMPLATES[key]` directly (no D1 hit)
2. If `orgId` is set - look for a row with `org_id = orgId AND template_key = key` in D1
3. Fall back to a system-default D1 row (`org_id IS NULL AND template_key = key`)
4. Fall back to `DEFAULT_TEMPLATES[key]` (hardcoded)

This means orgs can fully customize their transactional emails without any code changes.

### Template keys and their type

```ts
// src/lib/server/email-templates.ts
export const SYSTEM_TEMPLATE_KEYS = ['password_reset', 'admin_notif'] as const;
export const ORG_TEMPLATE_KEYS = ['invite', 'welcome', 'eod_report', 'daily_summary'] as const;
export type TemplateKey =
  typeof SYSTEM_TEMPLATE_KEYS[number] | typeof ORG_TEMPLATE_KEYS[number];
```

---

## Variable Substitution

Templates use `{{variableName}}` double-brace syntax. The `renderTemplate()` helper in
`email-templates.ts` does a case-insensitive replacement pass:

```ts
export function renderTemplate(
  template: { subject: string; body_html: string; body_text: string | null },
  vars: Record<string, string>
): { subject: string; body_html: string; body_text: string | null }
```

Conditionals (`{{#if logo_url}} ... {{/if}}`) are NOT supported by the simple regex replacer.
The templates in `DEFAULT_TEMPLATES` use them as visual hints but they render as empty strings
when the variable is absent; the surrounding markup still renders. A proper Handlebars-style
preprocessor pass would be needed to actually toggle blocks.

### Variable reference by template

#### password_reset
| Variable | Description |
|---|---|
| `{{reset_link}}` | Full password reset URL with token |
| `{{expiry_hours}}` | How long the link is valid (e.g. `1`) |

#### admin_notif
| Variable | Description |
|---|---|
| `{{message}}` | Alert body text |

#### invite
| Variable | Description |
|---|---|
| `{{org_name}}` | Organization display name |
| `{{logo_url}}` | Org logo URL (optional) |
| `{{accent_color}}` | Hex brand color |
| `{{invited_by}}` | Inviter's display name |
| `{{invite_link}}` | Invitation acceptance URL |
| `{{expiry_days}}` | Days until the invite expires |

#### welcome
| Variable | Description |
|---|---|
| `{{org_name}}` | Organization display name |
| `{{logo_url}}` | Org logo URL (optional) |
| `{{accent_color}}` | Hex brand color |
| `{{app_url}}` | Dashboard URL |

#### eod_report
| Variable | Description |
|---|---|
| `{{org_name}}` | Organization display name |
| `{{logo_url}}` | Org logo URL (optional) |
| `{{date}}` | Report date string |
| `{{report_content}}` | Pre-rendered HTML or text block |

#### daily_summary
| Variable | Description |
|---|---|
| `{{org_name}}` | Organization display name |
| `{{logo_url}}` | Org logo URL (optional) |
| `{{date}}` | Report date string |
| `{{summary_content}}` | Pre-rendered HTML or text block |

---

## Default Templates

Six default templates are hardcoded in `DEFAULT_TEMPLATES` in `email-templates.ts` and serve as
the final fallback. They are also suitable as seed rows in D1 (`org_id = NULL`) for admin editing.

| Key | Subject template | Category |
|---|---|---|
| `password_reset` | `Reset your PaveRate password` | system |
| `admin_notif` | `PaveRate Admin Notification` | system |
| `invite` | `You're invited to {{org_name}} on PaveRate` | org |
| `welcome` | `Welcome to {{org_name}}` | org |
| `eod_report` | `{{org_name}} - End of Day Report for {{date}}` | org |
| `daily_summary` | `{{org_name}} - Daily Summary for {{date}}` | org |

---

## Notification Schedule Schema

Recurring org-level report emails are governed by the `email_report_schedules` table (migration
0043). A POST to `/api/email-reports/send` is called on a schedule (Cloudflare Cron Trigger or
admin manual trigger) and fires emails for every matching schedule row.

```sql
CREATE TABLE email_report_schedules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK(
    report_type IN ('daily_summary', 'weekly_rollup', 'monthly_rollup')
  ),
  frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly')),
  send_hour INTEGER NOT NULL DEFAULT 8,   -- UTC hour 0-23
  day_of_week INTEGER,                    -- 0=Sun..6=Sat; only used when frequency = 'weekly'
  recipients TEXT NOT NULL DEFAULT '[]', -- JSON array of email address strings
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_sent_at INTEGER,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);
```

### Dispatch logic (POST /api/email-reports/send)

1. Load all `enabled = 1` rows from `email_report_schedules`
2. Keep rows where `send_hour = currentUTCHour` (and `day_of_week = currentUTCDay` for weekly)
3. For each matching row call `sendReportEmail()` which builds stats, renders HTML, posts to Resend
4. Update `last_sent_at` via `markEmailReportScheduleSent()`

The route accepts either a `CRON_SECRET` header (Cloudflare Cron Trigger) or a logged-in
owner/admin session, so it can also be triggered manually from the settings UI.

### User notification preferences

Per-user email opt-ins (e.g. `email_daily_summary`) are currently stored as columns on the `users`
table. A future migration could normalize them into a dedicated `notification_preferences` table
if the set of toggles grows:

```sql
-- Future: notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  event_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, org_id, channel, event_type)
);
```

---

## Email Log

Every send attempt is recorded in the `email_log` table (migration 0035):

```sql
CREATE TABLE email_log (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,              -- EmailType value
  org_id TEXT,
  user_id TEXT,
  status TEXT NOT NULL,            -- 'sent' | 'failed' | 'skipped_no_key'
  provider_message_id TEXT,        -- Resend message id on success
  error TEXT,                      -- Error detail on failure
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

The admin panel at `/admin/email` reads this table for recent send history and failure counts.
Failed sends also appear on the admin overview dashboard.

---

## Implementation Notes

1. `sendAndLog()` in `email.ts` is the canonical send path. All new sender functions must go through
   it to get consistent logging. The `email-reports/send` server still has a duplicated inline
   Resend `fetch` call that should be migrated to `sendAndLog()` in a follow-up.

2. The `RESEND_API_KEY` env var is required for real sends. If absent, `sendAndLog()` returns
   `{ status: 'skipped_no_key' }` instead of throwing, so local dev never breaks.

3. All `from` addresses use `noreply@paverate.com` (the verified sending domain). The display
   name portion is customizable via `OrgBranding.emailFromName`.

4. `reply_to` is forwarded from `OrgBranding.emailReplyTo` so replies route to the org's contact
   address and not the noreply inbox.

5. When adding a new email type, define its `TemplateKey`, add a `DEFAULT_TEMPLATES` entry, and
   add a sender function that calls `getTemplate()` then `renderTemplate()` then `sendAndLog()`.
