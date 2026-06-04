/**
 * Integration tests for loads tracking endpoints.
 *
 * Covers:
 *  - POST /api/job-sites/[id]/loads   (record a load)
 *  - POST /api/job-sites/[id]/loads/scan (ticket photo scan)
 *  - POST /api/job-sites/[id]/loads/[loadId]/reject (reject a load)
 *  - DELETE /api/job-sites/[id]/loads/[loadId]/reject (un-reject)
 *  - GET  /api/job-sites/[id]/loads   (list, date filtering)
 *  - Aggregate totals in log summary
 *  - Job-site scoping (cross-site isolation)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../../tests/helpers/request.js';
import { createTestUser } from '../../../../../tests/fixtures/users.js';
import { createTestOrg, createTestMembership } from '../../../../../tests/fixtures/orgs.js';
import { createTestJobSite } from '../../../../../tests/fixtures/job-sites.js';
import type { TestDb } from '../../../../../tests/helpers/db.js';

// Route handlers under test
import { GET, POST } from '../[id]/loads/+server.js';
import { POST as POSTScan } from '../[id]/loads/scan/+server.js';
import { POST as POSTReject, DELETE as DELETEReject } from '../[id]/loads/[loadId]/reject/+server.js';

// ── SvelteKit HttpError shim ──────────────────────────────────────────────────
// Handlers throw error(N, msg) which produces an HttpError, not a Response.
// Wrap calls to normalise both paths to a Response-like object.

interface HttpErrorLike {
  status: number;
  body?: { message?: string };
}

function isHttpError(e: unknown): e is HttpErrorLike {
  return (
    typeof e === 'object' &&
    e !== null &&
    'status' in e &&
    typeof (e as Record<string, unknown>).status === 'number'
  );
}

async function call(
  fn: (ev: unknown) => Promise<Response>,
  event: unknown
): Promise<Response> {
  try {
    return await fn(event);
  } catch (err) {
    if (isHttpError(err)) {
      return new Response(JSON.stringify(err.body ?? {}), {
        status: err.status,
        headers: { 'content-type': 'application/json' }
      });
    }
    throw err;
  }
}

// ── World setup ────────────────────────────────────────────────────────────────

interface SetupResult {
  testDb: TestDb;
  userId: string;
  orgId: string;
  jobSiteId: string;
  otherJobSiteId: string;
}

async function setupWorld(): Promise<SetupResult> {
  const testDb = createTestDb();
  const user = await createTestUser(testDb);
  const org = await createTestOrg(testDb);
  await createTestMembership(testDb, user.id, org.id, { role: 'admin' });

  const jobSite = await createTestJobSite(testDb, org.id, { name: 'Site Alpha' });
  const otherJobSite = await createTestJobSite(testDb, org.id, { name: 'Site Beta' });

  return {
    testDb,
    userId: user.id,
    orgId: org.id,
    jobSiteId: jobSite.id,
    otherJobSiteId: otherJobSite.id
  };
}

/** Build an authenticated mock event for the world user. */
async function makeEvent(
  world: SetupResult,
  opts: {
    method?: string;
    pathname?: string;
    params?: Record<string, string>;
    body?: unknown;
    formData?: FormData;
  }
) {
  const { testDb, userId } = world;

  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await testDb.d1
    .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, userId, now + 86400, now)
    .run();

  const event = mockRequestEvent({
    db: testDb.d1,
    method: opts.method ?? 'POST',
    pathname: opts.pathname ?? '/',
    params: opts.params ?? {},
    body: opts.formData ? undefined : opts.body,
    cookies: { paverate_session: sessionId }
  });

  // Populate locals.user as SvelteKit hooks would
  // The handlers in loads/+server.ts and reject/+server.ts check locals.user directly
  const userRow = await testDb.d1
    .prepare('SELECT id, email, name FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; email: string; name: string }>();
  if (userRow) {
    (event as Record<string, unknown>).locals = {
      user: { id: userRow.id, email: userRow.email, name: userRow.name }
    };
  }

  if (opts.formData) {
    const url = new URL(opts.pathname ?? '/', 'http://localhost:5173');
    const req = new Request(url, { method: opts.method ?? 'POST', body: opts.formData });
    (event as Record<string, unknown>).request = req;
  }

  return event;
}

// ── POST /api/job-sites/[id]/loads ────────────────────────────────────────────

describe('POST /api/job-sites/[id]/loads — record a load', () => {
  let world: SetupResult;
  beforeEach(async () => { world = await setupWorld(); });

  it('returns 401 when not authenticated', async () => {
    const testDb = createTestDb();
    const event = mockRequestEvent({
      db: testDb.d1,
      method: 'POST',
      params: { id: 'any-site' },
      body: { tons: 25 }
    });
    const res = await call(POST, event);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown job site', async () => {
    const event = await makeEvent(world, {
      params: { id: 'nonexistent' },
      body: { tons: 25 }
    });
    const res = await call(POST, event);
    expect(res.status).toBe(404);
  });

  it('returns 400 when tons is missing', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: {}
    });
    const res = await call(POST, event);
    expect(res.status).toBe(400);
  });

  it('returns 400 when tons is zero or negative', async () => {
    for (const tons of [0, -5]) {
      const event = await makeEvent(world, {
        params: { id: world.jobSiteId },
        body: { tons }
      });
      const res = await call(POST, event);
      expect(res.status).toBe(400);
    }
  });

  it('returns 400 when lane_number is not a positive integer', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: { tons: 10, lane_number: 1.5 }
    });
    const res = await call(POST, event);
    expect(res.status).toBe(400);
  });

  it('returns 400 when pass_number is not a positive integer', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: { tons: 10, pass_number: -1 }
    });
    const res = await call(POST, event);
    expect(res.status).toBe(400);
  });

  it('creates a load and returns 201 with load data', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: {
        tons: 22.5,
        ticket_number: 'TKT-001',
        lane_number: 1,
        pass_number: 2,
        spread_rate: 165,
        notes: 'First load of the day'
      }
    });
    const res = await call(POST, event);
    expect(res.status).toBe(201);

    const body = await res.json() as { load: Record<string, unknown> };
    expect(body.load).toBeTruthy();
    expect(body.load.tons).toBe(22.5);
    expect(body.load.ticket_number).toBe('TKT-001');
    expect(body.load.lane_number).toBe(1);
    expect(body.load.pass_number).toBe(2);
    expect(body.load.spread_rate).toBe(165);
    expect(body.load.notes).toBe('First load of the day');
    expect(body.load.job_site_id).toBe(world.jobSiteId);
    expect(body.load.rejected).toBe(0);
    expect(typeof body.load.id).toBe('string');
  });

  it('uses the provided timestamp when given', async () => {
    const customTs = Math.floor(Date.now() / 1000) - 3600;
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: { tons: 10, timestamp: customTs }
    });
    const res = await call(POST, event);
    expect(res.status).toBe(201);
    const body = await res.json() as { load: { timestamp: number } };
    expect(body.load.timestamp).toBe(customTs);
  });

  it('records load with null optional fields when omitted', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: { tons: 15 }
    });
    const res = await call(POST, event);
    expect(res.status).toBe(201);
    const body = await res.json() as { load: Record<string, unknown> };
    expect(body.load.ticket_number).toBeNull();
    expect(body.load.lane_number).toBeNull();
    expect(body.load.pass_number).toBeNull();
    expect(body.load.spread_rate).toBeNull();
    expect(body.load.notes).toBeNull();
  });
});

// ── GET /api/job-sites/[id]/loads ─────────────────────────────────────────────

describe('GET /api/job-sites/[id]/loads — list loads', () => {
  let world: SetupResult;
  beforeEach(async () => { world = await setupWorld(); });

  it('returns 401 when not authenticated', async () => {
    const testDb = createTestDb();
    const event = mockRequestEvent({ db: testDb.d1, method: 'GET', params: { id: 'x' } });
    const res = await call(GET, event);
    expect(res.status).toBe(401);
  });

  it('returns empty array when no loads exist', async () => {
    const event = await makeEvent(world, {
      method: 'GET',
      params: { id: world.jobSiteId }
    });
    const res = await call(GET, event);
    expect(res.status).toBe(200);
    const body = await res.json() as { loads: unknown[] };
    expect(body.loads).toEqual([]);
  });

  it('returns only loads for the requested job site', async () => {
    for (const siteId of [world.jobSiteId, world.otherJobSiteId]) {
      const ev = await makeEvent(world, {
        params: { id: siteId },
        body: { tons: 10 }
      });
      await call(POST, ev);
    }

    const event = await makeEvent(world, {
      method: 'GET',
      params: { id: world.jobSiteId }
    });
    const res = await call(GET, event);
    const body = await res.json() as { loads: Array<{ job_site_id: string }> };
    expect(body.loads.length).toBe(1);
    expect(body.loads[0].job_site_id).toBe(world.jobSiteId);
  });

  it('lists multiple loads in ascending timestamp order', async () => {
    const baseTs = Math.floor(Date.now() / 1000) - 10000;
    for (let i = 0; i < 3; i++) {
      const ev = await makeEvent(world, {
        params: { id: world.jobSiteId },
        body: { tons: 5 + i, timestamp: baseTs + i * 100 }
      });
      await call(POST, ev);
    }

    const listEvent = await makeEvent(world, {
      method: 'GET',
      params: { id: world.jobSiteId }
    });
    const res = await call(GET, listEvent);
    const body = await res.json() as { loads: Array<{ tons: number }> };
    expect(body.loads.length).toBe(3);
    expect(body.loads[0].tons).toBe(5);
    expect(body.loads[1].tons).toBe(6);
    expect(body.loads[2].tons).toBe(7);
  });
});

// ── POST /api/job-sites/[id]/loads/scan ───────────────────────────────────────

describe('POST /api/job-sites/[id]/loads/scan — ticket photo scan', () => {
  let world: SetupResult;
  beforeEach(async () => { world = await setupWorld(); });

  it('returns 400 when no photo is attached', async () => {
    const fd = new FormData();
    const event = await makeEvent(world, {
      method: 'POST',
      pathname: `/api/job-sites/${world.jobSiteId}/loads/scan`,
      params: { id: world.jobSiteId },
      formData: fd
    });
    const res = await call(POSTScan, event);
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown job site', async () => {
    const fd = new FormData();
    fd.append('photo', new File(['fake'], 'ticket.jpg', { type: 'image/jpeg' }));
    const event = await makeEvent(world, {
      method: 'POST',
      pathname: '/api/job-sites/no-such-site/loads/scan',
      params: { id: 'no-such-site' },
      formData: fd
    });
    const res = await call(POSTScan, event);
    expect(res.status).toBe(404);
  });

  it('uploads photo and returns photo_id with null ocr_fields', async () => {
    const fd = new FormData();
    fd.append('photo', new File(['fake image data'], 'ticket.jpg', { type: 'image/jpeg' }));
    const event = await makeEvent(world, {
      method: 'POST',
      pathname: `/api/job-sites/${world.jobSiteId}/loads/scan`,
      params: { id: world.jobSiteId },
      formData: fd
    });
    const res = await call(POSTScan, event);
    expect(res.status).toBe(200);
    const body = await res.json() as { photo_id: string; ocr_fields: null };
    expect(typeof body.photo_id).toBe('string');
    expect(body.ocr_fields).toBeNull();
  });
});

// ── POST /api/job-sites/[id]/loads/[loadId]/reject ───────────────────────────

describe('POST /api/job-sites/[id]/loads/[loadId]/reject — reject a load', () => {
  let world: SetupResult;
  let loadId: string;

  beforeEach(async () => {
    world = await setupWorld();
    const ev = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: { tons: 20, ticket_number: 'TKT-REJECT' }
    });
    const res = await call(POST, ev);
    const body = await res.json() as { load: { id: string } };
    loadId = body.load.id;
  });

  it('returns 401 when not authenticated', async () => {
    const testDb = createTestDb();
    const event = mockRequestEvent({
      db: testDb.d1,
      method: 'POST',
      params: { id: 'site', loadId: 'load' },
      body: { reason: 'temp_too_low' }
    });
    const res = await call(POSTReject, event);
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown load id', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId, loadId: 'nonexistent-load' },
      body: { reason: 'wrong_mix' }
    });
    const res = await call(POSTReject, event);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid rejection reason', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId, loadId },
      body: { reason: 'made_up_reason' }
    });
    const res = await call(POSTReject, event);
    expect(res.status).toBe(400);
  });

  it('returns 400 when reason is missing', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId, loadId },
      body: {}
    });
    const res = await call(POSTReject, event);
    expect(res.status).toBe(400);
  });

  it('rejects a load and marks it rejected = 1', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId, loadId },
      body: { reason: 'temp_too_low', notes: 'Mix temp was 230F, below spec' }
    });
    const res = await call(POSTReject, event);
    expect(res.status).toBe(200);

    const body = await res.json() as { load: Record<string, unknown> };
    expect(body.load.rejected).toBe(1);
    expect(body.load.rejection_reason).toBe('temp_too_low');
    expect(body.load.rejection_notes).toBe('Mix temp was 230F, below spec');
  });

  it('accepts all valid rejection reasons', async () => {
    const reasons = [
      'temp_too_low', 'temp_too_high', 'wrong_mix', 'contaminated',
      'overloaded', 'underweight', 'damaged_in_transit', 'other'
    ];

    for (const reason of reasons) {
      const createEv = await makeEvent(world, {
        params: { id: world.jobSiteId },
        body: { tons: 5 }
      });
      const createRes = await call(POST, createEv);
      const { load } = await createRes.json() as { load: { id: string } };

      const rejectEv = await makeEvent(world, {
        params: { id: world.jobSiteId, loadId: load.id },
        body: { reason }
      });
      const rejectRes = await call(POSTReject, rejectEv);
      expect(rejectRes.status).toBe(200);
    }
  });

  it('rejects load with null notes when notes omitted', async () => {
    const event = await makeEvent(world, {
      params: { id: world.jobSiteId, loadId },
      body: { reason: 'other' }
    });
    const res = await call(POSTReject, event);
    const body = await res.json() as { load: { rejection_notes: null } };
    expect(body.load.rejection_notes).toBeNull();
  });
});

// ── DELETE /api/job-sites/[id]/loads/[loadId]/reject — un-reject ──────────────

describe('DELETE /api/job-sites/[id]/loads/[loadId]/reject — un-reject a load', () => {
  let world: SetupResult;
  let loadId: string;

  beforeEach(async () => {
    world = await setupWorld();

    const createEv = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: { tons: 18 }
    });
    const createRes = await call(POST, createEv);
    const { load } = await createRes.json() as { load: { id: string } };
    loadId = load.id;

    const rejectEv = await makeEvent(world, {
      params: { id: world.jobSiteId, loadId },
      body: { reason: 'contaminated' }
    });
    await call(POSTReject, rejectEv);
  });

  it('clears rejection and sets rejected = 0', async () => {
    const event = await makeEvent(world, {
      method: 'DELETE',
      params: { id: world.jobSiteId, loadId }
    });
    const res = await call(DELETEReject, event);
    expect(res.status).toBe(200);

    const body = await res.json() as { load: Record<string, unknown> };
    expect(body.load.rejected).toBe(0);
    expect(body.load.rejection_reason).toBeNull();
    expect(body.load.rejection_notes).toBeNull();
  });
});

// ── Job-site scoping ──────────────────────────────────────────────────────────

describe('loads are job-site scoped', () => {
  let world: SetupResult;
  beforeEach(async () => { world = await setupWorld(); });

  it('cannot reject a load that belongs to a different job site', async () => {
    const createEv = await makeEvent(world, {
      params: { id: world.jobSiteId },
      body: { tons: 12 }
    });
    const createRes = await call(POST, createEv);
    const { load } = await createRes.json() as { load: { id: string } };

    const rejectEv = await makeEvent(world, {
      params: { id: world.otherJobSiteId, loadId: load.id },
      body: { reason: 'wrong_mix' }
    });
    const res = await call(POSTReject, rejectEv);
    expect([403, 404]).toContain(res.status);
  });

  it('loads from site A do not appear in site B list', async () => {
    for (let i = 0; i < 3; i++) {
      const ev = await makeEvent(world, {
        params: { id: world.jobSiteId },
        body: { tons: 10 }
      });
      await call(POST, ev);
    }

    const listEv = await makeEvent(world, {
      method: 'GET',
      params: { id: world.otherJobSiteId }
    });
    const res = await call(GET, listEv);
    const body = await res.json() as { loads: unknown[] };
    expect(body.loads).toHaveLength(0);
  });
});

// ── Totals aggregate in project summary ───────────────────────────────────────

describe('totals aggregate correctly in log summary', () => {
  let world: SetupResult;
  beforeEach(async () => { world = await setupWorld(); });

  it('project summary total_loads counts log entry loads_count totals', async () => {
    const { testDb, userId, jobSiteId } = world;
    const logId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await testDb.d1
      .prepare(
        'INSERT INTO daily_logs (id, job_site_id, log_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(logId, jobSiteId, '2025-06-01', userId, now, now)
      .run();

    // Two paving entries: 12 loads + 8 loads = 20 total
    for (const loads_count of [12, 8]) {
      const entryId = crypto.randomUUID();
      await testDb.d1
        .prepare(
          `INSERT INTO log_entries
            (id, daily_log_id, entry_type, timestamp, loads_count, tons_placed, created_at)
           VALUES (?, ?, 'paving', '08:00', ?, ?, ?)`
        )
        .bind(entryId, logId, loads_count, loads_count * 20, now)
        .run();
    }

    const { DbLogHelper } = await import('$lib/server/db-logs.js');
    const logHelper = new DbLogHelper(testDb.d1 as unknown as D1Database);
    const summary = await logHelper.getProjectSummary(jobSiteId);

    expect(summary.total_loads).toBe(20);
    expect(summary.total_tons).toBe(12 * 20 + 8 * 20);
    expect(summary.total_days).toBe(1);
  });

  it('project summary aggregates across multiple daily logs', async () => {
    const { testDb, userId, jobSiteId } = world;
    const now = Math.floor(Date.now() / 1000);

    for (let day = 1; day <= 3; day++) {
      const logId = crypto.randomUUID();
      await testDb.d1
        .prepare(
          'INSERT INTO daily_logs (id, job_site_id, log_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(logId, jobSiteId, `2025-06-0${day}`, userId, now, now)
        .run();

      const entryId = crypto.randomUUID();
      await testDb.d1
        .prepare(
          `INSERT INTO log_entries
            (id, daily_log_id, entry_type, timestamp, loads_count, tons_placed, created_at)
           VALUES (?, ?, 'paving', '09:00', 10, 200, ?)`
        )
        .bind(entryId, logId, now)
        .run();
    }

    const { DbLogHelper } = await import('$lib/server/db-logs.js');
    const logHelper = new DbLogHelper(testDb.d1 as unknown as D1Database);
    const summary = await logHelper.getProjectSummary(jobSiteId);

    expect(summary.total_loads).toBe(30);
    expect(summary.total_tons).toBe(600);
    expect(summary.total_days).toBe(3);
  });

  it('project summary returns zeros for a site with no logs', async () => {
    const { testDb, otherJobSiteId } = world;
    const { DbLogHelper } = await import('$lib/server/db-logs.js');
    const logHelper = new DbLogHelper(testDb.d1 as unknown as D1Database);
    const summary = await logHelper.getProjectSummary(otherJobSiteId);

    expect(summary.total_loads).toBe(0);
    expect(summary.total_tons).toBe(0);
    expect(summary.total_days).toBe(0);
  });
});
