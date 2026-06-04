/**
 * src/routes/api/calculations/__tests__/calculations.integration.test.ts
 *
 * Integration tests for the calculations history API routes.
 * Uses the in-memory D1-compatible SQLite test DB.
 *
 * Covers:
 *   POST   /api/calculations          - save calc (validation, cross-org)
 *   GET    /api/calculations          - list (pagination, job_site_id filter, role-based)
 *   GET    /api/calculations/[id]     - single (found, 404, cross-org 403)
 *   DELETE /api/calculations/[id]     - remove (found, 404, cross-org 403, verify gone)
 *   Org scoping                       - user A cannot see/delete user B org's calcs
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../../tests/helpers/request.js';
import { createTestUser } from '../../../../../tests/fixtures/users.js';
import { createTestOrg, createTestMembership } from '../../../../../tests/fixtures/orgs.js';
import { createTestJobSite } from '../../../../../tests/fixtures/job-sites.js';
import type { TestDb } from '../../../../../tests/helpers/db.js';

import { GET as listCalculations, POST as createCalculation } from '../+server.js';
import { GET as getCalculation, DELETE as deleteCalculation } from '../[id]/+server.js';

// ── helpers ────────────────────────────────────────────────────────────────────

async function seedUserWithOrg(
	db: TestDb,
	overrides: { email?: string; name?: string; role?: string } = {}
): Promise<{ userId: string; orgId: string; sessionId: string }> {
	const email = overrides.email ?? `user-${crypto.randomUUID().slice(0, 8)}@test.example.com`;
	const name = overrides.name ?? 'Test User';
	const role = overrides.role ?? 'admin';

	const user = await createTestUser(db, { email, name });
	const org = await createTestOrg(db);
	await createTestMembership(db, user.id, org.id, { role: role as any });

	const sessionId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + 30 * 24 * 60 * 60;
	await db.d1
		.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
		.bind(sessionId, user.id, expiresAt, now)
		.run();

	return { userId: user.id, orgId: org.id, sessionId };
}

function authedEvent(
	db: TestDb,
	sessionId: string,
	overrides: {
		method?: string;
		pathname?: string;
		body?: unknown;
		params?: Record<string, string>;
		searchParams?: Record<string, string>;
	} = {}
) {
	return mockRequestEvent({
		db: db.d1,
		method: overrides.method ?? 'GET',
		pathname: overrides.pathname ?? '/',
		body: overrides.body,
		params: overrides.params,
		searchParams: overrides.searchParams,
		cookies: { paverate_session: sessionId }
	});
}

function unauthEvent(db: TestDb, overrides: { method?: string; params?: Record<string, string> } = {}) {
	return mockRequestEvent({
		db: db.d1,
		method: overrides.method ?? 'GET',
		pathname: '/',
		params: overrides.params
	});
}

const VALID_BODY = {
	calc_type: 'tonnage' as const,
	inputs: { thickness: 2, width: 12, length: 100, density: 145 },
	result: { tons: 13.1, truckLoads: 1 }
};

// ── POST /api/calculations ─────────────────────────────────────────────────────

describe('POST /api/calculations', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it('saves a calculation successfully', async () => {
		const { userId, orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const body = { ...VALID_BODY, job_site_id: site.id };

		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.id).toBeTruthy();
		expect(data.job_site_id).toBe(site.id);
		expect(data.user_id).toBe(userId);
		expect(data.calc_type).toBe('tonnage');
		expect(data.inputs).toMatchObject({ thickness: 2 });
		expect(data.result).toMatchObject({ tons: 13.1 });
		expect(data.created_at).toBeGreaterThan(0);
	});

	it('saves a calculation with optional notes', async () => {
		const { orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const body = { ...VALID_BODY, job_site_id: site.id, notes: 'South lane pass 1' };

		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.notes).toBe('South lane pass 1');
	});

	it('accepts all valid calc_types', async () => {
		const { orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const validTypes = ['spread_rate', 'feet_left', 'tonnage', 'tack_rate', 'stick_check'] as const;

		for (const calcType of validTypes) {
			const body = { ...VALID_BODY, calc_type: calcType, job_site_id: site.id };
			const event = authedEvent(db, sessionId, { method: 'POST', body });
			const res = await createCalculation(event as any);
			expect(res.status).toBe(200);
		}
	});

	it('returns 400 when job_site_id is missing', async () => {
		const { sessionId } = await seedUserWithOrg(db);
		const body = { calc_type: 'tonnage', inputs: {}, result: {} };

		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when calc_type is missing', async () => {
		const { orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const body = { job_site_id: site.id, inputs: {}, result: {} };

		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when inputs is missing', async () => {
		const { orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const body = { job_site_id: site.id, calc_type: 'tonnage', result: {} };

		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 when result is missing', async () => {
		const { orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const body = { job_site_id: site.id, calc_type: 'tonnage', inputs: {} };

		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 on invalid calc_type', async () => {
		const { orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const body = { ...VALID_BODY, calc_type: 'invalid_type', job_site_id: site.id };

		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 404 when job site does not exist', async () => {
		const { sessionId } = await seedUserWithOrg(db);
		const body = { ...VALID_BODY, job_site_id: 'nonexistent-site-id' };

		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 403 when job site belongs to another org', async () => {
		const { sessionId } = await seedUserWithOrg(db, { email: 'a@example.com' });
		const { orgId: otherOrgId } = await seedUserWithOrg(db, { email: 'b@example.com' });
		const otherSite = await createTestJobSite(db, otherOrgId);

		const body = { ...VALID_BODY, job_site_id: otherSite.id };
		const event = authedEvent(db, sessionId, { method: 'POST', body });
		const res = await createCalculation(event as any);
		expect(res.status).toBe(403);
	});

	it('returns 401 when not authenticated', async () => {
		const event = unauthEvent(db, { method: 'POST' });
		const res = await createCalculation(event as any);
		expect(res.status).toBe(401);
	});
});

// ── GET /api/calculations ──────────────────────────────────────────────────────

describe('GET /api/calculations', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it('returns empty array when no calcs exist', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId);
		const res = await listCalculations(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.calculations).toEqual([]);
	});

	it('lists calcs for the current user', async () => {
		const { userId, orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);

		// Insert calc directly
		const now = Math.floor(Date.now() / 1000);
		const calcId = crypto.randomUUID();
		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(calcId, site.id, userId, 'tonnage', '{}', '{"tons":10}', null, now)
			.run();

		const event = authedEvent(db, sessionId);
		const res = await listCalculations(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.calculations).toHaveLength(1);
		expect(data.calculations[0].id).toBe(calcId);
		expect(data.calculations[0].calc_type).toBe('tonnage');
	});

	it('filters calcs by job_site_id', async () => {
		const { userId, orgId, sessionId } = await seedUserWithOrg(db);
		const site1 = await createTestJobSite(db, orgId);
		const site2 = await createTestJobSite(db, orgId);
		const now = Math.floor(Date.now() / 1000);

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(crypto.randomUUID(), site1.id, userId, 'tonnage', '{}', '{}', null, now)
			.run();
		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(crypto.randomUUID(), site2.id, userId, 'spread_rate', '{}', '{}', null, now)
			.run();

		const event = authedEvent(db, sessionId, { searchParams: { job_site_id: site1.id } });
		const res = await listCalculations(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.calculations).toHaveLength(1);
		expect(data.calculations[0].job_site_id).toBe(site1.id);
	});

	it('respects limit param', async () => {
		const { userId, orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const now = Math.floor(Date.now() / 1000);

		for (let i = 0; i < 5; i++) {
			await db.d1
				.prepare(
					'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
				)
				.bind(crypto.randomUUID(), site.id, userId, 'tonnage', '{}', '{}', null, now + i)
				.run();
		}

		const event = authedEvent(db, sessionId, { searchParams: { limit: '2' } });
		const res = await listCalculations(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.calculations).toHaveLength(2);
	});

	it('admin sees calcs across all job sites in org', async () => {
		const { userId, orgId, sessionId } = await seedUserWithOrg(db, { role: 'admin' });
		const site1 = await createTestJobSite(db, orgId);
		const site2 = await createTestJobSite(db, orgId);
		const now = Math.floor(Date.now() / 1000);

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(crypto.randomUUID(), site1.id, userId, 'tonnage', '{}', '{}', null, now)
			.run();
		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(crypto.randomUUID(), site2.id, userId, 'spread_rate', '{}', '{}', null, now)
			.run();

		const event = authedEvent(db, sessionId);
		const res = await listCalculations(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.calculations).toHaveLength(2);
	});

	it('returns 403 when filtering by job_site_id from another org', async () => {
		const { sessionId } = await seedUserWithOrg(db, { email: 'a@example.com' });
		const { orgId: otherOrgId } = await seedUserWithOrg(db, { email: 'b@example.com' });
		const otherSite = await createTestJobSite(db, otherOrgId);

		const event = authedEvent(db, sessionId, { searchParams: { job_site_id: otherSite.id } });
		const res = await listCalculations(event as any);
		expect(res.status).toBe(403);
	});

	it('returns 404 when filtering by unknown job_site_id', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, { searchParams: { job_site_id: 'no-such-site' } });
		const res = await listCalculations(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 401 when not authenticated', async () => {
		const event = unauthEvent(db);
		const res = await listCalculations(event as any);
		expect(res.status).toBe(401);
	});
});

// ── GET /api/calculations/[id] ────────────────────────────────────────────────

describe('GET /api/calculations/[id]', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it('returns a calculation by id', async () => {
		const { userId, orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const now = Math.floor(Date.now() / 1000);
		const calcId = crypto.randomUUID();

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(calcId, site.id, userId, 'feet_left', '{"distance":50}', '{"feetLeft":100}', 'note', now)
			.run();

		const event = authedEvent(db, sessionId, { params: { id: calcId } });
		const res = await getCalculation(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.id).toBe(calcId);
		expect(data.calc_type).toBe('feet_left');
		expect(data.inputs).toMatchObject({ distance: 50 });
		expect(data.result).toMatchObject({ feetLeft: 100 });
		expect(data.notes).toBe('note');
	});

	it('returns 404 for unknown calculation id', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, { params: { id: 'nonexistent-calc-id' } });
		const res = await getCalculation(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 403 for calc belonging to another org', async () => {
		const { sessionId } = await seedUserWithOrg(db, { email: 'a@example.com' });
		const { userId: otherUserId, orgId: otherOrgId } = await seedUserWithOrg(db, { email: 'b@example.com' });
		const otherSite = await createTestJobSite(db, otherOrgId);
		const now = Math.floor(Date.now() / 1000);
		const calcId = crypto.randomUUID();

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(calcId, otherSite.id, otherUserId, 'tonnage', '{}', '{}', null, now)
			.run();

		const event = authedEvent(db, sessionId, { params: { id: calcId } });
		const res = await getCalculation(event as any);
		expect(res.status).toBe(403);
	});

	it('returns 401 when not authenticated', async () => {
		const event = unauthEvent(db, { params: { id: 'any-id' } });
		const res = await getCalculation(event as any);
		expect(res.status).toBe(401);
	});
});

// ── DELETE /api/calculations/[id] ─────────────────────────────────────────────

describe('DELETE /api/calculations/[id]', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it('deletes a calculation and returns success', async () => {
		const { userId, orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const now = Math.floor(Date.now() / 1000);
		const calcId = crypto.randomUUID();

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(calcId, site.id, userId, 'tack_rate', '{}', '{}', null, now)
			.run();

		const event = authedEvent(db, sessionId, { method: 'DELETE', params: { id: calcId } });
		const res = await deleteCalculation(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		expect(data.success).toBe(true);
	});

	it('calc is gone after deletion', async () => {
		const { userId, orgId, sessionId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);
		const now = Math.floor(Date.now() / 1000);
		const calcId = crypto.randomUUID();

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(calcId, site.id, userId, 'tonnage', '{}', '{}', null, now)
			.run();

		// delete it
		const delEvent = authedEvent(db, sessionId, { method: 'DELETE', params: { id: calcId } });
		await deleteCalculation(delEvent as any);

		// verify it's gone
		const getEvent = authedEvent(db, sessionId, { params: { id: calcId } });
		const res = await getCalculation(getEvent as any);
		expect(res.status).toBe(404);
	});

	it('returns 404 for unknown calculation id', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, { method: 'DELETE', params: { id: 'no-such-calc' } });
		const res = await deleteCalculation(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 403 for calc belonging to another org', async () => {
		const { sessionId } = await seedUserWithOrg(db, { email: 'a@example.com' });
		const { userId: otherUserId, orgId: otherOrgId } = await seedUserWithOrg(db, { email: 'b@example.com' });
		const otherSite = await createTestJobSite(db, otherOrgId);
		const now = Math.floor(Date.now() / 1000);
		const calcId = crypto.randomUUID();

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(calcId, otherSite.id, otherUserId, 'tonnage', '{}', '{}', null, now)
			.run();

		const event = authedEvent(db, sessionId, { method: 'DELETE', params: { id: calcId } });
		const res = await deleteCalculation(event as any);
		expect(res.status).toBe(403);
	});

	it('returns 401 when not authenticated', async () => {
		const event = unauthEvent(db, { method: 'DELETE', params: { id: 'any-id' } });
		const res = await deleteCalculation(event as any);
		expect(res.status).toBe(401);
	});
});

// ── Org scoping ────────────────────────────────────────────────────────────────

describe('Org scoping — cross-org isolation', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	it('user from org A cannot list calcs created for org B sites', async () => {
		const { sessionId: sessionA } = await seedUserWithOrg(db, { email: 'a@example.com', role: 'admin' });
		const { userId: userB, orgId: orgBId } = await seedUserWithOrg(db, { email: 'b@example.com', role: 'admin' });
		const siteB = await createTestJobSite(db, orgBId);
		const now = Math.floor(Date.now() / 1000);

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(crypto.randomUUID(), siteB.id, userB, 'tonnage', '{}', '{}', null, now)
			.run();

		// Org A admin lists without filter — should only see their own org's data
		const event = authedEvent(db, sessionA);
		const res = await listCalculations(event as any);
		const data = await res.json();

		expect(res.status).toBe(200);
		// Org A has no sites, so calculations array is empty
		expect(data.calculations).toHaveLength(0);
	});

	it('user from org A cannot delete a calc from org B', async () => {
		const { sessionId: sessionA } = await seedUserWithOrg(db, { email: 'a@example.com' });
		const { userId: userB, orgId: orgBId } = await seedUserWithOrg(db, { email: 'b@example.com' });
		const siteB = await createTestJobSite(db, orgBId);
		const now = Math.floor(Date.now() / 1000);
		const calcId = crypto.randomUUID();

		await db.d1
			.prepare(
				'INSERT INTO calculations (id, job_site_id, user_id, calc_type, inputs, result, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.bind(calcId, siteB.id, userB, 'spread_rate', '{}', '{}', null, now)
			.run();

		const event = authedEvent(db, sessionA, { method: 'DELETE', params: { id: calcId } });
		const res = await deleteCalculation(event as any);
		expect(res.status).toBe(403);
	});
});
