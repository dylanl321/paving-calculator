# PaveRate Testing Architecture

**Status:** Design document (implementation tracked in TESTING_TASKS.md)
**Last updated:** June 4, 2026
**Context:** SvelteKit 5 (runes) + Cloudflare D1/R2, 61 migrations, Vitest 4, Node/ESM

---

## Overview

PaveRate has three natural test boundaries:

1. **Pure logic** -- formulas, config merges, PDF parsing, server utilities. No runtime deps.
   Tool: Vitest, environment: node.

2. **Server handlers** -- +server.ts routes that read D1, check auth, write audit rows.
   Tool: Vitest, environment: node + better-sqlite3 D1 shim.

3. **UI components** -- Svelte 5 runes components rendered in a browser-like DOM.
   Tool: Vitest + @testing-library/svelte, environment: jsdom.

4. **Full stack** -- real browser, real dev server, real local D1.
   Tool: Playwright.

Current state: 4 test files exist under `src/lib/**/__tests__/` (formulas, eta, checks, PDF
regression), all running under a single `vitest.config.ts` with `environment: 'node'`. This
architecture replaces that single config with a vitest workspace that separates the three
in-process layers, then adds a Playwright layer on top.

---

## 1. Vitest Projects Config

File: `vitest.config.ts` (root config; `test.projects` array — Vitest v4 replaced the old `vitest.workspace.ts`)

```ts
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';
import yaml from '@rollup/plugin-yaml';

export default defineWorkspace([
  // ── Project 1: Unit tests (pure logic, no DOM, no DB) ──────────────────────
  {
    plugins: [yaml() as any],
    test: {
      name: 'unit',
      include: [
        'src/lib/calc/__tests__/**/*.test.ts',
        'src/lib/config/__tests__/**/*.test.ts',
        'src/lib/server/__tests__/**/*.test.ts',       // excludes integration
        'src/lib/server/dot/__tests__/**/*.test.ts',
        'src/lib/server/pdf/__tests__/**/*.test.ts',
      ],
      exclude: ['**/*.integration.test.ts'],
      environment: 'node',
      globals: false,
    },
  },

  // ── Project 2: Integration tests (server handlers + D1 shim) ───────────────
  {
    plugins: [yaml() as any],
    test: {
      name: 'integration',
      include: ['src/**/__tests__/**/*.integration.test.ts'],
      environment: 'node',
      globals: false,
      setupFiles: ['./tests/setup-d1.ts'],
      pool: 'forks',             // each test file gets its own DB instance
      poolOptions: {
        forks: { singleFork: false },
      },
    },
  },

  // ── Project 3: Component tests (Svelte + jsdom) ─────────────────────────────
  {
    plugins: [yaml() as any],
    test: {
      name: 'components',
      include: ['src/lib/components/__tests__/**/*.test.ts'],
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./tests/setup-dom.ts'],
    },
  },
]);
```

### Why three projects, not one config

- `unit` must resolve `$lib`, `$app/environment`, and YAML imports -- no jsdom overhead.
- `integration` needs `pool: 'forks'` so each file gets a fresh in-memory SQLite; shared
  memory state between parallel tests on the same DB causes false failures.
- `components` needs jsdom to render `<svelte:window>`, CSS media queries, and focus events;
  running in node silently degrades Svelte rendering.

### Existing tests

All 4 existing test files fall under the `unit` project (node, YAML plugin). No changes
to those files are needed.

---

## 2. D1 Test Helper

### The problem

Route handlers call `event.platform.env.DB` which is a Cloudflare D1 `Database` object. In
tests we need a real relational store (to catch FK violations, migration ordering bugs, and
JOIN correctness) without spinning up Wrangler or making network calls.

### Approach: better-sqlite3 with a D1-compatible wrapper

`better-sqlite3` is a synchronous Node.js SQLite driver. D1's API is async
(`.prepare().bind().first()/.all()/.run()` all return Promises). The wrapper adapts the sync
calls to Promises so server code sees exactly the D1 interface it expects.

```
tests/
  setup-d1.ts          -- vitest globalSetup: runs migrations once per worker process
  helpers/
    db.ts              -- getTestDb(), resetTestDb(), D1DatabaseMock class
    auth.ts            -- createTestUser(), createTestOrg(), makeSessionCookie()
    request.ts         -- mockRequestEvent() builder
  fixtures/
    users.ts           -- factory: user rows with hashed passwords
    orgs.ts            -- factory: org + membership rows
    job-sites.ts       -- factory: job site rows with config
    daily-logs.ts      -- factory: log + entry rows
```

### D1DatabaseMock interface

```ts
// tests/helpers/db.ts

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export class D1DatabaseMock {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  prepare(sql: string): D1PreparedStatementMock {
    return new D1PreparedStatementMock(this.db, sql);
  }

  // D1 batch support
  async batch<T>(statements: D1PreparedStatementMock[]): Promise<D1Result<T>[]> {
    return this.db.transaction(() =>
      statements.map((s) => s._runSync())
    )();
  }

  // D1 exec (raw SQL string, used by migrations)
  async exec(query: string): Promise<D1ExecResult> {
    this.db.exec(query);
    return { count: 0, duration: 0 };
  }
}

class D1PreparedStatementMock {
  private db: Database.Database;
  private sql: string;
  private bindings: unknown[] = [];

  constructor(db: Database.Database, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...values: unknown[]): this {
    this.bindings = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    return (stmt.get(...this.bindings) as T) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.all(...this.bindings) as T[];
    return { results, success: true, meta: {} as D1Meta };
  }

  async run(): Promise<D1Result<void>> {
    const stmt = this.db.prepare(this.sql);
    stmt.run(...this.bindings);
    return { results: undefined, success: true, meta: {} as D1Meta };
  }

  // Internal sync path for batch()
  _runSync(): D1Result<void> {
    const stmt = this.db.prepare(this.sql);
    stmt.run(...this.bindings);
    return { results: undefined, success: true, meta: {} as D1Meta };
  }
}

export function createTestDb(): D1DatabaseMock {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Apply all migrations in sorted order
  const dir = join(process.cwd(), 'migrations');
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf-8');
    db.exec(sql);
  }
  return new D1DatabaseMock(db);
}

export function resetTestDb(mock: D1DatabaseMock): void {
  // Drop all rows while keeping schema; faster than re-running migrations
  const db = (mock as any).db as Database.Database;
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations'")
    .all() as { name: string }[];
  db.transaction(() => {
    for (const { name } of tables.reverse()) {
      db.prepare(`DELETE FROM "${name}"`).run();
    }
  })();
}
```

### Migration compatibility notes

- All 61 migrations live in `migrations/0001_*.sql` through `migrations/0061_*.sql`. The
  `fresh/0001_full_schema.sql` is a convenience snapshot only -- do not apply it in tests
  (it would collide with the incremental files). The glob `^\d{4}_.*\.sql$` skips the
  `fresh/` subdirectory automatically.
- SQLite does not support `ADD COLUMN IF NOT EXISTS` (unlike PostgreSQL). Historical
  migrations use bare `ALTER TABLE ... ADD COLUMN`. This is intentional -- run them strictly
  in order and they apply cleanly to a fresh schema.
- D1 uses `?` positional placeholders; better-sqlite3 also uses `?` -- no translation needed.
- D1's `.prepare().bind().first()` returns `null` on no-row; better-sqlite3's `.get()`
  returns `undefined`. The wrapper normalises this to `null`.
- `crypto.randomUUID()` is available in Node 19+; auth.ts uses it for session tokens. Tests
  running on Node 18 must polyfill: add `import { randomUUID } from 'crypto'; global.crypto = { randomUUID } as any;` in `setup-d1.ts` before importing server modules.

---

## 3. RequestEvent Mock Builder

SvelteKit +server.ts handlers receive a `RequestEvent`. Tests need to construct one that
passes auth guards, carries a real DB instance, and accepts body/params.

### API design

```ts
// tests/helpers/request.ts

import type { RequestEvent } from '@sveltejs/kit';
import type { D1DatabaseMock } from './db';

interface MockR2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream | string): Promise<void>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
}

interface MockRequestEventOptions {
  db: D1DatabaseMock;
  r2?: MockR2Bucket;
  method?: string;
  body?: Record<string, unknown> | string | FormData;
  params?: Record<string, string>;
  searchParams?: Record<string, string>;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  // Pre-authenticated as a specific user (sets session cookie automatically)
  sessionUserId?: string;
}

export function mockRequestEvent(opts: MockRequestEventOptions): RequestEvent {
  const method = opts.method ?? 'GET';
  const url = new URL('http://localhost/api/test');
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  const cookieJar: Record<string, string> = { ...(opts.cookies ?? {}) };
  const cookies = {
    get: (name: string) => cookieJar[name] ?? null,
    set: (name: string, value: string) => { cookieJar[name] = value; },
    delete: (name: string) => { delete cookieJar[name]; },
    getAll: () => Object.entries(cookieJar).map(([name, value]) => ({ name, value })),
    serialize: (name: string, value: string) => `${name}=${value}`,
  };

  let requestBody: BodyInit | null = null;
  const reqHeaders: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body) {
    if (typeof opts.body === 'string') {
      requestBody = opts.body;
    } else if (opts.body instanceof FormData) {
      requestBody = opts.body;
    } else {
      requestBody = JSON.stringify(opts.body);
      reqHeaders['content-type'] = 'application/json';
    }
  }

  const request = new Request(url.toString(), {
    method,
    headers: reqHeaders,
    body: method !== 'GET' && method !== 'HEAD' ? requestBody : undefined,
  });

  const r2: MockR2Bucket = opts.r2 ?? {
    put: async () => {},
    get: async () => null,
    delete: async () => {},
  };

  return {
    request,
    url,
    params: opts.params ?? {},
    route: { id: null },
    cookies,
    locals: {},
    platform: {
      env: {
        DB: opts.db as unknown as D1Database,
        ASSETS_BUCKET: r2 as unknown as R2Bucket,
      },
      context: { waitUntil: () => {} },
      caches: {} as CacheStorage,
      cf: {} as IncomingRequestCfProperties,
    },
    fetch: globalThis.fetch,
    getClientAddress: () => '127.0.0.1',
    isDataRequest: false,
    isSubRequest: false,
    setHeaders: () => {},
    depends: () => {},
    untrack: (fn) => fn(),
    parent: async () => ({}),
  } as unknown as RequestEvent;
}
```

### Authenticated request helper

Auth guards in PaveRate call `requireAuth(event)` which reads the `paverate_session` cookie,
looks up the session in D1, and returns the user or throws a 401 Response. To test protected
endpoints, pre-seed a session row and inject the cookie:

```ts
// tests/helpers/auth.ts

import type { D1DatabaseMock } from './db';
import { mockRequestEvent, type MockRequestEventOptions } from './request';
import { createTestUser } from '../fixtures/users';

export async function createAuthenticatedEvent(
  db: D1DatabaseMock,
  opts: Omit<MockRequestEventOptions, 'db' | 'cookies'> & {
    userId?: string;  // use existing user; if omitted a fresh user is seeded
  }
) {
  const userId = opts.userId ?? (await createTestUser(db)).id;
  const sessionId = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + 86400;

  await db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, userId, expiresAt).run();

  return mockRequestEvent({
    ...opts,
    db,
    cookies: { paverate_session: sessionId },
  });
}
```

### Usage pattern in an integration test

```ts
// src/routes/api/job-sites/__tests__/job-sites.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, resetTestDb } from '../../../../tests/helpers/db';
import { createAuthenticatedEvent } from '../../../../tests/helpers/auth';
import { GET, POST } from '../+server';

let db: ReturnType<typeof createTestDb>;

beforeEach(() => {
  db = createTestDb();  // fresh in-memory DB with all migrations applied
});

describe('GET /api/job-sites', () => {
  it('returns empty list for new org', async () => {
    const event = await createAuthenticatedEvent(db, { method: 'GET' });
    const response = await GET(event);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.jobSites).toEqual([]);
  });
});
```

---

## 4. Playwright Config

File: `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Mobile-first: default viewport matches the primary design target
    viewport: { width: 390, height: 844 },
  },

  projects: [
    // Mobile Chrome (primary -- this is the main PaveRate surface)
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    // Desktop Chrome (secondary -- dashboard/admin views)
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // Safari mobile (iOS field crews)
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 15'] },
    },
  ],

  // Start the dev server automatically before E2E tests
  webServer: {
    command: 'npx vite dev --port 5173',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Seed the local D1 before accepting requests
    // The seed script must be idempotent (uses INSERT OR IGNORE)
    env: { VITE_TEST_MODE: '1' },
  },

  // Global setup: reset D1 and seed test accounts once per run
  globalSetup: './e2e/fixtures/seed.ts',
});
```

### E2E folder layout

```
e2e/
  fixtures/
    seed.ts             -- global setup: wrangler d1 reset + INSERT known accounts
    known-accounts.ts   -- exported constants: admin email/pw, test user email/pw
  pages/               -- Page Object Model
    login.page.ts       -- goto('/login'), login(email, pw), expectLoggedIn()
    dashboard.page.ts   -- expectOrgName(), clickNewJobSite()
    calculator.page.ts  -- setInput(field, value), readResult(field)
    job-site.page.ts    -- create(name), openDetail(name), addDailyLog()
  specs/
    auth.spec.ts
    calculator.spec.ts
    job-site.spec.ts
    daily-log.spec.ts
    team.spec.ts
    admin.spec.ts
```

### Seed strategy

The global setup script runs once before all E2E specs. It:
1. Calls `npx wrangler d1 execute paverate-db --local --command "DELETE FROM ..."` to wipe
   non-migration tables in a known order (respecting FK constraints).
2. Inserts known users/orgs/job-sites via `wrangler d1 execute --file` with a static SQL file
   in `e2e/fixtures/seed.sql`. Using static SQL (not app code) keeps seeds independent of
   server logic under test.
3. Exports the known credentials to `e2e/fixtures/known-accounts.ts` (imported by specs).

Known test accounts (defined once in `known-accounts.ts`, never hardcoded in spec files):
- `admin@test.paverate.com` / `Test1234!` -- global admin
- `owner@test.paverate.com` / `Test1234!` -- org owner
- `member@test.paverate.com` / `Test1234!` -- regular member

---

## 5. npm Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run --project unit",
    "test:watch": "vitest --project unit",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:components": "vitest run --project components",
    "test:all": "vitest run",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:ci": "vitest run && playwright test --project mobile-chrome"
  }
}
```

Notes:
- `test` (bare) runs only unit tests -- fast feedback during development.
- `test:all` runs all three vitest projects (unit + integration + components).
- `test:ci` is the CI gate: unit + integration + components via `vitest run`, then
  mobile-chrome E2E only (desktop/safari run nightly, not on every PR).
- `test:e2e:ui` opens Playwright's trace/debugging UI -- useful locally, not in CI.

---

## 6. Folder Structure

```
paverate-base/
  vitest.config.ts                 -- root config with test.projects (v4)
  playwright.config.ts             -- E2E config
  tests/
    setup-d1.ts                    -- vitest globalSetup for integration project
    setup-dom.ts                   -- jsdom + @testing-library/jest-dom matchers
    helpers/
      db.ts                        -- D1DatabaseMock, createTestDb(), resetTestDb()
      auth.ts                      -- createTestUser(), createAuthenticatedEvent()
      request.ts                   -- mockRequestEvent() builder
    fixtures/
      users.ts                     -- factory functions (createUser, createAdmin)
      orgs.ts                      -- factory (createOrg, createOrgWithOwner)
      job-sites.ts                 -- factory (createJobSite, createJobSiteWithConfig)
      daily-logs.ts                -- factory (createDailyLog, createClosedLog)
  e2e/
    fixtures/
      seed.ts                      -- globalSetup: wrangler d1 reset + seed SQL
      seed.sql                     -- static INSERT OR IGNORE statements
      known-accounts.ts            -- TEST_ADMIN, TEST_OWNER, TEST_MEMBER credentials
    pages/
      login.page.ts
      dashboard.page.ts
      calculator.page.ts
      job-site.page.ts
    specs/
      auth.spec.ts
      calculator.spec.ts
      job-site.spec.ts
      daily-log.spec.ts
      team.spec.ts
      admin.spec.ts
  src/
    lib/
      calc/__tests__/              -- EXISTING: formulas, eta, checks
      config/__tests__/            -- NEW: overrides.test.ts
      server/__tests__/            -- NEW: rate-limit, completeness, role-views,
      |                                      email-templates, webhooks, notifications
      server/pdf/__tests__/        -- EXISTING: parse-gdot.regression.test.ts
      server/dot/__tests__/        -- NEW: normalise.test.ts
      components/__tests__/        -- NEW: NumberField, CalcCard, TonnageCard,
                                           SpreadRateCard, LoadTracker, NavSidebar
    routes/api/
      auth/__tests__/              -- NEW: *.integration.test.ts
      job-sites/__tests__/         -- NEW: *.integration.test.ts
      org/__tests__/               -- NEW: *.integration.test.ts
      admin/__tests__/             -- NEW: *.integration.test.ts
      webhooks/__tests__/          -- NEW: *.integration.test.ts
```

---

## Dependencies to install

```bash
npm install -D \
  better-sqlite3 \
  @types/better-sqlite3 \
  @testing-library/svelte \
  @testing-library/jest-dom \
  @playwright/test \
  jsdom
```

`better-sqlite3` is a native Node addon. It cannot run inside the Cloudflare Workers runtime
(only in Node-environment test code). This is intentional -- the D1 shim is test-only and
never ships to production.

---

## Key design decisions

### Why better-sqlite3 instead of miniflare?

Miniflare replicates the entire Workers runtime (V8 isolates, KV, R2, Durable Objects).
For testing route handlers we only need D1. better-sqlite3:
- Starts in < 1ms (miniflare takes ~500ms cold)
- Runs synchronously (easier to reason about in beforeEach/afterEach hooks)
- Does not require wrangler to be configured in test mode
- SQLite 3.x dialect is what D1 uses internally, so SQL compatibility is high

### Why pool: 'forks' for integration tests?

Each vitest worker thread in `threads` mode shares a Node process. better-sqlite3 stores its
file descriptor in module-level state. Concurrent tests against different `:memory:` databases
in the same process can interfere when using transactions. `forks` mode gives each test file
its own process, making isolation trivial.

### Why not mock D1 entirely?

Pure mocks (jest.fn() stubs) verify calling conventions but not SQL correctness. A test
that stubs `.first()` to return `{ id: 'x' }` will pass even if the SQL has a syntax error.
The better-sqlite3 approach runs real SQL, catches constraint violations, and validates JOIN
semantics -- the errors that actually matter for a production D1 schema with 61 migrations.

### RequestEvent: return error not throw error

SvelteKit only special-cases thrown `Redirect` and `HttpError`. A `throw error(401)` inside
a catch block where `requireAuth` has already thrown a `Response` turns into a fatal 500.
Server handlers must `return error(...)` when catching inside a try/catch. This is enforced
in code review, not by tests (tests will catch it when the integration test sees 500 instead
of 401).

### Component tests and Svelte 5 runes

`@testing-library/svelte` v5 supports Svelte 5 runes. However `$state(...)` and `$derived(...)`
still require the Svelte compiler to run first. Vitest handles this via
`@sveltejs/vite-plugin-svelte` in the component project's Vite config. The `vitest.config.ts`
entry for `components` must include the plugin:

```ts
{
  plugins: [yaml() as any, sveltekit()],  // sveltekit() from @sveltejs/vite-plugin-svelte
  test: { name: 'components', environment: 'jsdom', ... }
}
```

Without the plugin, `.svelte` imports are passed as raw text to the test runner and fail to
parse.

---

## Coverage targets

| Layer | Tool | Target | Rationale |
|-------|------|--------|-----------|
| Unit (formulas/config) | vitest v8 | 95%+ | GDOT spec compliance -- math must be provably correct |
| Unit (server utilities) | vitest v8 | 80%+ | Rate limiting, permissions, completeness scoring |
| Integration (API handlers) | vitest v8 | 70%+ | Every endpoint happy path + auth guards |
| Components | vitest v8 | 60%+ | Core interaction components, not every wrapper |
| E2E | Playwright | 8 journeys | Regression on critical user workflows |

Coverage is measured per-project (`vitest run --coverage`). The v8 provider is preferred over
istanbul because it works without Babel transforms and handles ESM/runes correctly.
