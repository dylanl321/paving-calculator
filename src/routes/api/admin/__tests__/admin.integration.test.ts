/**
 * Integration tests for admin API endpoints:
 *   GET  /api/admin/users         (list all users)
 *   GET  /api/admin/users/[id]    (get user details)
 *   PATCH /api/admin/users/[id]   (update user)
 *   POST /api/admin/users/[id]/verify-email  (force verify / unverify)
 *   GET  /api/admin/orgs          (list all orgs)
 *   GET  /api/admin/audit         (audit log)
 *
 * CRITICAL: Every admin endpoint MUST return 403 for non-admin users.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../../tests/helpers/request.js';
import type { D1DatabaseCompat } from '../../../../../tests/helpers/db.js';
import type { MockRequestEvent } from '../../../../../tests/helpers/request.js';

// Import admin handlers
import { GET as getUsersHandler, POST as postUserHandler } from '../users/+server.js';
import { GET as getUserHandler, PATCH as patchUserHandler } from '../users/[id]/+server.js';
import { POST as verifyEmailHandler } from '../users/[id]/verify-email/+server.js';
import { GET as getOrgsHandler } from '../orgs/+server.js';
import { GET as getAuditHandler } from '../audit/+server.js';

// Mock email senders
vi.mock('$lib/server/email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue({ ok: true }),
  buildOrgBranding: vi.fn().mockReturnValue({})
}));

vi.mock('$lib/server/email-template-senders', () => ({
  sendVerificationEmailTemplated: vi.fn().mockResolvedValue({ ok: true, status: 'sent' }),
  sendPasswordResetEmailTemplated: vi.fn().mockResolvedValue({ ok: true, status: 'sent' })
}));

// Mock audit logging
vi.mock('$lib/server/audit', () => ({
  recordAudit: vi.fn().mockResolvedValue(undefined)
}));

// ── helpers ───────────────────────────────────────────────────────────────────

interface SetupOpts {
  db: D1DatabaseCompat;
  isAdmin?: boolean;
  email?: string;
  name?: string;
}

interface SetupResult {
  userId: string;
  orgId: string;
  sessionId: string;
  event: MockRequestEvent;
}

async function setup(opts: SetupOpts): Promise<SetupResult> {
  const {
    db,
    isAdmin = false,
    email = 'user@example.com',
    name = 'Test User'
  } = opts;

  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 30 * 24 * 60 * 60;
  const orgSlug = email.split('@')[0] ?? 'test-org';

  await db
    .prepare(
      'INSERT INTO users (id, email, name, password_hash, email_verified, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(userId, email, name, 'hash', 1, isAdmin ? 1 : 0, now)
    .run();

  await db
    .prepare('INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
    .bind(orgId, `${name} Org`, orgSlug, now)
    .run();

  await db
    .prepare(
      'INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(userId, orgId, 'owner', now, now)
    .run();

  await db
    .prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, userId, expiresAt, now)
    .run();

  const event = mockRequestEvent({
    db,
    method: 'GET',
    pathname: '/',
    cookies: { paverate_session: sessionId }
  });

  return { userId, orgId, sessionId, event };
}

function makeEvent(
  db: D1DatabaseCompat,
  sessionId: string,
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
    cookies: { paverate_session: sessionId }
  });
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = mockRequestEvent({ db: db.d1 });
    const res = await getUsersHandler(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: false });
    const event = makeEvent(db.d1, sessionId);
    const res = await getUsersHandler(event as any);
    expect(res.status).toBe(403);
  });

  it('returns users list for global admin', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: true, email: 'admin@example.com' });
    const event = makeEvent(db.d1, sessionId);
    const res = await getUsersHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty('users');
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.users.length).toBeGreaterThan(0);
  });

  it('does not expose password_hash in users list', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: true, email: 'admin@example.com' });
    const event = makeEvent(db.d1, sessionId);
    const res = await getUsersHandler(event as any);
    const data = await res.json() as any;
    for (const user of data.users) {
      expect(user).not.toHaveProperty('password_hash');
    }
  });

  it('returns multiple users when several exist', async () => {
    const { sessionId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });
    // Add a second non-admin user
    const now = Math.floor(Date.now() / 1000);
    const uid2 = crypto.randomUUID();
    await db.d1
      .prepare(
        'INSERT INTO users (id, email, name, password_hash, email_verified, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(uid2, 'bob@example.com', 'Bob', 'hash', 0, 0, now)
      .run();

    const event = makeEvent(db.d1, sessionId);
    const res = await getUsersHandler(event as any);
    const data = await res.json() as any;
    expect(data.users.length).toBeGreaterThanOrEqual(2);
  });
});

// ── GET /api/admin/users/[id] ─────────────────────────────────────────────────

describe('GET /api/admin/users/[id]', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin user', async () => {
    const { sessionId, userId } = await setup({ db: db.d1, isAdmin: false });
    const event = makeEvent(db.d1, sessionId, { params: { id: userId } });
    const res = await getUserHandler(event as any);
    expect(res.status).toBe(403);
  });

  it('returns user details with memberships for admin', async () => {
    const { sessionId, userId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com'
    });
    const event = makeEvent(db.d1, sessionId, { params: { id: userId } });
    const res = await getUserHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty('user');
    expect(data).toHaveProperty('memberships');
    expect(data).toHaveProperty('sessions');
    expect(data).toHaveProperty('activeSessionCount');
    expect(data.user.id).toBe(userId);
    expect(data.user).not.toHaveProperty('password_hash');
  });

  it('returns 404 for nonexistent user', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: true, email: 'admin@example.com' });
    const fakeId = crypto.randomUUID();
    const event = makeEvent(db.d1, sessionId, { params: { id: fakeId } });
    const res = await getUserHandler(event as any);
    expect(res.status).toBe(404);
  });

  it('includes org memberships in user details', async () => {
    const { sessionId, userId, orgId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });
    const event = makeEvent(db.d1, sessionId, { params: { id: userId } });
    const res = await getUserHandler(event as any);
    const data = await res.json() as any;
    expect(Array.isArray(data.memberships)).toBe(true);
    const membership = data.memberships.find((m: any) => m.org_id === orgId);
    expect(membership).toBeDefined();
  });
});

// ── PATCH /api/admin/users/[id] ───────────────────────────────────────────────

describe('PATCH /api/admin/users/[id]', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin user', async () => {
    const { sessionId, userId } = await setup({ db: db.d1, isAdmin: false });
    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: userId },
      body: { name: 'New Name' }
    });
    const res = await patchUserHandler(event as any);
    expect(res.status).toBe(403);
  });

  it('updates user name successfully', async () => {
    const { sessionId, userId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com'
    });
    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: userId },
      body: { name: 'Updated Name' }
    });
    const res = await patchUserHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user.name).toBe('Updated Name');
  });

  it('can disable a user', async () => {
    // Create a second user to disable (not the admin themselves)
    const { sessionId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });
    const now = Math.floor(Date.now() / 1000);
    const targetId = crypto.randomUUID();
    await db.d1
      .prepare(
        'INSERT INTO users (id, email, name, password_hash, email_verified, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(targetId, 'target@example.com', 'Target', 'hash', 1, 0, now)
      .run();

    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: targetId },
      body: { disabled: true }
    });
    const res = await patchUserHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user.disabled).toBe(1);
  });

  it('returns 400 when no valid updates provided', async () => {
    const { sessionId, userId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com'
    });
    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: userId },
      body: {}
    });
    const res = await patchUserHandler(event as any);
    expect(res.status).toBe(400);
  });

  it('can promote user to global admin', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { sessionId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });
    const targetId = crypto.randomUUID();
    await db.d1
      .prepare(
        'INSERT INTO users (id, email, name, password_hash, email_verified, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(targetId, 'promote@example.com', 'PromoteMe', 'hash', 1, 0, now)
      .run();

    const event = makeEvent(db.d1, sessionId, {
      method: 'PATCH',
      params: { id: targetId },
      body: { is_global_admin: true }
    });
    const res = await patchUserHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user.is_global_admin).toBeTruthy();
  });
});

// ── POST /api/admin/users/[id]/verify-email ───────────────────────────────────

describe('POST /api/admin/users/[id]/verify-email', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('returns 403 for non-admin user', async () => {
    const { sessionId, userId } = await setup({ db: db.d1, isAdmin: false });
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      params: { id: userId },
      body: { action: 'force_verify' }
    });
    const res = await verifyEmailHandler(event as any);
    expect(res.status).toBe(403);
  });

  it('force_verify sets email_verified to true', async () => {
    // Create target user with unverified email
    const now = Math.floor(Date.now() / 1000);
    const { sessionId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });
    const targetId = crypto.randomUUID();
    await db.d1
      .prepare(
        'INSERT INTO users (id, email, name, password_hash, email_verified, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(targetId, 'unverified@example.com', 'Unverified', 'hash', 0, 0, now)
      .run();

    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      params: { id: targetId },
      body: { action: 'force_verify' }
    });
    const res = await verifyEmailHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.email_verified).toBe(true);
  });

  it('unverify sets email_verified to false', async () => {
    const now = Math.floor(Date.now() / 1000);
    const { sessionId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });
    const targetId = crypto.randomUUID();
    await db.d1
      .prepare(
        'INSERT INTO users (id, email, name, password_hash, email_verified, is_global_admin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(targetId, 'verified@example.com', 'Verified', 'hash', 1, 0, now)
      .run();

    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      params: { id: targetId },
      body: { action: 'unverify' }
    });
    const res = await verifyEmailHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.email_verified).toBe(false);
  });

  it('returns 404 for nonexistent user', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: true, email: 'admin@example.com' });
    const fakeId = crypto.randomUUID();
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      params: { id: fakeId },
      body: { action: 'force_verify' }
    });
    const res = await verifyEmailHandler(event as any);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid action', async () => {
    const { sessionId, userId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com'
    });
    const event = makeEvent(db.d1, sessionId, {
      method: 'POST',
      params: { id: userId },
      body: { action: 'bad_action' }
    });
    const res = await verifyEmailHandler(event as any);
    expect(res.status).toBe(400);
  });
});

// ── GET /api/admin/orgs ───────────────────────────────────────────────────────

describe('GET /api/admin/orgs', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = mockRequestEvent({ db: db.d1 });
    const res = await getOrgsHandler(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: false });
    const event = makeEvent(db.d1, sessionId);
    const res = await getOrgsHandler(event as any);
    expect(res.status).toBe(403);
  });

  it('returns all orgs for global admin', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: true, email: 'admin@example.com' });
    const event = makeEvent(db.d1, sessionId);
    const res = await getOrgsHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty('orgs');
    expect(Array.isArray(data.orgs)).toBe(true);
    expect(data.orgs.length).toBeGreaterThan(0);
  });

  it('returns multiple orgs when several exist', async () => {
    const { sessionId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });
    const now = Math.floor(Date.now() / 1000);
    const orgId2 = crypto.randomUUID();
    await db.d1
      .prepare('INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
      .bind(orgId2, 'Another Corp', 'another-corp', now)
      .run();

    const event = makeEvent(db.d1, sessionId);
    const res = await getOrgsHandler(event as any);
    const data = await res.json() as any;
    expect(data.orgs.length).toBeGreaterThanOrEqual(2);
  });
});

// ── GET /api/admin/audit ──────────────────────────────────────────────────────

describe('GET /api/admin/audit', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    vi.clearAllMocks();
  });

  it('returns 401 for unauthenticated request', async () => {
    const event = mockRequestEvent({ db: db.d1 });
    const res = await getAuditHandler(event as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: false });
    const event = makeEvent(db.d1, sessionId);
    const res = await getAuditHandler(event as any);
    expect(res.status).toBe(403);
  });

  it('returns empty events array for global admin with clean db', async () => {
    const { sessionId } = await setup({ db: db.d1, isAdmin: true, email: 'admin@example.com' });
    const event = makeEvent(db.d1, sessionId, { pathname: '/api/admin/audit' });
    const res = await getAuditHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty('events');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.events)).toBe(true);
  });

  it('returns audit events when they exist', async () => {
    const { sessionId, userId, orgId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });

    const now = Math.floor(Date.now() / 1000);
    const auditId = crypto.randomUUID();
    await db.d1
      .prepare(
        'INSERT INTO admin_audit_log (id, user_id, org_id, event_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(auditId, userId, orgId, 'user.updated', JSON.stringify({ name: 'New Name' }), now)
      .run();

    const event = makeEvent(db.d1, sessionId, { pathname: '/api/admin/audit' });
    const res = await getAuditHandler(event as any);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.total).toBeGreaterThanOrEqual(1);
    expect(data.events.length).toBeGreaterThanOrEqual(1);
  });

  it('supports filtering by user_id', async () => {
    const { sessionId, userId, orgId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });

    const now = Math.floor(Date.now() / 1000);
    const otherId = crypto.randomUUID();

    // Insert audit log for admin user
    await db.d1
      .prepare(
        'INSERT INTO admin_audit_log (id, user_id, org_id, event_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(crypto.randomUUID(), userId, orgId, 'user.updated', '{}', now)
      .run();

    // Insert audit log for a different user
    await db.d1
      .prepare(
        'INSERT INTO admin_audit_log (id, user_id, org_id, event_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(crypto.randomUUID(), otherId, orgId, 'user.created', '{}', now)
      .run();

    const event = makeEvent(db.d1, sessionId, {
      pathname: '/api/admin/audit',
      searchParams: { user_id: userId }
    });
    const res = await getAuditHandler(event as any);
    const data = await res.json() as any;
    expect(data.events.every((e: any) => e.user_id === userId)).toBe(true);
  });

  it('supports limit/offset pagination', async () => {
    const { sessionId, userId, orgId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });

    const now = Math.floor(Date.now() / 1000);
    // Insert 5 audit events
    for (let i = 0; i < 5; i++) {
      await db.d1
        .prepare(
          'INSERT INTO admin_audit_log (id, user_id, org_id, event_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind(crypto.randomUUID(), userId, orgId, 'user.updated', '{}', now + i)
        .run();
    }

    const event = makeEvent(db.d1, sessionId, {
      pathname: '/api/admin/audit',
      searchParams: { limit: '2', offset: '0' }
    });
    const res = await getAuditHandler(event as any);
    const data = await res.json() as any;
    expect(data.events.length).toBeLessThanOrEqual(2);
    expect(data.total).toBeGreaterThanOrEqual(5);
  });

  it('parses metadata as JSON object not string', async () => {
    const { sessionId, userId, orgId } = await setup({
      db: db.d1,
      isAdmin: true,
      email: 'admin@example.com',
      name: 'Admin'
    });

    const now = Math.floor(Date.now() / 1000);
    await db.d1
      .prepare(
        'INSERT INTO admin_audit_log (id, user_id, org_id, event_type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(crypto.randomUUID(), userId, orgId, 'user.updated', JSON.stringify({ key: 'value' }), now)
      .run();

    const event = makeEvent(db.d1, sessionId, { pathname: '/api/admin/audit' });
    const res = await getAuditHandler(event as any);
    const data = await res.json() as any;
    const evt = data.events.find((e: any) => e.event_type === 'user.updated');
    expect(evt).toBeDefined();
    expect(typeof evt.metadata).toBe('object');
    expect(evt.metadata.key).toBe('value');
  });
});
