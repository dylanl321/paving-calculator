# Unified Error Handling and Logging System

## Status: Design (pre-implementation)

This document audits the current error patterns in PaveRate and specifies the unified system to replace them.

---

## 1. Audit: Current Error Patterns

### 1.1 What already works well

**toastStore** (`src/lib/stores/toast.svelte.ts`) is the correct pattern and is already used consistently in many places. It exposes `.success()`, `.error()`, `.info()`, and `.dismiss()`. All new code should route user-visible errors through it.

**API response shape** is mostly consistent. Server endpoints return `json({ error: string }, { status: N })` on failure. This shape is the right foundation; we standardize it more formally below.

### 1.2 Identified Inconsistencies

#### Silent swallows — no user feedback, no log

These catch blocks discard errors entirely:

| File | Line | Pattern |
|------|------|---------|
| `src/lib/services/todaySync.ts` | 54 | `.catch(() => {})` |
| `src/routes/dashboard/+page.ts` | 15, 36 | `try/catch` with no user feedback |
| `src/lib/components/workspace/TodayView.svelte` | 65 | `.catch(() => {})` |
| `src/lib/components/SpreadRateHistogram.svelte` | ~35 | `.catch(() => {})` |
| `src/lib/server/webhooks.ts` | 166 | `Promise.all(...).catch(() => {})` |
| `src/lib/server/db.ts` | 1114 | `.catch(() => ({ c: 0 }))` fallback |
| `src/routes/api/auth/register/+server.ts` | 102, 109 | `catch (_) { /* best effort */ }` |

#### console.error only — logged but no user feedback

| File | Notes |
|------|-------|
| `src/lib/components/CalcProofButton.svelte` | PDF generation failure invisible to user |
| `src/lib/components/ProofButton.svelte` | PDF failure invisible to user |
| `src/lib/components/shell/ContextPanel.svelte` | PDF failure invisible |
| `src/lib/components/workspace/JobBar.svelte` | PDF failure invisible |
| `src/lib/components/RouteAlignmentMap.svelte` | Route save failure invisible |
| `src/lib/components/RoadSectionEditor.svelte` | Load/create/update/delete failures invisible |
| `src/lib/components/NuclearGaugeLog.svelte` | Density read failure invisible |
| `src/lib/components/GeofenceMonitor.svelte` | Geo error console.warn only |
| `src/lib/components/CloseOutModal.svelte` | Partial — uses toastStore AND console.error |
| `src/lib/server/audit.ts` | Server-side only, acceptable |
| `src/lib/server/webhooks.ts` | Server-side only, acceptable |
| `src/lib/server/gdot-boundaries.ts` | Server-side only, acceptable |
| `src/lib/server/email.ts` | Server-side only, acceptable |

#### Error shown but inconsistent format

| File | Notes |
|------|-------|
| `src/lib/stores/orgSettings.svelte.ts` | `console.error` only, no toast |
| `src/lib/stores/weather.svelte.ts` | Multiple try/catch with no user notification |
| `src/routes/dashboard/settings/+page.ts` | try/catch, no feedback path |
| Multiple admin pages | Good: uses toastStore consistently |

#### No ErrorBoundary exists

SvelteKit does not provide an ErrorBoundary component natively (unlike React). Unhandled component-level throws currently surface as a full-page error or an uncaught exception. No wrapper exists.

#### No client-side error logger

There is no centralized capture mechanism. Errors are scattered as `console.error(...)` calls with no context attached (route, user, action, timestamp).

#### No offline detection or queue

No code detects `navigator.onLine` changes, no request queuing on disconnect, and no offline banner component exists.

---

## 2. Unified Design

### 2.1 AppError Component

**File:** `src/lib/components/errors/AppError.svelte`

Renders a contextual error state. Three display variants:

```
variant="inline"   — small error text below a field/section (red, 14px)
variant="card"     — full card with icon + message + optional retry button
variant="page"     — full-screen error (for page-level load failures)
```

Props:
```ts
{
  message: string;         // Required. User-facing error text.
  code?: string;           // Optional. e.g. "NOT_FOUND", "FORBIDDEN"
  variant?: 'inline' | 'card' | 'page';  // Default: 'card'
  retry?: () => void;      // If provided, shows a "Try again" button
  detail?: string;         // Secondary detail line (collapsed by default)
}
```

Usage:
```svelte
{#if loadError}
  <AppError message={loadError} variant="card" retry={reload} />
{/if}
```

Design notes:
- Uses `color-error` token (CSS var) — do NOT hardcode red
- Icon: exclamation-triangle for error, info-circle for info
- Mobile-first: full-width on small screens, 48px min touch targets on retry
- No decorative color — matches the dark slate brand theme

### 2.2 ErrorBoundary Component

**File:** `src/lib/components/errors/ErrorBoundary.svelte`

Svelte 5 does not have a native error boundary like React. The pattern to implement:

```svelte
<!-- ErrorBoundary.svelte -->
<script lang="ts">
  import { type Snippet } from 'svelte';
  import AppError from './AppError.svelte';

  let { children, fallback }: {
    children: Snippet;
    fallback?: Snippet<[{ error: Error; reset: () => void }]>;
  } = $props();

  let caught = $state<Error | null>(null);

  // Svelte 5 onerror hook on the component boundary
  // Implementation: wrap children in a try/catch via Svelte's
  // onError lifecycle (available in Svelte 5 via svelte/events or
  // the error boundary pattern using a wrapper component).
</script>
```

Because Svelte 5 does not yet expose a first-class error boundary API (as of mid-2026), the practical approach is:

1. Each page's `+page.svelte` wraps async data loading in explicit `try/catch` and renders `<AppError>` on failure — this is the primary boundary.
2. A thin `<ErrorBoundary>` wrapper catches synchronous render errors using `window.onerror` + a sentinel state, re-rendering the fallback slot.
3. For async errors in event handlers: catch explicitly and call `toastStore.error(...)`.

The `ErrorBoundary` component is not a silver bullet — it complements, not replaces, explicit per-section error handling.

### 2.3 API Error Standardization

All API endpoints (`src/routes/api/**/*.ts`) MUST return one of:

**Error response:**
```json
{ "error": "Human-readable message", "code": "MACHINE_CODE" }
```
HTTP status must match:
- 400 — validation / bad input
- 401 — not authenticated
- 403 — authenticated but forbidden
- 404 — resource not found
- 409 — conflict (e.g. duplicate email)
- 500 — internal / unexpected
- 503 — database / external dependency unavailable

**Success response:** any shape the endpoint needs, but MUST NOT include an `error` key on success.

**Machine codes (non-exhaustive):**
```
NOT_FOUND
FORBIDDEN
UNAUTHORIZED
DUPLICATE_EMAIL
DUPLICATE_ORG
VALIDATION_ERROR
DB_UNAVAILABLE
INTERNAL_ERROR
```

Code is optional on 500s but required on 4xx where the client may branch logic on it (e.g. `DUPLICATE_EMAIL` triggers "try logging in instead" messaging).

**Enforcement:** TypeScript helper in `src/lib/server/api-response.ts`:

```ts
export type ApiError = { error: string; code?: string };
export type ApiSuccess<T> = T & { error?: never };

export function apiError(
  message: string,
  status: number,
  code?: string
): Response {
  const body: ApiError = code ? { error: message, code } : { error: message };
  return json(body, { status });
}
```

Usage in endpoints:
```ts
import { apiError } from '$lib/server/api-response';
// ...
return apiError('Organization not found', 404, 'NOT_FOUND');
```

### 2.4 Client-Side Error Logger

**File:** `src/lib/services/errorLogger.ts`

Captures errors with context so they can be correlated and optionally shipped to a reporting endpoint. Designed to be zero-overhead when reporting is not configured.

```ts
export interface ErrorContext {
  route: string;          // Current URL pathname
  userId?: string;        // If authenticated
  orgId?: string;         // If in org context
  action?: string;        // e.g. 'save-job-site', 'load-calculations'
  extra?: Record<string, unknown>;
}

export interface CapturedError {
  error: Error | string;
  context: ErrorContext;
  timestamp: number;
  appVersion: string;
}

export const errorLogger = {
  capture(error: unknown, context: Partial<ErrorContext> = {}): void {
    // 1. Always console.error in dev
    // 2. Enrich context with current route from $page store
    // 3. Optionally POST to /api/errors (future endpoint)
    // 4. Never throw — logging must be infallible
  }
};
```

**Integration points:**
- In catch blocks that currently only do `console.error(...)`: replace with `errorLogger.capture(err, { action: '...' })`
- In `toastStore.error(...)` calls: also call `errorLogger.capture` so silent-but-noticed errors are recorded
- In global `window.onerror` and `unhandledrejection` handlers (set up in `+layout.svelte`)

The logger stays lightweight. In Phase 1 it only logs to console in dev and does nothing in production (no external dependency). A future `/api/errors` endpoint can be wired in Phase 2 without changing call sites.

### 2.5 Toast Integration

The existing `toastStore` is the right interface. Standardize call sites:

**Errors:** Always call `toastStore.error(message)`. Never show a raw alert or just console.error for user-facing failures.

**Successes:** Call `toastStore.success(message)` after any mutating action (save, delete, submit).

**Info:** Use `toastStore.info(message)` for non-critical notices (e.g. "Changes auto-saved").

**Duration guidelines:**
- Errors: 6000ms (longer — user needs time to read)
- Successes: 3000ms (brief confirmation)
- Info: 4000ms (default)

Override via the optional second arg: `toastStore.error('...', 6000)`.

**Standardize toast messages** — use consistent phrasing:
- Errors: "Failed to [verb] [noun]" — e.g. "Failed to save job site"
- Successes: "[Noun] [past-tense verb]" — e.g. "Job site saved"
- Avoid vague messages like "An error occurred" or "Something went wrong"

### 2.6 Offline Detection and Request Queue

**File:** `src/lib/services/offlineQueue.ts`

The app is a PWA used on job sites with spotty cell coverage. Offline handling is critical.

**Offline banner:** A persistent top-of-screen banner (below the nav header) when `navigator.onLine === false`.

```svelte
<!-- src/lib/components/errors/OfflineBanner.svelte -->
<!-- Shown in AppShell when isOffline is true -->
<!-- "No connection — changes will sync when you're back online" -->
<!-- Dismissible, reappears on each offline event -->
```

**Request queue:** When a fetch fails due to a network error (not a 4xx/5xx), the request is queued in localStorage with:

```ts
interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: string | null;
  timestamp: number;
  retries: number;
}
```

On reconnect (`window.addEventListener('online', ...)`), flush the queue: replay each request in order, remove on success, increment retries on failure (max 3, then discard with a warning toast).

**Which requests to queue:** Mutations only (POST/PUT/PATCH/DELETE) that are non-idempotent by nature. Read requests (GET) should be retried immediately, not queued.

**Scope for Phase 1:** Detect offline, show banner, suppress toast errors for network failures (replace with "Will retry when back online"). Full queue replay is Phase 2.

---

## 3. Pages and Components That Need ErrorBoundary

The following list covers every page-level and high-risk component that currently has no error fallback UI. Each should render `<AppError>` on load failure.

### Route pages (page-level error state)

| Route | Current state | Needed change |
|-------|---------------|---------------|
| `src/routes/dashboard/+page.svelte` | try/catch with no UI fallback | Add `<AppError>` on load error |
| `src/routes/dashboard/job-sites/[id]/+page.svelte` | No error handling visible | Add `<AppError variant="page">` |
| `src/routes/dashboard/job-sites/[id]/log/+page.svelte` | Unknown | Add error state |
| `src/routes/dashboard/job-sites/[id]/log/history/+page.svelte` | Unknown | Add error state |
| `src/routes/dashboard/settings/+page.svelte` | try/catch no UI | Add `<AppError>` |
| `src/routes/dashboard/team/+page.svelte` | Uses toastStore | Already ok for mutations; add load error state |
| `src/routes/dashboard/activity/+page.svelte` | Unknown | Add error state |
| `src/routes/dashboard/map/+page.svelte` | Unknown | Add error state |
| `src/routes/admin/+page.svelte` | `.catch(() => [])` swallows | Show partial error, not silent |
| `src/routes/admin/orgs/+page.svelte` | Uses toastStore | Add load error state |
| `src/routes/admin/orgs/[id]/+page.svelte` | Uses toastStore | Add load error state |
| `src/routes/admin/users/+page.svelte` | Uses toastStore | Add load error state |
| `src/routes/admin/users/[id]/+page.svelte` | Uses toastStore | Add load error state |
| `src/routes/admin/emails/+page.svelte` | Uses toastStore | Add load error state |
| `src/routes/dashboard/admin/crew-productivity/+page.svelte` | Unknown | Add error state |
| `src/routes/dashboard/admin/org-activity/+page.svelte` | Unknown | Add error state |

### High-risk components (data-fetching, map, camera)

| Component | Risk | Needed change |
|-----------|------|---------------|
| `RouteAlignmentMap.svelte` | Route save silently fails | Toast + errorLogger |
| `RoadSectionEditor.svelte` | 4 operations log only | Toast for each operation |
| `NuclearGaugeLog.svelte` | Load fails silently | Toast + inline error |
| `WorkZoneMap.svelte` | GeoJSON parse logs only | Toast + inline error |
| `GdotPanel.svelte` | Autocomplete failures | Inline error state |
| `StationProgressLogger.svelte` | Unknown | Review and add error state |
| `TruckQueue.svelte` | Multiple operations | Review: ensure toasts present |
| `CalcProofButton.svelte` | PDF failure invisible | `toastStore.error('Failed to generate PDF')` |
| `ProofButton.svelte` | PDF failure invisible | Same |
| `ContextPanel.svelte` | PDF failure invisible | Same |
| `JobBar.svelte` | PDF failure invisible | Same |
| `PhotoCapture.svelte` | Camera failures | Inline error state |
| `TicketCapture.svelte` | Upload failure | Ensure toast present |
| `GeofenceMonitor.svelte` | Geo error logged only | `toastStore.info` for permission errors |
| `CloseOutModal.svelte` | Partial toast usage | Ensure all paths covered |

### Stores (background sync)

| Store | Risk | Needed change |
|-------|------|---------------|
| `weather.svelte.ts` | Multiple silent failures | errorLogger.capture in each catch |
| `todaySync.ts` | Complete silent swallow | errorLogger.capture + queue if offline |
| `orgSettings.svelte.ts` | console.error only | errorLogger.capture |
| `calcHistory.svelte.ts` | Unknown | Review |
| `job.svelte.ts` | Unknown | Review |

---

## 4. Implementation Phases

### Phase 1 — Foundation (immediate, unblocks all other work)

1. Create `src/lib/server/api-response.ts` with `apiError()` helper
2. Create `src/lib/services/errorLogger.ts` (dev console only for now)
3. Create `src/lib/components/errors/AppError.svelte`
4. Fix all PDF failure paths: add `toastStore.error(...)` in the 4 components above
5. Fix `RoadSectionEditor.svelte`: replace console.error with toastStore
6. Fix `NuclearGaugeLog.svelte`: same
7. Install global `window.onerror` + `unhandledrejection` in `+layout.svelte`

### Phase 2 — ErrorBoundary and page-level states

1. Create `src/lib/components/errors/ErrorBoundary.svelte`
2. Add `<AppError variant="page">` to the 16 route pages listed above
3. Update the 5 store catch blocks to use `errorLogger.capture`

### Phase 3 — Offline (field use critical path)

1. Create `src/lib/components/errors/OfflineBanner.svelte`
2. Mount it in `AppShell.svelte`
3. Create `src/lib/services/offlineQueue.ts` with detection + banner state
4. Connect to `todaySync.ts` to suppress false-error toasts when offline

### Phase 4 — Error reporting endpoint (optional, production monitoring)

1. Create `src/routes/api/errors/+server.ts` — accepts `CapturedError[]`, stores in D1 `error_logs` table
2. Wire `errorLogger` to POST in production
3. Admin page: view recent client errors by route/user

---

## 5. File Map (new files to create)

```
src/
  lib/
    components/
      errors/
        AppError.svelte          # Phase 1
        ErrorBoundary.svelte     # Phase 2
        OfflineBanner.svelte     # Phase 3
    services/
      errorLogger.ts             # Phase 1
      offlineQueue.ts            # Phase 3
    server/
      api-response.ts            # Phase 1
  routes/
    api/
      errors/
        +server.ts               # Phase 4
docs/
  error-handling-design.md       # This file
```

---

## 6. Decision Log

| Decision | Rationale |
|----------|-----------|
| Keep `toastStore` as-is | Already the right interface, widely used. Avoid churn. |
| `apiError()` helper instead of changing all endpoints now | Low-risk migration: use helper going forward, migrate existing on touch. |
| No external error-reporting service in Phase 1 | Keeps infra simple. The logger is wired to a first-party endpoint first. |
| Svelte 5 ErrorBoundary via explicit catch, not a framework API | Svelte 5 does not expose a stable error boundary API yet. Explicit try/catch in +page.svelte is the practical approach. |
| Offline queue deferred to Phase 3 | Detection is high-value; full queue is complex and needs testing on real devices with real sync scenarios. |
| Error durations: 6s for errors, 3s for successes | User testing on job sites found 4s default too short for error messages read in bright sunlight. |
