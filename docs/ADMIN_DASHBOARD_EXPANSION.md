# Admin Dashboard Expansion — Design

**Status:** Draft  
**Author:** paverate-dev  
**Branch:** feat/auth-and-data  
**Date:** 2026-06-04

---

## 1. Current State Audit

### Pages that exist

| Route | What it shows | Gaps |
|---|---|---|
| /admin | KPI tiles (orgs, users, job sites, failed emails), recent users, recent orgs, recent failed emails, orgs needing attention | No audit events, no login activity, no global security signals |
| /admin/orgs | Searchable table: name, slug, member count, created date | No job site count, no last-activity, no audit trail |
| /admin/orgs/[id] | Info (name, slug, created, status), members list with roles, pending invitations, job site count | No job site drill-down list, no activity timeline, no email history for the org |
| /admin/users | Searchable+filtered table: name, email, org, role, admin flag, disabled flag | No last login, no IP, no per-user audit trail |
| /admin/users/[id] | Profile fields, email verified badge, memberships, active sessions, actions (logout all, force verify, send reset) | No login history, no IP tracking, no audit events for this user |
| /admin/emails | Full email log with status/type/address filters, HTML preview for known templates | Already solid; minor gap: no per-org or per-user drill-down link |

### Data that already exists

- `audit_log` table: actor_user_id, actor_name, org_id, resource_type, resource_id, action, old_value, new_value, ip_address, user_agent, job_site_id, created_at
- Login events are already written to audit_log via /api/auth/login (action: "logged_in", resource_type: "user")
- Password reset, email verify, role change, member remove, crew create/update/delete, settings changes — all recorded via recordAudit()
- audit_log is immutable (triggers block UPDATE/DELETE)
- `email_log` table: complete send history per address/type/org/user
- `sessions` table: tracks active and expired sessions per user

### What is missing

1. **No global audit log page** — /admin has no way to see cross-org events (mass login failures, password resets, admin actions)
2. **No login history per user** — the sessions table exists and is shown, but no IP + timestamp history; login events live in audit_log but the user detail page does not surface them
3. **No last_login column on users** — we have to query audit_log MAX(created_at) WHERE action='logged_in' per user. This is a missing denormalized field; worth adding for fast sorting/filtering
4. **No login_ip on users** — same: last known IP not stored on user row
5. **Org drill-down lacks job sites** — /admin/orgs/[id] shows a count but no list; can not click through to see job sites
6. **Org drill-down lacks activity timeline** — no audit events panel on the org detail page
7. **No per-org email monitoring** — the emails page has type/status filters but no org filter; can not quickly see all emails for a specific org
8. **Audit_log org_id NOT NULL constraint** — login events for users without an org membership are dropped silently (the login handler skips recordAudit if org is null). Need a system-level org or a nullable org_id for global events.

---

## 2. Schema Additions

### Migration 0057 — user login tracking

```sql
-- Denormalized last login fields on users table for fast admin queries
ALTER TABLE users ADD COLUMN last_login_at INTEGER;
ALTER TABLE users ADD COLUMN last_login_ip TEXT;

CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at DESC);
```

**Why:** The admin users list needs to be sortable/filterable by last login. Querying audit_log for this per-user at list-render time is O(N) queries. Denormalizing to users is the right tradeoff for a read-heavy admin list.

**Updated by:** /api/auth/login on every successful login, alongside the existing audit log write.

### Migration 0058 — global audit log support (nullable org_id)

The current audit_log schema has `org_id TEXT NOT NULL`. This prevents recording system-level events (login for users with no org, admin actions not tied to a specific org). Two options:

**Option A (preferred):** Add a sentinel org_id value `'_system'` and allow writing global events under that ID. No schema change needed; just use `'_system'` where org_id is null.

**Option B:** Make org_id nullable and update the NOT NULL constraint.

Option A is preferred because it avoids a table recreation in SQLite (no ALTER COLUMN support) and keeps existing indexes intact.

No migration SQL needed for Option A — just a code convention: use `'_system'` as the org_id for events that have no org context.

### Migration 0058 — login_history table (optional, for detailed history)

The audit_log already captures login events. A dedicated login_history table is NOT needed unless we want to decouple login tracking performance from the immutable audit_log (which cannot be pruned). Recommendation: use audit_log for now; add login_history only if audit_log grows too large (>1M rows) and needs pruning strategy.

---

## 3. New API Endpoints

### 3a. GET /api/admin/audit-log

Global cross-org audit log for admin consumption.

**Query params:**
- `orgId` — filter to one org
- `userId` — filter to one actor
- `action` — filter to one action type (logged_in, role_changed, created, etc.)
- `resourceType` — filter by resource type (user, job_site, crew, settings, etc.)
- `from` / `to` — Unix timestamps for time range
- `limit` — default 100, max 500
- `cursor` — pagination cursor (last seen created_at + id)

**Response:**
```json
{
  "events": [
    {
      "id": "...",
      "created_at": 1234567890,
      "actor_user_id": "...",
      "actor_name": "John Smith",
      "org_id": "...",
      "org_name": "Acme Paving",
      "resource_type": "user",
      "resource_id": "...",
      "action": "logged_in",
      "ip_address": "1.2.3.4",
      "user_agent": "Mozilla/5.0...",
      "old_value": null,
      "new_value": null
    }
  ],
  "nextCursor": "..."
}
```

**Implementation note:** Join audit_log with organizations to surface org_name. Guard with requireGlobalAdmin.

### 3b. GET /api/admin/users/[id] — extend existing response

Add to the existing user detail endpoint:
- `loginHistory`: last 20 audit_log entries WHERE actor_user_id = id AND action = 'logged_in'
- `last_login_at`: from the users row (once migration 0057 is applied)
- `last_login_ip`: from the users row

No new endpoint — extend the existing /api/admin/users/[id] GET handler.

### 3c. GET /api/admin/orgs/[id] — extend existing response

Add to the existing org detail endpoint:
- `jobSites`: Array<{ id, name, status, created_at }> — full list, not just count
- `recentActivity`: last 20 audit_log entries WHERE org_id = id, ordered by created_at DESC
- `emailStats`: { total, failed, sent } counts from email_log WHERE org_id = id

No new endpoint — extend the existing /api/admin/orgs/[id] GET handler.

### 3d. GET /api/admin/audit-log/export (future)

CSV export of filtered audit log for compliance/ops. Not in scope for current sprint — note as a follow-up.

---

## 4. New Pages and Components

### 4a. /admin/audit-log (new page)

**File:** src/routes/admin/audit-log/+page.svelte

**Purpose:** Global audit log browser across all orgs. The primary security monitoring surface for admins.

**Layout:**
```
[Filter bar: org dropdown | user search | action dropdown | date range]
[Events table: timestamp | actor | org | resource | action | IP | details expand]
[Pagination / load-more]
```

**Features:**
- Filter by org, actor user, action type, resource type, date range
- Expand row to see old_value / new_value diff (JSON viewer)
- Click actor name → /admin/users/[id]
- Click org name → /admin/orgs/[id]
- Security highlight: color-code sensitive actions (role_changed=yellow, logged_in=normal, admin_action=blue, failed login attempts=red)
- "Failed logins" quick filter button

**Link from:** /admin overview nav, layout sidebar

### 4b. /admin/orgs/[id] — add job sites section

**Existing file:** src/routes/admin/orgs/[id]/+page.svelte

Add two new sections below the members table:

**Job Sites section:**
- Table: name, status badge (active/completed/archived), created date
- Each row links to /dashboard/[orgSlug]/job-sites/[id] (for admins who want to inspect the actual job)
- Status counts summary: X active, Y completed, Z archived

**Recent Activity section:**
- Timeline of last 20 audit events for the org
- Columns: time ago, actor, action, resource
- "View full audit log" link → /admin/audit-log?orgId=[id]

### 4c. /admin/users/[id] — add login history section

**Existing file:** src/routes/admin/users/[id]/+page.svelte

Add below the sessions section:

**Login History section:**
- Table: timestamp, IP address, user agent (truncated), status
- Show last 20 logins from audit_log
- IP address highlighted if it changes (visual diff from previous row)
- "Last Login" field added to the profile info section at top

**Profile info additions:**
- Last Login At: formatted date/time
- Last Login IP: shown inline

### 4d. /admin/emails — add org filter

**Existing file:** src/routes/admin/emails/+page.svelte

Add an org dropdown filter to the existing filter bar. Minor enhancement — org_id is already in email_log, just needs a filter added to the loadEmails() fetch and the /api/admin/emails GET handler.

### 4e. Admin layout nav — add Audit Log link

**Existing file:** src/routes/admin/+layout.svelte

Add Audit Log to the navigation alongside orgs, users, emails.

---

## 5. Component Library

### AuditLogTable.svelte (shared component)

Used by both /admin/audit-log (full view) and org/user detail pages (truncated view).

**Props:**
```typescript
interface Props {
  events: AuditEvent[];
  showOrgColumn?: boolean;   // false on org detail page (redundant)
  showActorColumn?: boolean; // false on user detail page (redundant)
  compact?: boolean;         // true for embedded panels; hides expand and some columns
}
```

**File:** src/lib/components/admin/AuditLogTable.svelte

### LoginHistoryTable.svelte

Used on /admin/users/[id] for the login history panel.

**File:** src/lib/components/admin/LoginHistoryTable.svelte

---

## 6. Dependency Order for Implementation

Tasks should be implemented in this order — each phase unblocks the next:

### Phase 1 — DB schema (no UI changes)

1. Write migration 0057: add last_login_at, last_login_ip to users
2. Update /api/auth/login to write last_login_at and last_login_ip on the users row after successful login (alongside the existing audit_log write)
3. Adopt `'_system'` org_id convention in recordAudit calls for users with no org membership (update the login handler to always write the audit event, using '_system' when org is null)

### Phase 2 — API layer

4. Extend /api/admin/users/[id] GET: add loginHistory array and last_login_at/last_login_ip from users row
5. Extend /api/admin/orgs/[id] GET: add jobSites array, recentActivity array, emailStats object
6. Create GET /api/admin/audit-log with full filter + pagination support

### Phase 3 — UI components

7. Create AuditLogTable.svelte shared component
8. Create LoginHistoryTable.svelte shared component

### Phase 4 — Page enhancements

9. Update /admin/users/[id] page: add login history section, add last_login fields to profile
10. Update /admin/orgs/[id] page: add job sites section, add recent activity section
11. Update /admin/emails page: add org dropdown filter
12. Update /admin/+layout.svelte: add Audit Log nav link

### Phase 5 — New page

13. Create /admin/audit-log page with full filter bar and paginated event table

---

## 7. Security Considerations

- All new admin API endpoints must call requireGlobalAdmin() — same as all existing admin routes
- IP addresses in audit_log come from CF-Connecting-IP (real user IP via Cloudflare); never X-Forwarded-For alone (can be spoofed)
- The global audit log page should not expose old_value/new_value inline (password hashes, tokens could appear in edge cases); only expand on explicit row click
- last_login_ip on the users row is cosmetic for display; authoritative source is always audit_log
- The '_system' org_id is internal — never expose it to non-admin APIs or non-admin users

---

## 8. Non-Goals (out of scope for this design)

- Real-time streaming / WebSocket updates to the audit log page
- CSV export / compliance download
- Alerting/notifications on suspicious login patterns (could be a future cron job reading audit_log)
- Per-user audit log access (letting users see their own event history — separate feature, separate auth model)
- Editing or deleting audit log entries (the immutability trigger prevents this by design)
