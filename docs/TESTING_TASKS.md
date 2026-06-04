# PaveRate Testing Framework — Kanban Tasks

All tasks reference `docs/TESTING_PLAN.md` for the full architecture.  
Each task is standalone and can be assigned to an agent independently.

---

## Phase 0: Infrastructure Setup

### TASK-T001: Install test dependencies and configure vitest workspace
**Scope:** Package setup only — no tests written.
- Install: `@testing-library/svelte`, `@testing-library/jest-dom`, `jsdom`, `better-sqlite3`, `@playwright/test`
- Create `vitest.workspace.ts` with 3 projects (unit, integration, components)
- Update `vitest.config.ts` → delete (replaced by workspace)
- Add npm scripts: `test`, `test:unit`, `test:integration`, `test:components`, `test:e2e`
- Verify existing 4 test files still pass under the new workspace config
- **Validation:** `npm run test:unit` passes with the existing formula/eta/checks/pdf tests

### TASK-T002: Create D1 test helper (migration runner + seeder)
**Scope:** `tests/setup-d1.ts` + `tests/helpers/db.ts`
- Read all `migrations/00*.sql` files in sorted order
- Use better-sqlite3 to create in-memory DB and execute migrations
- Wrap in a D1-compatible interface (`.prepare()`, `.bind()`, `.first()`, `.all()`, `.run()`)
- Create `tests/fixtures/users.ts` with factory functions for test users (hashed passwords, known IDs)
- Create `tests/fixtures/orgs.ts` with factory for org + membership
- **Validation:** A trivial test that seeds a user and queries it back passes

### TASK-T003: Create request event mock builder
**Scope:** `tests/helpers/request.ts` + `tests/helpers/auth.ts`
- Build a `mockRequestEvent()` function that constructs a SvelteKit `RequestEvent` with:
  - `platform.env.DB` → test D1 instance
  - `platform.env.ASSETS_BUCKET` → mock R2 (no-op or in-memory)
  - `cookies` → mock cookie jar (get/set/delete)
  - `request` → constructed from method/body/headers params
  - `params` → route params
  - `url` → constructed URL with searchParams
- Build `createAuthenticatedEvent()` that pre-seeds a session cookie
- **Validation:** Can construct an event, call a simple route handler, get a Response

### TASK-T004: Set up Playwright config and seed script
**Scope:** `playwright.config.ts` + `e2e/fixtures/seed.ts`
- Configure Playwright: chromium only (for speed), baseURL `http://localhost:5173`
- `webServer` config to start `vite dev` before tests
- Create `e2e/fixtures/seed.ts` that:
  - Resets local D1 (run migrations fresh)
  - Seeds: admin user, regular user, org, job site, daily log
  - Known credentials for login in tests
- Create `e2e/pages/login.page.ts` (Page Object) with `goto()`, `login(email, password)`, `expectLoggedIn()`
- **Validation:** A smoke test that opens `/login` and verifies the page loads

---

## Phase 1: Server Unit Tests (Pure Logic)

### TASK-T005: Unit tests for `src/lib/server/rate-limit.ts`
- Test sliding window logic
- Test that requests within limit pass, requests over limit fail
- Test window expiry/reset
- **File:** `src/lib/server/__tests__/rate-limit.test.ts`

### TASK-T006: Unit tests for `src/lib/server/completeness.ts`
- Test completeness score calculation for job sites
- Test edge cases: empty job site, fully complete, partial
- Verify weighting of each field/section
- **File:** `src/lib/server/__tests__/completeness.test.ts`

### TASK-T007: Unit tests for `src/lib/server/role-views.ts`
- Test permission filtering for each role (owner, admin, member)
- Test field-level visibility rules
- Test that escalation is blocked (member can't see admin fields)
- **File:** `src/lib/server/__tests__/role-views.test.ts`

### TASK-T008: Unit tests for `src/lib/server/email-templates.ts`
- Test template rendering with variable substitution
- Test all template types (invite, verify, reset, report)
- Test missing variable handling (no crashes)
- **File:** `src/lib/server/__tests__/email-templates.test.ts`

### TASK-T009: Unit tests for `src/lib/server/webhooks.ts`
- Test payload construction for each event type
- Test signature generation (HMAC)
- Test retry logic / delivery status
- **File:** `src/lib/server/__tests__/webhooks.test.ts`

### TASK-T010: Unit tests for `src/lib/server/dot/normalise.ts`
- Test DOT data normalization (county codes, project IDs, route parsing)
- Test edge cases from real GDOT data
- **File:** `src/lib/server/dot/__tests__/normalise.test.ts`

### TASK-T011: Unit tests for `src/lib/config/overrides.ts`
- Test config merge priority (manual override → job-site config → org defaults → base yaml)
- Test that unset values fall through correctly
- Test type coercion / validation
- **File:** `src/lib/config/__tests__/overrides.test.ts`

---

## Phase 2: API Integration Tests

### TASK-T012: Integration tests for auth endpoints
- Test: POST /api/auth/register (success, duplicate email, weak password)
- Test: POST /api/auth/login (success, wrong password, unverified email)
- Test: GET /api/auth/me (valid session, expired session, no session)
- Test: POST /api/auth/logout (clears session)
- Test: POST /api/auth/forgot-password → reset-password flow
- **File:** `src/routes/api/auth/__tests__/auth.integration.test.ts`

### TASK-T013: Integration tests for org management endpoints
- Test: GET /api/org (returns user's org)
- Test: GET/PUT /api/org/settings (read + update org settings)
- Test: POST /api/org/invite (invite member, bulk invite)
- Test: GET/PATCH/DELETE /api/org/members/[userId] (role changes, removal)
- Test: POST /api/org/logo (upload, size limits)
- Test role guards: member can't invite, admin can't change owner
- **File:** `src/routes/api/org/__tests__/org.integration.test.ts`

### TASK-T014: Integration tests for job-sites CRUD
- Test: POST /api/job-sites (create with minimal fields)
- Test: GET /api/job-sites (list, pagination, filtering)
- Test: GET /api/job-sites/[id] (single fetch, 404 for wrong org)
- Test: PUT /api/job-sites/[id] (update config)
- Test: DELETE /api/job-sites/[id] (archive)
- Test: POST /api/job-sites/[id]/config (save calculator config)
- Test cross-org isolation (user A can't see user B's sites)
- **File:** `src/routes/api/job-sites/__tests__/job-sites.integration.test.ts`

### TASK-T015: Integration tests for daily logs + entries
- Test: POST /api/job-sites/[id]/logs (create log for today)
- Test: GET /api/job-sites/[id]/logs (list logs, date filtering)
- Test: POST /api/job-sites/[id]/logs/[logId]/entries (add entry)
- Test: PUT entries/[entryId] (update entry)
- Test: POST /api/job-sites/[id]/logs/[logId]/close (close out)
- Test: GET /api/job-sites/[id]/logs/summary (verify rollup math)
- Test: Cannot modify closed log (returns 409 or 403)
- **File:** `src/routes/api/job-sites/__tests__/daily-logs.integration.test.ts`

### TASK-T016: Integration tests for loads tracking
- Test: POST /api/job-sites/[id]/loads (record a load)
- Test: POST /api/job-sites/[id]/loads/scan (ticket scan)
- Test: POST /api/job-sites/[id]/loads/[loadId]/reject (reject load)
- Test: Verify load totals aggregate correctly in log summary
- **File:** `src/routes/api/job-sites/__tests__/loads.integration.test.ts`

### TASK-T017: Integration tests for crews management
- Test: POST /api/org/crews (create crew)
- Test: GET /api/org/crews (list crews)
- Test: PUT /api/org/crews/[crewId] (update crew)
- Test: POST /api/org/crews/[crewId]/job-sites (assign job site)
- Test: POST /api/org/members/[userId]/crew (assign member to crew)
- **File:** `src/routes/api/org/__tests__/crews.integration.test.ts`

### TASK-T018: Integration tests for calculations history
- Test: POST /api/calculations (save calculation)
- Test: GET /api/calculations (list with pagination)
- Test: DELETE /api/calculations/[id] (remove)
- Test: Calculations are org-scoped (can't see other org's calcs)
- **File:** `src/routes/api/calculations/__tests__/calculations.integration.test.ts`

### TASK-T019: Integration tests for admin endpoints
- Test: GET /api/admin/users (list all, search, pagination)
- Test: GET/PUT /api/admin/users/[id] (view/modify user)
- Test: POST /api/admin/users/[id]/verify-email (force verify)
- Test: GET /api/admin/orgs (list, search)
- Test: GET /api/admin/audit (audit log retrieval)
- Test: ALL admin endpoints return 403 for non-admin users
- **File:** `src/routes/api/admin/__tests__/admin.integration.test.ts`

### TASK-T020: Integration tests for webhooks system
- Test: POST /api/webhooks (create webhook)
- Test: GET /api/webhooks (list)
- Test: PUT /api/webhooks/[id] (update URL/events)
- Test: DELETE /api/webhooks/[id] (remove)
- Test: GET /api/webhooks/[id]/deliveries (delivery history)
- Test: Webhook fires on relevant events (job-site created, log closed)
- **File:** `src/routes/api/webhooks/__tests__/webhooks.integration.test.ts`

---

## Phase 3: Component Tests (UI)

### TASK-T021: Set up component test environment
- Create `tests/setup-dom.ts` with jsdom + @testing-library/jest-dom matchers
- Create mock for `$app/navigation` (goto, invalidate)
- Create mock for `$app/stores` (page)
- Create mock for calcContext store (with configurable values)
- Create mock for auth store (logged in/out states)
- **Validation:** A trivial Svelte component renders in the test env

### TASK-T022: Component tests for NumberField
- Test renders with label, value, unit
- Test min/max enforcement
- Test step increment/decrement
- Test keyboard input and formatting
- Test disabled state
- **File:** `src/lib/components/__tests__/NumberField.test.ts`

### TASK-T023: Component tests for CalcCard + ResultStat
- Test renders title, description
- Test result display with correct formatting
- Test "Show Work" expandable section
- Test loading/skeleton state
- **File:** `src/lib/components/__tests__/CalcCard.test.ts`

### TASK-T024: Component tests for TonnageCard
- Test correct tonnage calculation display from inputs
- Test warning states (over-order, under-order)
- Test reactive update when calcContext changes
- **File:** `src/lib/components/__tests__/TonnageCard.test.ts`

### TASK-T025: Component tests for SpreadRateCard + gauge
- Test gauge renders at correct position for given rate
- Test threshold coloring (green/yellow/red)
- Test spec range display
- **File:** `src/lib/components/__tests__/SpreadRateCard.test.ts`

### TASK-T026: Component tests for LoadTracker
- Test add load (increments count + tonnage)
- Test remove load (decrements)
- Test running total accuracy
- Test empty state
- **File:** `src/lib/components/__tests__/LoadTracker.test.ts`

### TASK-T027: Component tests for DailySummaryReport
- Test renders all sections from a complete log
- Test handles missing/partial data gracefully
- Test weather display
- Test tonnage/spread rate summary math
- **File:** `src/lib/components/__tests__/DailySummaryReport.test.ts`

### TASK-T028: Component tests for NavSidebar + AppShell
- Test sidebar collapse/expand
- Test active route highlighting
- Test mobile responsive behavior (hidden by default)
- Test navigation link list matches expected routes
- **File:** `src/lib/components/__tests__/NavSidebar.test.ts`

---

## Phase 4: E2E Tests

### TASK-T029: E2E — Registration and login flow
- Register new user → verify redirect to onboarding
- Login with valid credentials → verify dashboard
- Login with wrong password → verify error message
- Logout → verify redirected to login
- **File:** `e2e/specs/auth.spec.ts`

### TASK-T030: E2E — Quick Calculator (standalone /app)
- Navigate to /app
- Enter road width, length, lift thickness
- Verify tonnage result matches expected formula output
- Switch calculators (tack, subgrade, concrete)
- Verify each calculator renders and computes
- **File:** `e2e/specs/calculator.spec.ts`

### TASK-T031: E2E — Job Site creation and configuration
- Create new job site from dashboard
- Fill in project details (name, location, contract)
- Configure mix designs
- Verify job site appears in list
- Open job site detail page → verify config persisted
- **File:** `e2e/specs/job-site.spec.ts`

### TASK-T032: E2E — Daily log workflow
- Open existing job site
- Create new daily log
- Add paving entries (station, tonnage, width)
- Record loads
- Close out the log
- Verify summary report shows correct totals
- **File:** `e2e/specs/daily-log.spec.ts`

### TASK-T033: E2E — Team management
- Navigate to team settings
- Invite a new member (enter email)
- Verify invite appears in pending list
- Change member role
- Remove member → verify removed from list
- **File:** `e2e/specs/team.spec.ts`

### TASK-T034: E2E — Admin panel
- Login as global admin
- View all users, search by email
- View all orgs
- Inspect a specific org's details
- Verify non-admin user gets 403 on /admin routes
- **File:** `e2e/specs/admin.spec.ts`

---

## Phase 5: CI Pipeline

### TASK-T035: GitHub Actions workflow for test automation
- Create `.github/workflows/test.yml`
- Steps: checkout → install deps → type check → unit tests → integration tests → component tests
- E2E as a separate job (needs vite dev server)
- Cache node_modules between runs
- Run on: push to `feat/auth-and-data`, PR to `main`
- Report test results as PR comment (optional)
- **Validation:** Push a commit, verify CI runs and reports results

### TASK-T036: Coverage reporting and thresholds
- Configure vitest coverage (v8 provider)
- Set thresholds: unit 95%, integration 70%, components 60%
- Generate lcov report for CI badge
- Add coverage badge to README
- Fail CI if coverage drops below threshold
- **File:** Update `vitest.workspace.ts` with coverage config

---

## Task Dependency Graph

```
T001 (deps + workspace) ──┬── T002 (D1 helper) ──┬── T012-T020 (API integration tests)
                          │                       │
                          ├── T003 (request mock) ─┘
                          │
                          ├── T005-T011 (server unit tests) [no deps beyond T001]
                          │
                          ├── T021 (component env) ── T022-T028 (component tests)
                          │
                          └── T004 (playwright) ── T029-T034 (E2E tests)
                                                         │
T035 (CI) ── depends on all above being green ───────────┘
T036 (coverage) ── depends on T035
```

---

## Suggested Execution Order

1. **T001** → foundation (everything depends on this)
2. **T002 + T003** → test infra for integration tests
3. **T005-T011** → quick wins, pure logic, high confidence
4. **T021** → component test env
5. **T012-T014** → auth + org + job-sites (core flows)
6. **T022-T026** → calculator component tests
7. **T004** → playwright setup
8. **T015-T020** → remaining API tests
9. **T027-T028** → remaining component tests
10. **T029-T034** → E2E tests
11. **T035-T036** → CI automation + coverage gates
