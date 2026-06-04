/**
 * Integration tests for webhooks API endpoints:
 *   GET    /api/webhooks                      (list)
 *   POST   /api/webhooks                      (create)
 *   GET    /api/webhooks/[id]                 (get one)
 *   PATCH  /api/webhooks/[id]                 (update URL/events/active)
 *   DELETE /api/webhooks/[id]                 (remove)
 *   GET    /api/webhooks/[id]/deliveries      (delivery history)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../../tests/helpers/request.js';
import type { D1DatabaseCompat } from '../../../../../tests/helpers/db.js';
import type { MockRequestEvent } from '../../../../../tests/helpers/request.js';

// Import route handlers
import { GET as listWebhooks, POST as createWebhook } from '../+server.js';
import {
  GET as getWebhook,
  PATCH as updateWebhook,
  DELETE as deleteWebhook
} from '../[id]/+server.js';
import { GET as getDeliveries } from '../[id]/deliveries/+server.js';

// ── helpers ───────────────────────────────────────────────────────────────────

interface SetupOpts {
  db: D1DatabaseCompat;
  role?: 'owner' | 'admin' | 'member';
  email?: string;
  name?: string;
}

interface SetupResult {
  userId: string;
  orgId: string;
  sessionId: string;
}

async function setup(opts: SetupOpts): Promise<SetupResult> {
  const { db, role = 'owner', email = 'user@example.com', name = 'Test User' } = opts;
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 30 * 24 * 60 * 60;
  const orgSlug = email.replace(/[@.]/g, '-');

  await db
    .prepare(
      'INSERT INTO users (id, email, name, password_hash, email_verified, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(userId, email, name, 'hash', 1, 0, now)
    .run();

  await db
    .prepare('INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
    .bind(orgId, `${name} Org`, orgSlug, now)
    .run();

  await db
    .prepare(
      'INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(userId, orgId, role, now, now)
    .run();

  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, userId, expires, now)
    .run();

  return { userId, orgId, sessionId };
}

function makeEvent(
  db: D1DatabaseCompat,
  sessionId: string | null,
  opts: {
    method?: string;
    pathname?: string;
    body?: unknown;
    params?: Record<string, string>;
    searchParams?: Record<string, string>;
  } = {}
): MockRequestEvent {
  return mockRequestEvent({
    db,
    method: opts.method ?? 'GET',
    pathname: opts.pathname ?? '/',
    body: opts.body,
    params: opts.params ?? {},
    searchParams: opts.searchParams ?? {},
    cookies: sessionId ? { paverate_session: sessionId } : {}
  });
}

async function insertWebhook(
  db: D1DatabaseCompat,
  orgId: string,
  userId: string,
  overrides: Partial<{
    url: string;
    events: string[];
    description: string | null;
    is_active: number;
  }> = {}
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const url = overrides.url ?? 'https://example.com/hook';
  const events = JSON.stringify(overrides.events ?? ['job_site.created']);
  const description = overrides.description ?? null;
  const is_active = overrides.is_active ?? 1;

  await db
    .prepare(
      `INSERT INTO webhooks (id, org_id, url, secret, events, description, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, orgId, url, 'whsec_test', events, description, is_active, userId, now, now)
    .run();

  return id;
}

async function insertDelivery(
  db: D1DatabaseCompat,
  webhookId: string,
  status: 'pending' | 'delivered' | 'failed'
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(
      `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status, http_status, attempt_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, webhookId, 'job_site.created', '{}', status, status === 'delivered' ? 200 : null, 1, now)
    .run();

  return id;
}

// ── GET /api/webhooks ─────────────────────────────────────────────────────────

describe('GET /api/webhooks', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = makeEvent(db.d1, null);
    const res = await listWebhooks(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 for member role', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'member' });
    const event = makeEvent(db.d1, sessionId);
    const res = await listWebhooks(event as any);
    expect(res.status).toBe(403);
  });

  it('returns empty list when no webhooks exist', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId);
    const res = await listWebhooks(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.webhooks)).toBe(true);
    expect(data.webhooks.length).toBe(0);
  });

  it('lists webhooks for the org', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    await insertWebhook(db.d1, orgId, userId);
    await insertWebhook(db.d1, orgId, userId, { url: 'https://other.com/hook' });

    const event = makeEvent(db.d1, sessionId);
    const res = await listWebhooks(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.webhooks.length).toBe(2);
  });

  it('does not expose secret in list response', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    await insertWebhook(db.d1, orgId, userId);

    const event = makeEvent(db.d1, sessionId);
    const res = await listWebhooks(event as any);
    const data = await res.json() as any;
    for (const hook of data.webhooks) {
      expect(hook).not.toHaveProperty('secret');
    }
  });

  it('admin role can list webhooks', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'admin', email: 'admin@test.com' });
    await insertWebhook(db.d1, orgId, userId);

    const event = makeEvent(db.d1, sessionId);
    const res = await listWebhooks(event as any);
    expect(res.status).toBe(200);
  });
});

// ── POST /api/webhooks ────────────────────────────────────────────────────────

describe('POST /api/webhooks', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = makeEvent(db.d1, null, {
      method: 'POST',
      body: { url: 'https://example.com/hook', events: ['job_site.created'] }
    });
    const res = await createWebhook(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 for member role', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'member' });
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      body: { url: 'https://example.com/hook', events: ['job_site.created'] }
    });
    const res = await createWebhook(event as any);
    expect(res.status).toBe(403);
  });

  it('creates webhook and returns 201 with secret', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      body: {
        url: 'https://example.com/hook',
        events: ['job_site.created', 'daily_log.created'],
        description: 'My webhook'
      }
    });
    const res = await createWebhook(event as any);
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('secret');
    expect(data.url).toBe('https://example.com/hook');
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events).toContain('job_site.created');
    expect(data.is_active).toBe(true);
    expect(data.description).toBe('My webhook');
  });

  it('returns 400 when URL does not start with https', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      body: { url: 'http://example.com/hook', events: ['job_site.created'] }
    });
    const res = await createWebhook(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when events array is empty', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      body: { url: 'https://example.com/hook', events: [] }
    });
    const res = await createWebhook(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid event type', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      body: { url: 'https://example.com/hook', events: ['invalid.event'] }
    });
    const res = await createWebhook(event as any);
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data).toHaveProperty('valid_events');
  });

  it('creates webhook without description', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      body: { url: 'https://example.com/hook', events: ['load.logged'] }
    });
    const res = await createWebhook(event as any);
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.description).toBeNull();
  });
});

// ── GET /api/webhooks/[id] ────────────────────────────────────────────────────

describe('GET /api/webhooks/[id]', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = makeEvent(db.d1, null, { params: { id: 'any' } });
    const res = await getWebhook(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 404 for nonexistent webhook', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, { params: { id: crypto.randomUUID() } });
    const res = await getWebhook(event as any);
    expect(res.status).toBe(404);
  });

  it('returns webhook details without secret', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId, {
      description: 'Test hook'
    });

    const event = makeEvent(db.d1, sessionId, { params: { id: webhookId } });
    const res = await getWebhook(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(webhookId);
    expect(data.url).toBe('https://example.com/hook');
    expect(data).not.toHaveProperty('secret');
    expect(data.description).toBe('Test hook');
  });

  it('returns 403 when webhook belongs to a different org', async () => {
    // Create two orgs with separate users
    const { sessionId } = await setup({ db: db.d1, role: 'owner', email: 'user1@test.com' });
    const other = await setup({ db: db.d1, role: 'owner', email: 'user2@test.com' });
    const webhookId = await insertWebhook(db.d1, other.orgId, other.userId);

    const event = makeEvent(db.d1, sessionId, { params: { id: webhookId } });
    const res = await getWebhook(event as any);
    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/webhooks/[id] ──────────────────────────────────────────────────

describe('PATCH /api/webhooks/[id]', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns 403 for member role', async () => {
    const owner = await setup({ db: db.d1, role: 'owner', email: 'owner@test.com' });
    const member = await setup({ db: db.d1, role: 'member', email: 'member@test.com' });
    const webhookId = await insertWebhook(db.d1, owner.orgId, owner.userId);

    const event = makeEvent(db.d1, member.sessionId, {
      method: 'PATCH',
      params: { id: webhookId },
      body: { url: 'https://new.example.com/hook' }
    });
    const res = await updateWebhook(event as any);
    expect(res.status).toBe(403);
  });

  it('updates the URL', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);

    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: webhookId },
      body: { url: 'https://new.example.com/hook' }
    });
    const res = await updateWebhook(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.url).toBe('https://new.example.com/hook');
  });

  it('updates the events list', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);

    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: webhookId },
      body: { events: ['daily_log.created', 'load.logged'] }
    });
    const res = await updateWebhook(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.events).toContain('daily_log.created');
    expect(data.events).toContain('load.logged');
  });

  it('can deactivate a webhook', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId, { is_active: 1 });

    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: webhookId },
      body: { is_active: false }
    });
    const res = await updateWebhook(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.is_active).toBe(false);
  });

  it('returns 400 when updating URL to http', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);

    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: webhookId },
      body: { url: 'http://insecure.com/hook' }
    });
    const res = await updateWebhook(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 404 for nonexistent webhook', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: crypto.randomUUID() },
      body: { url: 'https://example.com/hook' }
    });
    const res = await updateWebhook(event as any);
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/webhooks/[id] ─────────────────────────────────────────────────

describe('DELETE /api/webhooks/[id]', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns 403 for member role', async () => {
    const owner = await setup({ db: db.d1, role: 'owner', email: 'owner@test.com' });
    const member = await setup({ db: db.d1, role: 'member', email: 'member@test.com' });
    const webhookId = await insertWebhook(db.d1, owner.orgId, owner.userId);

    const event = makeEvent(db.d1, member.sessionId, {
      method: 'DELETE',
      params: { id: webhookId }
    });
    const res = await deleteWebhook(event as any);
    expect(res.status).toBe(403);
  });

  it('deletes webhook and returns success', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);

    const event = makeEvent(db.d1, sessionId, {
      method: 'DELETE',
      params: { id: webhookId }
    });
    const res = await deleteWebhook(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
  });

  it('returns 404 after deletion (webhook gone)', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);

    // Delete it
    const del = makeEvent(db.d1, sessionId, {
      method: 'DELETE',
      params: { id: webhookId }
    });
    await deleteWebhook(del as any);

    // Try to get it again
    const get = makeEvent(db.d1, sessionId, { params: { id: webhookId } });
    const res = await getWebhook(get as any);
    expect(res.status).toBe(404);
  });

  it('returns 404 for nonexistent webhook', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, {
      method: 'DELETE',
      params: { id: crypto.randomUUID() }
    });
    const res = await deleteWebhook(event as any);
    expect(res.status).toBe(404);
  });

  it('cascade deletes webhook deliveries', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);
    await insertDelivery(db.d1, webhookId, 'delivered');
    await insertDelivery(db.d1, webhookId, 'failed');

    const event = makeEvent(db.d1, sessionId, {
      method: 'DELETE',
      params: { id: webhookId }
    });
    await deleteWebhook(event as any);

    // Verify deliveries are gone from DB
    const rows = await db.d1
      .prepare('SELECT id FROM webhook_deliveries WHERE webhook_id = ?')
      .bind(webhookId)
      .all();
    expect(rows.results.length).toBe(0);
  });
});

// ── GET /api/webhooks/[id]/deliveries ─────────────────────────────────────────

describe('GET /api/webhooks/[id]/deliveries', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = makeEvent(db.d1, null, { params: { id: 'any' } });
    const res = await getDeliveries(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 for member role', async () => {
    const owner = await setup({ db: db.d1, role: 'owner', email: 'owner@test.com' });
    const member = await setup({ db: db.d1, role: 'member', email: 'member@test.com' });
    const webhookId = await insertWebhook(db.d1, owner.orgId, owner.userId);

    const event = makeEvent(db.d1, member.sessionId, { params: { id: webhookId } });
    const res = await getDeliveries(event as any);
    expect(res.status).toBe(403);
  });

  it('returns empty deliveries list when none exist', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);

    const event = makeEvent(db.d1, sessionId, { params: { id: webhookId } });
    const res = await getDeliveries(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data.deliveries)).toBe(true);
    expect(data.deliveries.length).toBe(0);
  });

  it('lists all deliveries for the webhook', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);
    await insertDelivery(db.d1, webhookId, 'delivered');
    await insertDelivery(db.d1, webhookId, 'failed');
    await insertDelivery(db.d1, webhookId, 'pending');

    const event = makeEvent(db.d1, sessionId, { params: { id: webhookId } });
    const res = await getDeliveries(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.deliveries.length).toBe(3);
  });

  it('filters deliveries by status=delivered', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);
    await insertDelivery(db.d1, webhookId, 'delivered');
    await insertDelivery(db.d1, webhookId, 'failed');
    await insertDelivery(db.d1, webhookId, 'delivered');

    const event = makeEvent(db.d1, sessionId, {
      params: { id: webhookId },
      searchParams: { status: 'delivered' }
    });
    const res = await getDeliveries(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.deliveries.length).toBe(2);
    for (const d of data.deliveries) {
      expect(d.status).toBe('delivered');
    }
  });

  it('filters deliveries by status=failed', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);
    await insertDelivery(db.d1, webhookId, 'delivered');
    await insertDelivery(db.d1, webhookId, 'failed');

    const event = makeEvent(db.d1, sessionId, {
      params: { id: webhookId },
      searchParams: { status: 'failed' }
    });
    const res = await getDeliveries(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.deliveries.length).toBe(1);
    expect(data.deliveries[0].status).toBe('failed');
  });

  it('returns 400 for invalid status filter', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);

    const event = makeEvent(db.d1, sessionId, {
      params: { id: webhookId },
      searchParams: { status: 'invalid' }
    });
    const res = await getDeliveries(event as any);
    expect(res.status).toBe(400);
  });

  it('returns 404 for nonexistent webhook', async () => {
    const { sessionId } = await setup({ db: db.d1, role: 'owner' });
    const event = makeEvent(db.d1, sessionId, { params: { id: crypto.randomUUID() } });
    const res = await getDeliveries(event as any);
    expect(res.status).toBe(404);
  });

  it('delivery response includes expected fields', async () => {
    const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
    const webhookId = await insertWebhook(db.d1, orgId, userId);
    await insertDelivery(db.d1, webhookId, 'delivered');

    const event = makeEvent(db.d1, sessionId, { params: { id: webhookId } });
    const res = await getDeliveries(event as any);
    const data = await res.json() as any;
    const d = data.deliveries[0];
    expect(d).toHaveProperty('id');
    expect(d).toHaveProperty('event_type');
    expect(d).toHaveProperty('status');
    expect(d).toHaveProperty('http_status');
    expect(d).toHaveProperty('attempt_count');
    expect(d).toHaveProperty('created_at');
  });
});
