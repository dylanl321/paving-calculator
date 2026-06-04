# PaveRate Testing Framework — Architecture & Execution Plan

**Created:** June 4, 2026  
**Goal:** Comprehensive automated testing covering server APIs, business logic, and UI components.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CI Pipeline (GitHub Actions)                    │
├──────────────────────────────────────────────────────────────────────┤
│  1. Lint + Type Check       (svelte-check, tsc)                       │
│  2. Unit Tests              (vitest, node env)                         │
│  3. Integration Tests       (vitest, miniflare/D1 env)                │
│  4. Component Tests         (vitest + @testing-library/svelte)        │
│  5. E2E Tests               (Playwright, against local dev server)    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Unit Tests (Pure Logic)

**Tool:** Vitest (already configured)  
**Location:** `src/lib/**/__tests__/*.test.ts`  
**Env:** Node (no DOM, no D1)

### What to test:
- `src/lib/config/formulas.ts` — all calc functions (EXISTING ✓)
- `src/lib/calc/` — ETA, checks (EXISTING ✓)
- `src/lib/server/pdf/` — PDF parser (EXISTING ✓)
- `src/lib/config/overrides.ts` — config merge logic
- `src/lib/server/rate-limit.ts` — rate limiter logic
- `src/lib/server/completeness.ts` — completeness scoring
- `src/lib/server/notifications.ts` — notification builder
- `src/lib/server/webhooks.ts` — payload construction
- `src/lib/server/email-templates.ts` — template rendering
- `src/lib/server/role-views.ts` — permission filtering
- `src/lib/server/dot/normalise.ts` — DOT data normalization

---

## Layer 2: API Integration Tests (Server + D1)

**Tool:** Vitest + miniflare D1 bindings  
**Location:** `src/routes/api/**/__tests__/*.integration.test.ts`  
**Env:** Miniflare (real D1 SQLite, mocked R2)

### Approach:
1. Use `unstable_dev` from wrangler or a custom D1 test helper that:
   - Creates an in-memory SQLite DB
   - Applies all migrations in order
   - Seeds test data (users, orgs, memberships)
   - Provides a `platform.env` mock matching the app's bindings
2. Import route handlers directly and call them with mock `RequestEvent`
3. Assert response status, JSON body, and DB side-effects

### Coverage targets:
- **Auth flow:** register → verify email → login → session cookie → /me → logout
- **Org management:** create org → invite member → accept invite → role checks
- **Job Sites CRUD:** create → update config → list → archive
- **Daily Logs:** create log → add entries → close log → summary rollup
- **Loads:** record load → scan ticket → reject load
- **Calculations:** save calc → list history → delete
- **Admin:** user management, org management, audit log
- **Webhooks:** create → trigger event → verify delivery
- **Crews:** create crew → assign members → assign job sites
- **PDF Import:** upload PDF → parse → create job site from import

### Auth test helper:
```ts
// src/lib/server/__tests__/helpers/auth.ts
export async function createTestUser(db: D1Database, overrides?: Partial<User>): Promise<User>
export async function createTestOrg(db: D1Database, ownerId: string): Promise<Org>
export function mockRequestEvent(opts: { db: D1Database; user?: User; body?: any; params?: Record<string,string> }): RequestEvent
```

---

## Layer 3: Component Tests (UI Units)

**Tool:** Vitest + `@testing-library/svelte` + jsdom  
**Location:** `src/lib/components/__tests__/*.test.ts`  
**Env:** jsdom (browser-like DOM)

### What to test:
- **NumberField** — input formatting, validation, min/max, step
- **CalcCard** — renders result, shows work expandable
- **TonnageCard** — computes and displays correctly given calcContext
- **SpreadRateCard** — gauge visual thresholds
- **LoadTracker** — add/remove loads, running totals
- **TimeInput** — parsing, 12/24h, validation
- **ToastSystem** — show/dismiss/timeout
- **NavSidebar** — collapsed state, active route highlight
- **DailySummaryReport** — renders all sections from log data
- **PhotoCapture** — triggers file input, preview display

### Approach:
- Mock stores (`calcContext`, `job`, `auth`) with test values
- Assert rendered text, visibility, event emissions
- Test reactive updates (change input → result updates)

---

## Layer 4: E2E Tests (Full Stack)

**Tool:** Playwright  
**Location:** `e2e/` at project root  
**Target:** Local dev server (`vite dev` with local D1)

### Critical user journeys:
1. **Registration → First Job Site** — register, create org, create job site, see dashboard
2. **Quick Calculator** — navigate to /app, enter values, verify results match formulas
3. **Daily Log Workflow** — open job site → new daily log → add entries → close out
4. **Team Management** — invite member, change role, remove member
5. **Settings** — update org settings, verify they reflect in calc defaults
6. **Admin Panel** — login as global admin, manage orgs/users
7. **Offline/PWA** — go offline, use calculator, verify data persistence
8. **PDF Import** — upload GDOT PDF, verify parsed job site fields

### Setup:
- `playwright.config.ts` with `webServer` pointing to `vite dev`
- Seed script that resets D1 and creates known test accounts
- Page Object Model for reusable page interactions

---

## Test Infrastructure

### Scripts (package.json):
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration",
  "test:components": "vitest run --project components",
  "test:e2e": "playwright test",
  "test:ci": "vitest run && playwright test"
}
```

### Vitest Workspace (`vitest.workspace.ts`):
```ts
export default [
  {
    test: {
      name: 'unit',
      include: ['src/lib/**/__tests__/**/*.test.ts'],
      exclude: ['**/*.integration.test.ts'],
      environment: 'node'
    }
  },
  {
    test: {
      name: 'integration',
      include: ['src/**/__tests__/**/*.integration.test.ts'],
      environment: 'node',
      setupFiles: ['./tests/setup-d1.ts']
    }
  },
  {
    test: {
      name: 'components',
      include: ['src/lib/components/__tests__/**/*.test.ts'],
      environment: 'jsdom',
      setupFiles: ['./tests/setup-dom.ts']
    }
  }
]
```

### D1 Test Helper (`tests/setup-d1.ts`):
- Reads all `migrations/00*.sql` files in order
- Creates in-memory SQLite via better-sqlite3 (or miniflare's D1)
- Exposes `getTestDb()` and `seedTestData()`

---

## Folder Structure

```
paverate-base/
├── vitest.workspace.ts              # Multi-project config
├── playwright.config.ts             # E2E config
├── tests/
│   ├── setup-d1.ts                  # D1 migration runner for tests
│   ├── setup-dom.ts                 # jsdom setup
│   ├── fixtures/                    # Shared test data
│   │   ├── users.ts
│   │   ├── orgs.ts
│   │   ├── job-sites.ts
│   │   └── daily-logs.ts
│   └── helpers/
│       ├── auth.ts                  # createTestUser, mockSession
│       ├── db.ts                    # getTestDb, resetDb
│       └── request.ts              # mockRequestEvent builder
├── e2e/
│   ├── fixtures/
│   │   └── seed.ts                  # DB seed for E2E
│   ├── pages/                       # Page Object Model
│   │   ├── login.page.ts
│   │   ├── dashboard.page.ts
│   │   ├── calculator.page.ts
│   │   └── job-site.page.ts
│   └── specs/
│       ├── auth.spec.ts
│       ├── calculator.spec.ts
│       ├── daily-log.spec.ts
│       ├── team.spec.ts
│       └── admin.spec.ts
└── src/
    ├── lib/
    │   ├── calc/__tests__/          # EXISTING unit tests
    │   ├── config/__tests__/        # NEW: config/override logic
    │   ├── server/__tests__/        # NEW: server util unit tests
    │   │   └── helpers/             # Shared test helpers
    │   ├── stores/__tests__/        # NEW: store logic tests
    │   └── components/__tests__/    # NEW: component tests
    └── routes/api/
        ├── auth/__tests__/          # NEW: auth integration tests
        ├── job-sites/__tests__/     # NEW: job-sites integration
        ├── org/__tests__/           # NEW: org integration
        └── admin/__tests__/         # NEW: admin integration
```

---

## Coverage Goals

| Layer | Target | Rationale |
|-------|--------|-----------|
| Unit (formulas/config) | 95%+ | Math must be provably correct (GDOT spec compliance) |
| Unit (server utils) | 80%+ | Rate limiting, permissions, completeness scoring |
| Integration (APIs) | 70%+ | Every endpoint's happy path + auth guards |
| Components | 60%+ | Core interaction components, not every wrapper |
| E2E | Critical paths | 8 user journeys covering the main workflows |

---

## Execution Priority

Tasks are ordered by impact — server correctness first (data integrity), then UI correctness (user-facing bugs), then E2E (regression prevention).
