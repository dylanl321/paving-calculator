# Admin Panel Observability Design

## Status: Design (pre-implementation)

This document specifies the observability features for PaveRate's admin panel:
log viewing, error tracking, Cloudflare analytics integration, and the
request/response logging middleware that feeds them.

---

## Context

The admin panel at `/admin` already provides: users, orgs, audit log (auth events),
email delivery log, and DB health. This design adds four new capabilities layered on
top of that foundation.

The app runs on Cloudflare Pages (Workers runtime) with D1, R2, and optional AI
binding. Cloudflare's own platform provides Analytics Engine, GraphQL Analytics API,
and Logpush. The current `hooks.server.ts` only resolves the session user — there is
no request timing, no error capture, and no application-level logging.

The existing `docs/error-handling-design.md` specifies client-side error handling
(AppError, ErrorBoundary, errorLogger). This document covers the server-side and
admin-UI side of that story.

---

## 1. Application Log Viewer

### 1.1 What to Log

Every logged event falls into one of three levels:

| Level | What | Examples |
|-------|------|---------|
| `error` | Unhandled exceptions, 5xx responses | D1 query failure, unhandled throw in handle() |
| `warn` | Recoverable degradation, slow queries | Query >100ms, R2 put timeout retried, rate limit hit |
| `info` | Normal API traffic | Every request/response cycle (sampled — see section 4) |

Fields logged per event:

```
timestamp      integer  Unix epoch seconds (indexed)
level          text     'error' | 'warn' | 'info'
method         text     GET | POST | PUT | PATCH | DELETE
path           text     URL path, no query string (indexed)
status         integer  HTTP status code
latency_ms     integer  Wall time hook entry → response (indexed for slow-query filter)
user_id        text     Null for unauthenticated (indexed)
org_id         text     Null when no org context (indexed)
ip             text     CF-Connecting-IP header value
cf_ray         text     CF-Ray header — ties log row to CF dashboard
user_agent     text     Truncated to 256 chars
message        text     Human-readable summary or error message
error_stack    text     Full stack trace (errors only; null for info/warn)
request_body   text     JSON summary of body for mutations (null for GETs, truncated to 2 KB)
cf_country     text     Two-letter country from CF-IPCountry header
```

### 1.2 Where to Store

**Decision: D1 table `app_logs`, with a periodic cleanup job.**

Cloudflare Analytics Engine (AE) is an attractive alternative for high-volume
write-once metrics but has constraints that make it a poor fit for log viewing:

- AE is append-only with no SQL queries — can only aggregate via the REST API
- Free tier allows 100K AE writes/day; a busy Workers deployment can hit that quickly
- AE data retention is 31 days with no on-demand delete
- AE cannot store arbitrary text (stack traces, request bodies)

D1 gives full SQL, arbitrary text columns, row-level TTL via cron, and stays within
the existing stack. The tradeoff is write amplification: every request write also
increases D1 usage. For the sampling strategy in section 4, the actual write rate
stays well within D1's free tier (100K rows/day limit).

**Retention:** A cleanup step runs on a schedule (Cron Trigger or a D1 Worker) that
deletes rows older than 30 days:

```sql
DELETE FROM app_logs WHERE timestamp < unixepoch() - (30 * 86400);
```

This can run nightly or be triggered at the start of each request (probabilistic:
run if `Math.random() < 0.001`). The probabilistic approach is zero-infrastructure
but adds ~1ms latency on 0.1% of requests. A scheduled Cron Trigger is cleaner.

**Indexes:** Index on `(timestamp DESC)`, `(level, timestamp DESC)`,
`(path, timestamp DESC)`, `(user_id, timestamp DESC)`. These cover the filter
combinations the UI needs.

### 1.3 Schema

```sql
-- migrations/0064_app_logs.sql
CREATE TABLE IF NOT EXISTS app_logs (
  id           TEXT    NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  timestamp    INTEGER NOT NULL,
  level        TEXT    NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  method       TEXT    NOT NULL,
  path         TEXT    NOT NULL,
  status       INTEGER NOT NULL,
  latency_ms   INTEGER NOT NULL,
  user_id      TEXT,
  org_id       TEXT,
  ip           TEXT,
  cf_ray       TEXT,
  user_agent   TEXT,
  message      TEXT,
  error_stack  TEXT,
  request_body TEXT,
  cf_country   TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (org_id)  REFERENCES orgs(id)  ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp ON app_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level     ON app_logs (level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_path      ON app_logs (path, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_user      ON app_logs (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_status    ON app_logs (status, timestamp DESC);
```

### 1.4 Admin UI: `/admin/logs`

**Page layout (mobile-first):**

```
[ Level: all | error | warn | info ]  [ Path filter ]  [ User filter ]  [ Date range ]
[ Search ]

┌─ timestamp ─── level ── method ── path ──────── status ── latency ── user ──────┐
│ 2026-06-04 09:13  ERROR  POST  /api/jobs/save      500      312ms   user@co.com  │
│ ▼ (expanded detail row)                                                           │
│   CF-Ray: 8ab12cd...  IP: 203.0.113.1  Country: US                               │
│   Stack: TypeError: Cannot read 'id' of undefined                                │
│     at +server.ts:42                                                              │
│     at handle (hooks.server.ts:12)                                                │
│   Request body: {"jobId": "j_abc123", "name": "US-41 MP 22-31"}                  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Filter controls:
- Level: pill tabs (All / Error / Warn / Info)
- Path: text input with prefix match (e.g. `/api/jobs` matches all job endpoints)
- User: email or user ID
- Date range: two date pickers (from / to), default last 24 hours
- Latency: optional `>Nms` filter for slow-query hunting

Pagination: 50 rows per page, cursor-based (timestamp + id), not offset.

**Expandable detail rows:** clicking a row expands inline to show full stack,
request body, CF-Ray, and country. No modal — keeps context visible.

**Real-time tail mode:** A "Tail" toggle switches the table to polling mode
(every 3 seconds, fetching rows newer than the most recent visible `id`).
Suitable for watching errors live during a deploy. Implemented as a client-side
`setInterval` calling `/api/admin/logs?after=<id>`. Disable tail when the user
applies a historical date filter.

### 1.5 API Endpoint

`GET /api/admin/logs` — returns paginated rows.

Query params:
```
level        'error' | 'warn' | 'info'  (optional)
path         string — prefix match       (optional)
user_id      string                      (optional)
from         unix timestamp              (optional, default: now - 86400)
to           unix timestamp              (optional, default: now)
min_latency  integer ms                  (optional)
after        log row id — for tail mode  (optional)
limit        default 50, max 200
cursor       opaque cursor for next page (optional)
```

Response shape:
```json
{
  "logs": [ { ...row fields... } ],
  "total": 1042,
  "next_cursor": "..."
}
```

Protected by `requireGlobalAdmin()`.

---

## 2. Error Tracking Dashboard

### 2.1 Error Capture

The current `hooks.server.ts` only resolves the session user. It needs a
`handleError` export alongside `handle`:

```ts
// hooks.server.ts (design sketch — no implementation here)
// SvelteKit calls handleError for any unhandled throw that escapes a route.
export const handleError: HandleServerError = async ({ error, event, status }) => {
  // Write a row to app_logs with level='error', stack from error.stack,
  // path/method/user from event, status code from status arg.
  // Then return the standard { message, errorId } shape SvelteKit expects.
};
```

The `handleError` hook fires for:
- Unhandled throws in `+page.server.ts` load functions
- Unhandled throws in `+server.ts` endpoints
- Any throw that escapes the `handle()` pipeline

It does NOT fire for:
- Manually returned `error(...)` responses (those are intentional 4xx, not bugs)
- Client-side errors (those go through the client errorLogger in error-handling-design.md)

For slow queries (warn level), the middleware in section 4 handles detection.

### 2.2 Error Grouping

Errors are grouped by a **fingerprint** computed from the first two non-framework
stack frames (stripping line numbers and memory addresses):

```
fingerprint = sha1(message_text + normalized_stack_prefix)
```

Example: all instances of `TypeError: Cannot read 'id' of undefined` in
`+server.ts:42` get the same fingerprint regardless of which user triggered it.

A separate `error_groups` table tracks the rollup:

```sql
-- Part of migration 0064_app_logs.sql
CREATE TABLE IF NOT EXISTS error_groups (
  fingerprint    TEXT    NOT NULL PRIMARY KEY,
  first_seen     INTEGER NOT NULL,
  last_seen      INTEGER NOT NULL,
  count          INTEGER NOT NULL DEFAULT 1,
  message        TEXT    NOT NULL,   -- representative error message
  path           TEXT    NOT NULL,   -- route where it most often occurs
  stack_preview  TEXT,               -- first 512 chars of stack
  resolved       INTEGER NOT NULL DEFAULT 0,  -- 0=open, 1=resolved
  resolved_at    INTEGER,
  resolved_by    TEXT
);

CREATE INDEX IF NOT EXISTS idx_error_groups_last_seen ON error_groups (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_error_groups_count     ON error_groups (count DESC);
```

When writing an `error`-level log row, also upsert into `error_groups`:

```sql
INSERT INTO error_groups (fingerprint, first_seen, last_seen, count, message, path, stack_preview)
VALUES (?, unixepoch(), unixepoch(), 1, ?, ?, ?)
ON CONFLICT (fingerprint) DO UPDATE SET
  last_seen     = excluded.last_seen,
  count         = error_groups.count + 1,
  message       = excluded.message,
  path          = excluded.path,
  stack_preview = excluded.stack_preview
WHERE resolved = 0;
```

Resolved errors that recur get their `resolved` flag reset to 0 and a new
`first_seen` written (treat as a regression).

### 2.3 Admin UI: `/admin/errors`

**Page layout:**

```
Errors (last 7d)
[ Open (42) ]  [ Resolved (118) ]                         [ Mark all resolved ]

Error count trend (sparkline — 7 bars, one per day)
████ ██ █████ ███ ██████ ████ ██

Top Errors
┌─ count ── last seen ──── route ──────── message ──────────────────────────────┐
│  312     2 min ago      /api/jobs/save  TypeError: Cannot read 'id' of undef  │
│  88      14 min ago     /api/auth/login Cannot prepare statement: no such...  │
│  22      1 hour ago     /api/pdf/proof  R2PutError: network timeout            │
└───────────────────────────────────────────────────────────────────────────────┘

Click a row → error detail panel:
  Fingerprint: a1b2c3d4
  First seen: 2026-05-30 08:11  Last seen: 2026-06-04 09:13  Count: 312
  Stack (full):
    TypeError: Cannot read properties of undefined (reading 'id')
      at Object.POST (+page.server.ts:42:18)
      at handle (hooks.server.ts:12:28)
  Recent occurrences (last 10):
    2026-06-04 09:13 | user@co.com | POST /api/jobs/save | 500 | 312ms
    2026-06-04 08:58 | other@co.com | POST /api/jobs/save | 500 | 289ms
  [ Mark Resolved ]
```

**Error count trend:** 7-day bar chart rendered as an inline SVG (no chart library
dependency). Data from a daily aggregation query on `app_logs`.

**Mark resolved:** sets `error_groups.resolved = 1`, `resolved_at`, `resolved_by`.
Reappears in Open tab if the same fingerprint triggers a new error.

### 2.4 Alert Threshold Concept

Alert thresholds are configuration, not stored state:

```ts
// src/lib/config/observability.ts (design — no implementation)
export const ALERT_THRESHOLDS = {
  errors_per_hour: 10,    // send admin notification if exceeded
  slow_query_ms:   100,   // log as 'warn' if latency exceeds this
  error_rate_pct:  5,     // warn if >5% of requests in a window are errors
};
```

When the middleware writes an error row, it checks: if the error count for the
current fingerprint in the last hour exceeds `errors_per_hour`, emit a notification.
Notification mechanism: write to the existing audit log with event type
`alert_error_threshold`, which the existing email system can pick up and forward
to admins. (No new notification infrastructure required for Phase 1.)

---

## 3. Cloudflare Analytics Integration

### 3.1 CF GraphQL Analytics API

Cloudflare exposes a GraphQL Analytics API at `https://api.cloudflare.com/client/v4/graphql`.
It requires a CF API token with `Account Analytics: Read` permission.

The token must NOT be stored in D1 or exposed to the client. It lives in a
Cloudflare secret (bound as `CF_ANALYTICS_TOKEN` and `CF_ACCOUNT_ID` Workers
environment variables in the deployment), and is only accessible server-side.

**Relevant GraphQL datasets:**

| Dataset | What it provides |
|---------|-----------------|
| `httpRequestsAdaptiveGroups` | Requests by status, path, country, cache status, p50/p95 latency, CF-Ray |
| `workersInvocationsAdaptive` | Workers CPU time (duration), errors, subrequests per script |
| `firewallEventsAdaptiveGroups` | WAF blocks, rate limit triggers by IP/country |
| `browserInsightsAdaptiveGroups` | Core Web Vitals (if Browser Insights enabled on the zone) |

### 3.2 Proxy Architecture

Admin clients must NOT call CF's API directly (would require exposing the CF token
to the browser). Route all CF analytics through a server-side proxy:

```
Admin browser
    ↓  GET /api/admin/analytics?metric=requests&days=7
SvelteKit +server.ts endpoint (server-side only)
    ↓  POST https://api.cloudflare.com/client/v4/graphql
       Authorization: Bearer ${CF_ANALYTICS_TOKEN}
Cloudflare GraphQL API
    ↑  returns aggregated data
SvelteKit formats and returns JSON
    ↑  Admin browser renders charts
```

The proxy endpoint adds:
- Auth check (`requireGlobalAdmin()`)
- Response caching: cache CF responses in KV for 5 minutes to avoid hammering the
  CF API on every admin page load (key: `cf_analytics:<metric>:<days>`)
- Error handling: if CF API is unavailable, return cached data with a staleness flag

### 3.3 GraphQL Query Examples

**Requests per day (last 7 days):**
```graphql
{
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      httpRequestsAdaptiveGroups(
        filter: { date_gt: $sevenDaysAgo }
        limit: 7
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum { requests edgeResponseBytes }
        avg { edgeDurationMs }
      }
    }
  }
}
```

**Error rate by status code (last 24h):**
```graphql
{
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      httpRequestsAdaptiveGroups(
        filter: { datetime_gt: $yesterday }
        limit: 50
        orderBy: [count_DESC]
      ) {
        dimensions { edgeResponseStatus }
        count
      }
    }
  }
}
```

**Top routes by hit count (last 24h):**
```graphql
{
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      httpRequestsAdaptiveGroups(
        filter: { datetime_gt: $yesterday }
        limit: 20
        orderBy: [count_DESC]
      ) {
        dimensions { clientRequestPath }
        count
        sum { visits }
        quantiles { edgeDurationMsP50 edgeDurationMsP95 }
      }
    }
  }
}
```

**Workers CPU time:**
```graphql
{
  viewer {
    accounts(filter: { accountTag: $accountId }) {
      workersInvocationsAdaptive(
        filter: { datetime_gt: $yesterday, scriptName: "paverate-worker" }
        limit: 10
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum { requests errors }
        quantiles { cpuTimeP50 cpuTimeP95 }
      }
    }
  }
}
```

### 3.4 Analytics Engine vs. Zone Analytics

**Recommendation: use both, for different purposes.**

| Use case | Use |
|----------|-----|
| Traffic, CDN cache hit ratio, geographic distribution, p50/p95 latency, Workers CPU | CF GraphQL zone/account analytics (read-only, no extra writes) |
| Custom business events: calculator runs, job site creates, PDF exports | CF Analytics Engine binding (write-once custom events) |
| Application errors, slow queries, request details | D1 `app_logs` table (structured, queryable, searchable) |

Analytics Engine custom events are written via the `ANALYTICS` binding in `wrangler.jsonc`:
```ts
// design — not implementation
event: {
  name: 'calculator_run',
  orgId: string,
  calcType: 'tons' | 'spread_rate' | 'proof',
  timestamp: Date,
}
```

AE is cheap for write-once metric events but cannot replace D1 for structured log
data with free-text search, stack traces, or row-level mutations (mark-resolved).

### 3.5 Admin UI: `/admin/analytics`

**Dashboard cards (mobile: stacked, desktop: 2-column grid):**

```
┌─ Requests (7d) ──────────────────┐  ┌─ Error Rate (7d) ─────────────────┐
│  [sparkline bar chart]           │  │  2.1%  ▼ 0.4pp vs last week       │
│  48,312 total  ↑12% vs last wk   │  │  [7-day line chart]                │
└──────────────────────────────────┘  └──────────────────────────────────┘

┌─ p50 / p95 Latency ──────────────┐  ┌─ Cache Hit Ratio ─────────────────┐
│  p50: 48ms  p95: 312ms           │  │  82.3%  (↑3.1pp)                  │
└──────────────────────────────────┘  └──────────────────────────────────┘

┌─ Top Routes (24h) ──────────────────────────────────────────────────────┐
│  /api/jobs/save         12,312 hits   p50 88ms   p95 412ms              │
│  /api/dashboard         8,903 hits    p50 32ms   p95 180ms              │
│  /api/auth/session      7,221 hits    p50 12ms   p95 48ms               │
│  /api/pdf/proof         1,802 hits    p50 2400ms p95 4800ms  ⚠ slow    │
└──────────────────────────────────────────────────────────────────────────┘

┌─ Workers CPU (24h) ──────────────┐  ┌─ Requests by Country ─────────────┐
│  p50: 2.1ms  p95: 18ms           │  │  US 68%  CA 12%  AU 8%  other 12% │
│  Errors: 42 (0.09%)              │  │  [top 5 countries bar]             │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

Time range selector: 24h / 7d / 30d (default 7d).

Charts are inline SVG rendered server-side or via a minimal client-side helper
(no Chart.js or similar library — keeps bundle size small for mobile).

**Degraded state:** If `CF_ANALYTICS_TOKEN` is not configured, the analytics page
shows a setup notice: "Configure CF_ANALYTICS_TOKEN and CF_ACCOUNT_ID in
Workers secrets to enable Cloudflare analytics." The rest of the admin panel
still works normally.

---

## 4. Request/Response Logging Middleware

### 4.1 Placement in hooks.server.ts

The `handle()` function wraps every request:

```ts
// Design sketch — not implementation code
export const handle: Handle = async ({ event, resolve }) => {
  const start = Date.now();

  // 1. Resolve session user (existing behavior)
  if (event.platform?.env?.DB) {
    event.locals.user = (await getAuthUser(event)) ?? undefined;
  }

  // 2. Run the route handler
  const response = await resolve(event);

  // 3. Compute latency
  const latency_ms = Date.now() - start;

  // 4. Decide whether to log this request (sampling logic below)
  // 5. Write to app_logs (non-blocking — do not await)

  return response;
};
```

The log write is fire-and-forget (no `await`) so it never adds latency to the
response path. D1 write failures are swallowed silently — logging must be infallible.

### 4.2 Fields Extracted from the Request

```ts
// Extracted from event + response + CF headers (design — no implementation)
{
  timestamp:    Math.floor(Date.now() / 1000),
  method:       event.request.method,
  path:         new URL(event.request.url).pathname,
  status:       response.status,
  latency_ms:   Date.now() - start,
  user_id:      event.locals.user?.id ?? null,
  org_id:       event.locals.user?.orgId ?? null,
  ip:           event.request.headers.get('CF-Connecting-IP'),
  cf_ray:       event.request.headers.get('CF-Ray'),
  cf_country:   event.request.headers.get('CF-IPCountry'),
  user_agent:   (event.request.headers.get('User-Agent') ?? '').slice(0, 256),
  message:      `${event.request.method} ${path} → ${response.status} (${latency_ms}ms)`,
}
```

Request body logging (mutations only): for POST/PUT/PATCH, if the Content-Type is
`application/json` and the body is under 10 KB, clone and attach a JSON summary
truncated to 2 KB. Skip for file uploads (multipart/form-data).

### 4.3 Sampling Strategy

Log ALL requests at `error` or `warn` level. For `info` (successful/normal traffic),
apply sampling to keep D1 write volume manageable:

| Condition | Log? |
|-----------|------|
| status >= 500 | Always (error) |
| status >= 400 and < 500 | Always (warn — potential abuse or bugs) |
| latency_ms >= 100 | Always (warn — slow query) |
| path starts with `/api/admin/` | Always (audit sensitivity) |
| path starts with `/api/auth/` | Always (auth events already in audit log, but latency useful) |
| status 2xx or 3xx, normal latency | 10% of requests (random sample) |

The 10% sample on normal traffic means a deployment serving 1M requests/day writes
~100K `info` rows + all errors/warns. With the 30-day cleanup, the table stays
under ~3M rows — comfortably within D1's free tier.

Sampling is implemented as a simple `Math.random() < 0.1` check in `handle()`.
No sticky sampling (each request is independent).

### 4.4 What Not to Log

- Request/response bodies for auth endpoints (`/api/auth/**`) — never log passwords
  or tokens even in truncated form
- Responses to static asset requests (JS, CSS, images) — not Workers, handled by CF CDN
- The log write itself — no recursive logging
- Health check pings (`/api/health`, `/api/db-health`) — noisy, low value

### 4.5 Slow Query Detection

A query is "slow" when `latency_ms >= ALERT_THRESHOLDS.slow_query_ms` (default 100ms).
Slow requests are logged at `warn` level regardless of status code. The admin log UI's
latency filter (`>100ms`) surfaces them directly.

For database-level slow queries: D1 does not expose per-query timing natively. The
`DbHelper` wrapper in `src/lib/server/db.ts` should be extended to time each
`prepare().bind().first/all/run()` call and call the slow-query logger if it exceeds
the threshold. This is a Phase 2 concern — the middleware handles HTTP-level latency in Phase 1.

### 4.6 Storage: Same Table or Separate?

**Decision: one `app_logs` table, differentiated by `level` column.**

A separate `request_logs` table would duplicate indexes and complicate the UI query
(two joins for "show all errors + their request context"). A single table with a
`level` column and a partial index on `level='error'` handles both use cases.
The `error_stack` and `request_body` columns are null for `info`-level rows, keeping
row size small for normal traffic.

---

## 5. Admin Navigation

The existing admin nav at `/admin` needs two new links:

```
/admin            — Overview (existing)
/admin/users      — Users (existing)
/admin/orgs       — Orgs (existing)
/admin/audit      — Audit Log (existing)
/admin/emails     — Emails (existing)
/admin/logs       — App Logs  [NEW]
/admin/errors     — Errors    [NEW]
/admin/analytics  — Analytics [NEW]
```

The three new links appear after the existing five. On mobile, the admin nav renders
as a scrollable tab strip. No change to the layout structure needed — new routes are
additive.

---

## 6. Migration Plan

New migrations needed (all idempotent):

```
migrations/0064_app_logs.sql
  - CREATE TABLE IF NOT EXISTS app_logs (...)
  - CREATE TABLE IF NOT EXISTS error_groups (...)
  - All indexes
```

That is one migration file containing both tables. They are tightly coupled (error
groups are derived from app_logs), so they belong together.

Migration file naming: check current head with `ls migrations/*.sql | sort | tail -1`
before creating — the head is currently `0063_terminus.sql`, so next is `0064`.

---

## 7. Implementation Phases

### Phase 1 — Core logging (unblocks all other work)

1. Create migration `0064_app_logs.sql` (both tables + indexes)
2. Extend `hooks.server.ts` with `handle()` log writer and `handleError` export
3. Create `/api/admin/logs` endpoint (paginated, filterable)
4. Create `/admin/logs` page (filterable table, expandable rows)

### Phase 2 — Error tracking

1. Add fingerprint computation to the error write path
2. Upsert logic into `error_groups`
3. Create `/api/admin/errors` endpoint
4. Create `/admin/errors` page (trend chart, grouped table, detail panel, mark-resolved)
5. Alert threshold check in error write path

### Phase 3 — CF analytics

1. Add `CF_ANALYTICS_TOKEN` and `CF_ACCOUNT_ID` to `wrangler.jsonc` secrets (dev values)
2. Create `/api/admin/analytics` proxy endpoint with KV caching
3. Create `/admin/analytics` page with dashboard cards
4. Degraded-state handling when token not configured

### Phase 4 — Analytics Engine custom events

1. Add `ANALYTICS` binding to `wrangler.jsonc`
2. Write custom events at key business actions (calculator run, job site created, PDF export)
3. Add AE event counts to the analytics dashboard

---

## 8. Decision Log

| Decision | Rationale |
|----------|-----------|
| D1 for log storage, not Analytics Engine | AE is write-only, no SQL, no stack traces; D1 covers all cases and stays in-stack |
| 10% sampling for 2xx traffic | Keeps D1 write volume manageable; errors always logged at 100% |
| Single `app_logs` table (not separate request_logs + error_logs) | Simpler schema, one index set; level column differentiates |
| Fingerprint by normalized stack, not message alone | Same error class at different code paths gets separate fingerprints; same path with same message is reliably deduplicated |
| CF analytics via proxy endpoint + KV cache | Token never reaches client; 5-minute cache avoids CF API rate limits |
| Use CF zone analytics, not AE, for traffic metrics | Zone analytics are free and built-in; AE is for custom business events that zone analytics cannot capture |
| Alert via audit log event type | Reuses existing notification infrastructure; no new email or webhook system needed in Phase 1 |
| Cleanup via probabilistic in-request trigger (Phase 1) or Cron Trigger (Phase 2) | Probabilistic is zero-infrastructure but adds 1ms on 0.1% of requests; upgrade to Cron Trigger when the Workers Cron binding is wired |
| Auth endpoint bodies never logged | Password/token exposure risk outweighs debugging value |
