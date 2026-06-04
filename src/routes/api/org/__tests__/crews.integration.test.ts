/**
 * Integration tests for crews management endpoints:
 *   POST /api/org/crews - create crew
 *   GET  /api/org/crews - list crews
 *   PATCH /api/org/crews/[crewId] - update crew
 *   DELETE /api/org/crews/[crewId] - delete crew
 *   GET  /api/org/crews/[crewId]/job-sites - list crew job sites
 *   POST /api/org/crews/[crewId]/job-sites - assign job site to crew
 *   PATCH /api/org/members/[userId]/crew - assign member to crew
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../../tests/helpers/request.js';
import { POST as postCrew, GET as getCrews } from '../crews/+server.js';
import { PATCH as patchCrew, DELETE as deleteCrew } from '../crews/[crewId]/+server.js';
import {
	GET as getCrewJobSites,
	POST as postCrewJobSite
} from '../crews/[crewId]/job-sites/+server.js';
import { PATCH as patchMemberCrew } from '../members/[userId]/crew/+server.js';
import type { D1DatabaseCompat } from '../../../../../tests/helpers/db.js';
import type { MockRequestEvent } from '../../../../../tests/helpers/request.js';

// ── helpers ────────────────────────────────────────────────────────────────────

interface SetupOpts {
	db: D1DatabaseCompat;
	role?: string;
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
	const { db, role = 'owner', email = 'owner@example.com', name = 'Owner User' } = opts;
	const userId = crypto.randomUUID();
	const orgId = crypto.randomUUID();
	const sessionId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + 30 * 24 * 60 * 60;
	const orgSlug = email.split('@')[0] ?? 'test-org';

	await db
		.prepare(
			'INSERT INTO users (id, email, name, password_hash, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(userId, email, name, 'hash', 1, now)
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
	} = {}
): MockRequestEvent {
	return mockRequestEvent({
		db,
		method: opts.method ?? 'GET',
		pathname: opts.pathname ?? '/',
		body: opts.body,
		params: opts.params ?? {},
		cookies: { paverate_session: sessionId }
	});
}

// ── POST /api/org/crews ────────────────────────────────────────────────────────

describe('POST /api/org/crews', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({ db: db.d1, method: 'POST', body: { name: 'Crew A' } });
		const res = await postCrew(event as any);
		expect(res.status).toBe(401);
	});

	it('creates crew with name and color for owner', async () => {
		const { sessionId } = await setup({ db: db.d1, role: 'owner' });
		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { name: 'Alpha Crew', color: 'blue' }
		});
		const res = await postCrew(event as any);
		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.crew).toHaveProperty('id');
		expect(body.crew.name).toBe('Alpha Crew');
		expect(body.crew.color).toBe('blue');
	});

	it('creates crew with default color when color is omitted', async () => {
		const { sessionId } = await setup({ db: db.d1, role: 'admin' });
		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { name: 'Beta Crew' }
		});
		const res = await postCrew(event as any);
		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.crew.name).toBe('Beta Crew');
		expect(body.crew.color).toBe('slate');
	});

	it('returns 400 when name is missing', async () => {
		const { sessionId } = await setup({ db: db.d1, role: 'owner' });
		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { color: 'green' }
		});
		const res = await postCrew(event as any);
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toMatch(/name/i);
	});

	it('returns 400 when name is empty string', async () => {
		const { sessionId } = await setup({ db: db.d1, role: 'owner' });
		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { name: '   ' }
		});
		const res = await postCrew(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid color', async () => {
		const { sessionId } = await setup({ db: db.d1, role: 'owner' });
		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { name: 'Gamma Crew', color: 'invalid' }
		});
		const res = await postCrew(event as any);
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toMatch(/color/i);
	});

	it('returns 403 for member role', async () => {
		const { sessionId } = await setup({ db: db.d1, role: 'member' });
		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { name: 'Delta Crew' }
		});
		const res = await postCrew(event as any);
		expect(res.status).toBe(403);
	});

	it('allows admin to create crew', async () => {
		const { sessionId } = await setup({ db: db.d1, role: 'admin' });
		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { name: 'Admin Crew', color: 'red' }
		});
		const res = await postCrew(event as any);
		expect(res.status).toBe(201);
	});
});

// ── GET /api/org/crews ─────────────────────────────────────────────────────────

describe('GET /api/org/crews', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({ db: db.d1 });
		const res = await getCrews(event as any);
		expect(res.status).toBe(401);
	});

	it('returns empty crews array when no crews exist', async () => {
		const { sessionId } = await setup({ db: db.d1, role: 'owner' });
		const event = makeEvent(db.d1, sessionId);
		const res = await getCrews(event as any);
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(Array.isArray(body.crews)).toBe(true);
		expect(body.crews.length).toBe(0);
	});

	it('returns crews array with members for owner', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(crewId, orgId, 'Test Crew', 'blue', userId, now)
			.run();

		const event = makeEvent(db.d1, sessionId);
		const res = await getCrews(event as any);
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.crews.length).toBe(1);
		expect(body.crews[0].name).toBe('Test Crew');
		expect(body.crews[0].color).toBe('blue');
		expect(body.crews[0]).toHaveProperty('member_count');
		expect(body.crews[0]).toHaveProperty('members');
		expect(Array.isArray(body.crews[0].members)).toBe(true);
	});

	it('returns crews for member role', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'member' });
		const crewId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(crewId, orgId, 'Member Crew', 'green', userId, now)
			.run();

		const event = makeEvent(db.d1, sessionId);
		const res = await getCrews(event as any);
		expect(res.status).toBe(200);
	});
});

// ── PATCH /api/org/crews/[crewId] ──────────────────────────────────────────────

describe('PATCH /api/org/crews/[crewId]', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	async function createCrew(orgId: string, userId: string): Promise<string> {
		const crewId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(crewId, orgId, 'Original Name', 'slate', userId, now)
			.run();
		return crewId;
	}

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({
			db: db.d1,
			method: 'PATCH',
			body: { name: 'New Name' },
			params: { crewId: 'x' }
		});
		const res = await patchCrew(event as any);
		expect(res.status).toBe(401);
	});

	it('updates crew name for owner', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { name: 'Updated Name' },
			params: { crewId }
		});
		const res = await patchCrew(event as any);
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);

		// Verify name was updated
		const row = await db.d1
			.prepare('SELECT name FROM crews WHERE id = ?')
			.bind(crewId)
			.first<{ name: string }>();
		expect(row?.name).toBe('Updated Name');
	});

	it('updates crew color for admin', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'admin' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { color: 'amber' },
			params: { crewId }
		});
		const res = await patchCrew(event as any);
		expect(res.status).toBe(200);

		// Verify color was updated
		const row = await db.d1
			.prepare('SELECT color FROM crews WHERE id = ?')
			.bind(crewId)
			.first<{ color: string }>();
		expect(row?.color).toBe('amber');
	});

	it('updates both name and color', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { name: 'Both Updated', color: 'violet' },
			params: { crewId }
		});
		const res = await patchCrew(event as any);
		expect(res.status).toBe(200);
	});

	it('returns 400 when no fields provided', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: {},
			params: { crewId }
		});
		const res = await patchCrew(event as any);
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toMatch(/required/i);
	});

	it('returns 400 for invalid color', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { color: 'invalid-color' },
			params: { crewId }
		});
		const res = await patchCrew(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 403 for member role', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'member' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { name: 'Forbidden' },
			params: { crewId }
		});
		const res = await patchCrew(event as any);
		expect(res.status).toBe(403);
	});
});

// ── DELETE /api/org/crews/[crewId] ─────────────────────────────────────────────

describe('DELETE /api/org/crews/[crewId]', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	async function createCrew(orgId: string, createdBy: string): Promise<string> {
		const crewId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(crewId, orgId, 'To Delete', 'red', createdBy, now)
			.run();
		return crewId;
	}

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({
			db: db.d1,
			method: 'DELETE',
			params: { crewId: 'x' }
		});
		const res = await deleteCrew(event as any);
		expect(res.status).toBe(401);
	});

	it('deletes crew for owner', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'DELETE',
			params: { crewId }
		});
		const res = await deleteCrew(event as any);
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);

		// Verify crew was deleted
		const row = await db.d1
			.prepare('SELECT * FROM crews WHERE id = ?')
			.bind(crewId)
			.first();
		expect(row).toBeNull();
	});

	it('deletes crew for admin', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'admin' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'DELETE',
			params: { crewId }
		});
		const res = await deleteCrew(event as any);
		expect(res.status).toBe(200);
	});

	it('returns 403 for member role', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'member' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, {
			method: 'DELETE',
			params: { crewId }
		});
		const res = await deleteCrew(event as any);
		expect(res.status).toBe(403);
	});
});

// ── GET /api/org/crews/[crewId]/job-sites ──────────────────────────────────────

describe('GET /api/org/crews/[crewId]/job-sites', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	async function createCrew(orgId: string, createdBy: string): Promise<string> {
		const crewId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(crewId, orgId, 'Job Site Crew', 'blue', createdBy, now)
			.run();
		return crewId;
	}

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({ db: db.d1, params: { crewId: 'x' } });
		const res = await getCrewJobSites(event as any);
		expect(res.status).toBe(401);
	});

	it('returns empty job sites array when no sites assigned', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, { params: { crewId } });
		const res = await getCrewJobSites(event as any);
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(Array.isArray(body.job_sites)).toBe(true);
		expect(body.job_sites.length).toBe(0);
	});

	it('returns job sites assigned to crew', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const jobSiteId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		// Create job site
		await db.d1
			.prepare(
				'INSERT INTO job_sites (id, org_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(jobSiteId, orgId, 'Site Alpha', 'active', now)
			.run();

		// Assign to crew
		await db.d1
			.prepare('INSERT INTO crew_job_sites (crew_id, job_site_id, org_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?, ?)')
			.bind(crewId, jobSiteId, orgId, now, userId)
			.run();

		const event = makeEvent(db.d1, sessionId, { params: { crewId } });
		const res = await getCrewJobSites(event as any);
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.job_sites.length).toBe(1);
		expect(body.job_sites[0].name).toBe('Site Alpha');
	});

	it('returns job sites for member role', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'member' });
		const crewId = await createCrew(orgId, userId);
		const event = makeEvent(db.d1, sessionId, { params: { crewId } });
		const res = await getCrewJobSites(event as any);
		expect(res.status).toBe(200);
	});
});

// ── POST /api/org/crews/[crewId]/job-sites ─────────────────────────────────────

describe('POST /api/org/crews/[crewId]/job-sites', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	async function createCrew(orgId: string, createdBy: string): Promise<string> {
		const crewId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(crewId, orgId, 'Assignment Crew', 'green', createdBy, now)
			.run();
		return crewId;
	}

	async function createJobSite(orgId: string): Promise<string> {
		const jobSiteId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare(
				'INSERT INTO job_sites (id, org_id, name, status, created_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(jobSiteId, orgId, 'Test Site', 'active', now)
			.run();
		return jobSiteId;
	}

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({
			db: db.d1,
			method: 'POST',
			body: { job_site_id: 'x' },
			params: { crewId: 'x' }
		});
		const res = await postCrewJobSite(event as any);
		expect(res.status).toBe(401);
	});

	it('assigns job site to crew for owner', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const jobSiteId = await createJobSite(orgId);

		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { job_site_id: jobSiteId },
			params: { crewId }
		});
		const res = await postCrewJobSite(event as any);
		expect(res.status).toBe(201);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);

		// Verify assignment
		const row = await db.d1
			.prepare('SELECT * FROM crew_job_sites WHERE crew_id = ? AND job_site_id = ?')
			.bind(crewId, jobSiteId)
			.first();
		expect(row).not.toBeNull();
	});

	it('assigns job site to crew for admin', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'admin' });
		const crewId = await createCrew(orgId, userId);
		const jobSiteId = await createJobSite(orgId);

		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { job_site_id: jobSiteId },
			params: { crewId }
		});
		const res = await postCrewJobSite(event as any);
		expect(res.status).toBe(201);
	});

	it('returns 400 when job_site_id is missing', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);

		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: {},
			params: { crewId }
		});
		const res = await postCrewJobSite(event as any);
		expect(res.status).toBe(400);
		const body = (await res.json()) as any;
		expect(body.error).toMatch(/job_site_id/i);
	});

	it('returns 403 for member role', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'member' });
		const crewId = await createCrew(orgId, userId);
		const jobSiteId = await createJobSite(orgId);

		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { job_site_id: jobSiteId },
			params: { crewId }
		});
		const res = await postCrewJobSite(event as any);
		expect(res.status).toBe(403);
	});

	it('returns 404 for job site from different org', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);

		// Create job site in different org
		const otherOrgId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
			.bind(otherOrgId, 'Other Org', 'other', now)
			.run();
		const jobSiteId = await createJobSite(otherOrgId);

		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { job_site_id: jobSiteId },
			params: { crewId }
		});
		const res = await postCrewJobSite(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 404 for non-existent job site', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const fakeJobSiteId = crypto.randomUUID();

		const event = makeEvent(db.d1, sessionId, {
			method: 'POST',
			body: { job_site_id: fakeJobSiteId },
			params: { crewId }
		});
		const res = await postCrewJobSite(event as any);
		expect(res.status).toBe(404);
	});
});

// ── PATCH /api/org/members/[userId]/crew ───────────────────────────────────────

describe('PATCH /api/org/members/[userId]/crew', () => {
	let db: ReturnType<typeof createTestDb>;

	beforeEach(() => {
		db = createTestDb();
	});

	async function createCrew(orgId: string, createdBy: string): Promise<string> {
		const crewId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(crewId, orgId, 'Member Crew', 'pink', createdBy, now)
			.run();
		return crewId;
	}

	async function addMember(orgId: string, role: string): Promise<string> {
		const memberId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare(
				'INSERT INTO users (id, email, name, password_hash, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind(
				memberId,
				`member-${memberId.slice(0, 6)}@example.com`,
				'Test Member',
				'hash',
				1,
				now
			)
			.run();
		await db.d1
			.prepare(
				'INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(memberId, orgId, role, now, now)
			.run();
		return memberId;
	}

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({
			db: db.d1,
			method: 'PATCH',
			body: { crew_id: 'x' },
			params: { userId: 'x' }
		});
		const res = await patchMemberCrew(event as any);
		expect(res.status).toBe(401);
	});

	it('assigns member to crew for owner', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const memberId = await addMember(orgId, 'member');

		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { crew_id: crewId },
			params: { userId: memberId }
		});
		const res = await patchMemberCrew(event as any);
		expect(res.status).toBe(200);
		const body = (await res.json()) as any;
		expect(body.success).toBe(true);

		// Verify assignment
		const row = await db.d1
			.prepare('SELECT * FROM crew_members WHERE crew_id = ? AND user_id = ?')
			.bind(crewId, memberId)
			.first();
		expect(row).not.toBeNull();
	});

	it('assigns member to crew for admin', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'admin' });
		const crewId = await createCrew(orgId, userId);
		const memberId = await addMember(orgId, 'member');

		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { crew_id: crewId },
			params: { userId: memberId }
		});
		const res = await patchMemberCrew(event as any);
		expect(res.status).toBe(200);
	});

	it('removes member from crew when crew_id is null', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const memberId = await addMember(orgId, 'member');
		const now = Math.floor(Date.now() / 1000);

		// First assign
		await db.d1
			.prepare('INSERT INTO crew_members (crew_id, user_id, org_id, assigned_at) VALUES (?, ?, ?, ?)')
			.bind(crewId, memberId, orgId, now)
			.run();

		// Now remove
		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { crew_id: null },
			params: { userId: memberId }
		});
		const res = await patchMemberCrew(event as any);
		expect(res.status).toBe(200);

		// Verify removal
		const row = await db.d1
			.prepare('SELECT * FROM crew_members WHERE user_id = ?')
			.bind(memberId)
			.first();
		expect(row).toBeNull();
	});

	it('removes member from crew when crew_id is empty string', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'owner' });
		const crewId = await createCrew(orgId, userId);
		const memberId = await addMember(orgId, 'member');
		const now = Math.floor(Date.now() / 1000);

		// First assign
		await db.d1
			.prepare('INSERT INTO crew_members (crew_id, user_id, org_id, assigned_at) VALUES (?, ?, ?, ?)')
			.bind(crewId, memberId, orgId, now)
			.run();

		// Now remove with empty string
		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { crew_id: '' },
			params: { userId: memberId }
		});
		const res = await patchMemberCrew(event as any);
		expect(res.status).toBe(200);

		// Verify removal
		const row = await db.d1
			.prepare('SELECT * FROM crew_members WHERE user_id = ?')
			.bind(memberId)
			.first();
		expect(row).toBeNull();
	});

	it('returns 403 for member role', async () => {
		const { sessionId, orgId, userId } = await setup({ db: db.d1, role: 'member' });
		const crewId = await createCrew(orgId, userId);
		const memberId = await addMember(orgId, 'member');

		const event = makeEvent(db.d1, sessionId, {
			method: 'PATCH',
			body: { crew_id: crewId },
			params: { userId: memberId }
		});
		const res = await patchMemberCrew(event as any);
		expect(res.status).toBe(403);
	});
});
