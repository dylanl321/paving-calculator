/**
 * src/routes/api/job-sites/__tests__/daily-logs.integration.test.ts
 *
 * Integration tests for the daily-log + log-entry + close-out API.
 *
 * Coverage:
 *   POST /api/job-sites/[id]/logs                  create (idempotent)
 *   GET  /api/job-sites/[id]/logs                  list, limit/offset
 *   POST /api/job-sites/[id]/logs/[logId]/entries  add entry
 *   PATCH /api/job-sites/[id]/logs/[logId]/entries/[entryId]  update entry
 *   POST /api/job-sites/[id]/logs/[logId]/close    close-out (requires foreman_name)
 *   GET  /api/job-sites/[id]/logs/summary          rollup math
 *   POST /api/job-sites/[id]/logs/[logId]/entries  -> 423 on closed log (non-admin)
 *   PATCH /api/job-sites/[id]/logs/[logId]/entries/[entryId] -> 423 on closed log (non-admin)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../../../../../tests/helpers/db.js';
import { createTestUser } from '../../../../../tests/fixtures/users.js';
import { createTestOrg, createTestMembership } from '../../../../../tests/fixtures/orgs.js';
import { createTestJobSite } from '../../../../../tests/fixtures/job-sites.js';
import { mockRequestEvent } from '../../../../../tests/helpers/request.js';

import { GET as listLogs, POST as createLog } from '../[id]/logs/+server.js';
import { POST as createEntry } from '../[id]/logs/[logId]/entries/+server.js';
import { PATCH as patchEntry } from '../[id]/logs/[logId]/entries/[entryId]/+server.js';
import { POST as closeLog } from '../[id]/logs/[logId]/close/+server.js';
import { GET as getSummary } from '../[id]/logs/summary/+server.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestContext {
  db: TestDb;
  userId: string;
  orgId: string;
  siteId: string;
}

async function buildContext(): Promise<TestContext> {
  const db = createTestDb();
  const user = await createTestUser(db, { name: 'Foreman Joe', email: 'joe@pave.test' });
  const org = await createTestOrg(db, { name: 'Pave Co', slug: 'pave-co' });
  await createTestMembership(db, user.id, org.id, { role: 'admin' });
  const site = await createTestJobSite(db, org.id, { name: 'SR-400 Resurfacing' });
  return { db, userId: user.id, orgId: org.id, siteId: site.id };
}

/** Build a mock RequestEvent with locals.user already populated. */
function authedEvent(
  ctx: TestContext,
  opts: {
    method?: string;
    pathname?: string;
    params?: Record<string, string>;
    body?: unknown;
    searchParams?: Record<string, string>;
  } = {}
) {
  const event = mockRequestEvent({
    db: ctx.db.d1,
    method: opts.method ?? 'GET',
    pathname: opts.pathname ?? '/',
    params: opts.params ?? {},
    body: opts.body,
    searchParams: opts.searchParams,
  });
  (event.locals as Record<string, unknown>).user = {
    id: ctx.userId,
    email: 'joe@pave.test',
    name: 'Foreman Joe',
    isGlobalAdmin: false,
    disabled: false,
  };
  return event;
}

/** Build a mock RequestEvent without an authenticated user. */
function anonEvent(
  ctx: TestContext,
  opts: {
    method?: string;
    pathname?: string;
    params?: Record<string, string>;
    body?: unknown;
  } = {}
) {
  return mockRequestEvent({
    db: ctx.db.d1,
    method: opts.method ?? 'GET',
    pathname: opts.pathname ?? '/',
    params: opts.params ?? {},
    body: opts.body,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/job-sites/[id]/logs — create daily log', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildContext();
  });

  afterEach(() => ctx.db.close());

  it('creates a daily log for today and returns 201', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId },
    });

    const res = await createLog(event as any);
    expect(res.status).toBe(201);

    const body = await res.json() as { log: { id: string; job_site_id: string; log_date: string } };
    expect(body.log).toBeTruthy();
    expect(body.log.job_site_id).toBe(ctx.siteId);
    expect(body.log.log_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.log.id).toBeTruthy();
  });

  it('is idempotent: calling twice returns existing log (200)', async () => {
    const event1 = authedEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    const res1 = await createLog(event1 as any);
    const body1 = await res1.json() as { log: { id: string } };

    const event2 = authedEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    const res2 = await createLog(event2 as any);
    expect(res2.status).toBe(200);

    const body2 = await res2.json() as { log: { id: string } };
    expect(body2.log.id).toBe(body1.log.id);
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = anonEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    await expect(createLog(event as any)).rejects.toMatchObject({ status: 401 });
  });

  it('returns 404 when job site does not exist', async () => {
    const event = authedEvent(ctx, { method: 'POST', params: { id: 'nonexistent-site' } });
    await expect(createLog(event as any)).rejects.toMatchObject({ status: 404 });
  });

  it('returns 403 when job site belongs to a different org', async () => {
    // Create a second org in the same DB and a site belonging to it
    const foreignOrg = await createTestOrg(ctx.db, { slug: 'foreign-org-slug' });
    const foreignSite = await createTestJobSite(ctx.db, foreignOrg.id, { name: 'Foreign Site' });

    // Our user belongs to ctx.orgId, but foreignSite belongs to foreignOrg
    const event = authedEvent(ctx, { method: 'POST', params: { id: foreignSite.id } });
    await expect(createLog(event as any)).rejects.toMatchObject({ status: 403 });
  });
});

describe('GET /api/job-sites/[id]/logs — list daily logs', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildContext();
    // Create one log
    const event = authedEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    await createLog(event as any);
  });

  afterEach(() => ctx.db.close());

  it('returns an array of logs', async () => {
    const event = authedEvent(ctx, { params: { id: ctx.siteId } });
    const res = await listLogs(event as any);
    expect(res.status).toBe(200);

    const body = await res.json() as { logs: unknown[] };
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs).toHaveLength(1);
  });

  it('respects limit param', async () => {
    const event = authedEvent(ctx, {
      params: { id: ctx.siteId },
      searchParams: { limit: '0' },
    });
    const res = await listLogs(event as any);
    const body = await res.json() as { logs: unknown[] };
    expect(body.logs).toHaveLength(0);
  });

  it('respects offset param', async () => {
    const event = authedEvent(ctx, {
      params: { id: ctx.siteId },
      searchParams: { offset: '5' },
    });
    const res = await listLogs(event as any);
    const body = await res.json() as { logs: unknown[] };
    // offset=5 on a table with 1 row returns empty
    expect(body.logs).toHaveLength(0);
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = anonEvent(ctx, { params: { id: ctx.siteId } });
    await expect(listLogs(event as any)).rejects.toMatchObject({ status: 401 });
  });
});

describe('POST /api/job-sites/[id]/logs/[logId]/entries — add entry', () => {
  let ctx: TestContext;
  let logId: string;

  beforeEach(async () => {
    ctx = await buildContext();
    const event = authedEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    const res = await createLog(event as any);
    const body = await res.json() as { log: { id: string } };
    logId = body.log.id;
  });

  afterEach(() => ctx.db.close());

  it('creates a paving entry and returns 201', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: {
        entry_type: 'paving',
        timestamp: '08:00',
        tons_placed: 150.5,
        loads_count: 12,
        distance_ft: 528,
        lane: 'mainline',
      },
    });

    const res = await createEntry(event as any);
    expect(res.status).toBe(201);

    const body = await res.json() as { entry: Record<string, unknown> };
    expect(body.entry).toBeTruthy();
    expect(body.entry.entry_type).toBe('paving');
    expect(body.entry.tons_placed).toBe(150.5);
    expect(body.entry.loads_count).toBe(12);
    expect(body.entry.distance_ft).toBe(528);
    expect(body.entry.lane).toBe('mainline');
    expect(body.entry.daily_log_id).toBe(logId);
  });

  it('auto-calculates distance_ft from station_start and station_end when distance not given', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: {
        entry_type: 'paving',
        timestamp: '09:00',
        station_start: 10,
        station_end: 15,
        tons_placed: 50,
      },
    });

    const res = await createEntry(event as any);
    const body = await res.json() as { entry: Record<string, unknown> };
    // distance = (15 - 10) * 100 = 500 ft
    expect(body.entry.distance_ft).toBe(500);
  });

  it('creates a tack entry with gallons', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: {
        entry_type: 'tack',
        timestamp: '07:30',
        tack_gallons: 200,
      },
    });

    const res = await createEntry(event as any);
    expect(res.status).toBe(201);
    const body = await res.json() as { entry: Record<string, unknown> };
    expect(body.entry.entry_type).toBe('tack');
    expect(body.entry.tack_gallons).toBe(200);
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = anonEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: { entry_type: 'note', timestamp: '10:00' },
    });
    await expect(createEntry(event as any)).rejects.toMatchObject({ status: 401 });
  });

  it('returns 404 when log does not exist', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId: 'nonexistent-log' },
      body: { entry_type: 'note', timestamp: '10:00' },
    });
    await expect(createEntry(event as any)).rejects.toMatchObject({ status: 404 });
  });
});

describe('PATCH /api/job-sites/[id]/logs/[logId]/entries/[entryId] — update entry', () => {
  let ctx: TestContext;
  let logId: string;
  let entryId: string;

  beforeEach(async () => {
    ctx = await buildContext();

    // Create log
    const logEvent = authedEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    const logRes = await createLog(logEvent as any);
    const logBody = await logRes.json() as { log: { id: string } };
    logId = logBody.log.id;

    // Create entry
    const entryEvent = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: {
        entry_type: 'paving',
        timestamp: '08:00',
        tons_placed: 100,
        loads_count: 8,
      },
    });
    const entryRes = await createEntry(entryEvent as any);
    const entryBody = await entryRes.json() as { entry: { id: string } };
    entryId = entryBody.entry.id;
  });

  afterEach(() => ctx.db.close());

  it('updates tons_placed and returns updated entry', async () => {
    const event = authedEvent(ctx, {
      method: 'PATCH',
      params: { id: ctx.siteId, logId, entryId },
      body: { tons_placed: 120.75 },
    });

    const res = await patchEntry(event as any);
    expect(res.status).toBe(200);

    const body = await res.json() as { entry: Record<string, unknown> };
    expect(body.entry.tons_placed).toBe(120.75);
    expect(body.entry.id).toBe(entryId);
  });

  it('can update notes field', async () => {
    const event = authedEvent(ctx, {
      method: 'PATCH',
      params: { id: ctx.siteId, logId, entryId },
      body: { notes: 'Adjusted for breakdown at sta 12' },
    });

    const res = await patchEntry(event as any);
    const body = await res.json() as { entry: Record<string, unknown> };
    expect(body.entry.notes).toBe('Adjusted for breakdown at sta 12');
  });

  it('returns 404 when entry does not exist', async () => {
    const event = authedEvent(ctx, {
      method: 'PATCH',
      params: { id: ctx.siteId, logId, entryId: 'nonexistent-entry' },
      body: { tons_placed: 50 },
    });
    await expect(patchEntry(event as any)).rejects.toMatchObject({ status: 404 });
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = anonEvent(ctx, {
      method: 'PATCH',
      params: { id: ctx.siteId, logId, entryId },
      body: { tons_placed: 50 },
    });
    await expect(patchEntry(event as any)).rejects.toMatchObject({ status: 401 });
  });
});

describe('POST /api/job-sites/[id]/logs/[logId]/close — close-out', () => {
  let ctx: TestContext;
  let logId: string;

  beforeEach(async () => {
    ctx = await buildContext();
    const event = authedEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    const res = await createLog(event as any);
    const body = await res.json() as { log: { id: string } };
    logId = body.log.id;
  });

  afterEach(() => ctx.db.close());

  it('closes the log and returns the updated log with foreman_name and closed_at', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: { foreman_name: 'Bob Smith' },
    });

    const res = await closeLog(event as any);
    expect(res.status).toBe(200);

    const body = await res.json() as { log: Record<string, unknown> };
    expect(body.log.foreman_name).toBe('Bob Smith');
    expect(body.log.closed_at).toBeTruthy();
    expect(typeof body.log.closed_at).toBe('number');
  });

  it('returns 400 when foreman_name is missing', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: {},
    });
    await expect(closeLog(event as any)).rejects.toMatchObject({ status: 400 });
  });

  it('returns 400 when foreman_name is empty string', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: { foreman_name: '   ' },
    });
    await expect(closeLog(event as any)).rejects.toMatchObject({ status: 400 });
  });

  it('returns 404 when log does not exist', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId: 'nonexistent-log' },
      body: { foreman_name: 'Bob' },
    });
    await expect(closeLog(event as any)).rejects.toMatchObject({ status: 404 });
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = anonEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: { foreman_name: 'Bob' },
    });
    await expect(closeLog(event as any)).rejects.toMatchObject({ status: 401 });
  });
});

describe('Cannot modify closed log (non-admin user)', () => {
  let ctx: TestContext;
  let logId: string;
  let entryId: string;

  beforeEach(async () => {
    ctx = await buildContext();

    // Create log
    const logEvent = authedEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    const logRes = await createLog(logEvent as any);
    const logBody = await logRes.json() as { log: { id: string } };
    logId = logBody.log.id;

    // Add an entry before closing
    const entryEvent = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: { entry_type: 'paving', timestamp: '08:00', tons_placed: 80 },
    });
    const entryRes = await createEntry(entryEvent as any);
    const entryBody = await entryRes.json() as { entry: { id: string } };
    entryId = entryBody.entry.id;

    // Close the log
    const closeEvent = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: { foreman_name: 'Foreman Joe' },
    });
    await closeLog(closeEvent as any);

    // Demote the user to 'member' so they can't override the lock
    await ctx.db.d1
      .prepare('UPDATE org_members SET role = ? WHERE user_id = ? AND org_id = ?')
      .bind('member', ctx.userId, ctx.orgId)
      .run();
  });

  afterEach(() => ctx.db.close());

  it('POST entries on closed log returns 423 for non-admin', async () => {
    const event = authedEvent(ctx, {
      method: 'POST',
      params: { id: ctx.siteId, logId },
      body: { entry_type: 'note', timestamp: '16:00', notes: 'Should fail' },
    });
    await expect(createEntry(event as any)).rejects.toMatchObject({ status: 423 });
  });

  it('PATCH entry on closed log returns 423 for non-admin', async () => {
    const event = authedEvent(ctx, {
      method: 'PATCH',
      params: { id: ctx.siteId, logId, entryId },
      body: { tons_placed: 999 },
    });
    await expect(patchEntry(event as any)).rejects.toMatchObject({ status: 423 });
  });
});

describe('GET /api/job-sites/[id]/logs/summary — rollup math', () => {
  let ctx: TestContext;
  let logId: string;

  beforeEach(async () => {
    ctx = await buildContext();

    // Create log
    const logEvent = authedEvent(ctx, { method: 'POST', params: { id: ctx.siteId } });
    const logRes = await createLog(logEvent as any);
    const logBody = await logRes.json() as { log: { id: string } };
    logId = logBody.log.id;

    // Add three paving entries
    const entries = [
      { entry_type: 'paving', timestamp: '07:00', tons_placed: 50, loads_count: 4, distance_ft: 200, tack_gallons: null },
      { entry_type: 'paving', timestamp: '09:00', tons_placed: 75.5, loads_count: 6, distance_ft: 300, tack_gallons: null },
      { entry_type: 'tack',   timestamp: '06:30', tons_placed: null, loads_count: null, distance_ft: null, tack_gallons: 150 },
    ];

    for (const e of entries) {
      const ev = authedEvent(ctx, {
        method: 'POST',
        params: { id: ctx.siteId, logId },
        body: e,
      });
      await createEntry(ev as any);
    }
  });

  afterEach(() => ctx.db.close());

  it('returns summary with correct rollup totals', async () => {
    const event = authedEvent(ctx, { params: { id: ctx.siteId } });
    const res = await getSummary(event as any);
    expect(res.status).toBe(200);

    const body = await res.json() as {
      summary: {
        total_tons: number;
        total_loads: number;
        total_distance_ft: number;
        total_tack_gallons: number;
        total_days: number;
      };
    };

    const s = body.summary;
    // 50 + 75.5 = 125.5 tons
    expect(s.total_tons).toBeCloseTo(125.5, 5);
    // 4 + 6 = 10 loads
    expect(s.total_loads).toBe(10);
    // 200 + 300 = 500 ft
    expect(s.total_distance_ft).toBe(500);
    // 150 gallons from tack entry
    expect(s.total_tack_gallons).toBe(150);
    // 1 day (1 log)
    expect(s.total_days).toBe(1);
  });

  it('returns zero totals for a site with no entries', async () => {
    // Different site with no entries
    const site2 = await createTestJobSite(ctx.db, ctx.orgId, { name: 'Empty Site' });
    const event = authedEvent(ctx, { params: { id: site2.id } });
    const res = await getSummary(event as any);
    const body = await res.json() as { summary: Record<string, number> };
    expect(body.summary.total_tons).toBe(0);
    expect(body.summary.total_loads).toBe(0);
    expect(body.summary.total_days).toBe(0);
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = anonEvent(ctx, { params: { id: ctx.siteId } });
    await expect(getSummary(event as any)).rejects.toMatchObject({ status: 401 });
  });
});
