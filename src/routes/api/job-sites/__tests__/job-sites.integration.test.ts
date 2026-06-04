/**
 * src/routes/api/job-sites/__tests__/job-sites.integration.test.ts
 *
 * Integration tests for the job-sites API routes.
 * Uses the in-memory D1-compatible SQLite test DB.
 *
 * Covers:
 *   POST   /api/job-sites          - create (minimal + validation)
 *   GET    /api/job-sites          - list (all sites for org)
 *   GET    /api/job-sites/[id]     - single (found, 404, cross-org 403)
 *   PATCH  /api/job-sites/[id]     - update fields
 *   PATCH  /api/job-sites/[id]     - archive (status -> 'archived')
 *   PUT    /api/job-sites/[id]/config - save calc config
 *   GET    /api/job-sites/[id]/config - read calc config
 *   Cross-org isolation            - user A cannot read/write user B's sites
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { RequestHandler } from '@sveltejs/kit';
import { createTestDb, type TestDb } from '../../../../../tests/helpers/db.js';
import { mockRequestEvent, type MockRequestEvent } from '../../../../../tests/helpers/request.js';
import { createTestUser } from '../../../../../tests/fixtures/users.js';
import { createTestOrg, createTestMembership } from '../../../../../tests/fixtures/orgs.js';
import { createTestJobSite } from '../../../../../tests/fixtures/job-sites.js';
import { GET as listJobSites, POST as createJobSite } from '../+server.js';
import { GET as getJobSite, PATCH as updateJobSite } from '../[id]/+server.js';
import { GET as getConfig, PUT as putConfig } from '../[id]/config/+server.js';

// ── helpers ────────────────────────────────────────────────────────────────────

/**
 * Creates a user with a valid session and org membership in the test DB,
 * then returns the IDs for use in subsequent request events.
 */
async function seedUserWithOrg(
	db: TestDb,
	overrides: { email?: string; name?: string; role?: string } = {}
): Promise<{ userId: string; orgId: string; sessionId: string; email: string; name: string }> {
	const email = overrides.email ?? `user-${crypto.randomUUID().slice(0, 8)}@test.example.com`;
	const name = overrides.name ?? 'Test User';
	const role = overrides.role ?? 'admin';

	const user = await createTestUser(db, { email, name });
	const org = await createTestOrg(db);
	await createTestMembership(db, user.id, org.id, { role: role as any });

	// Insert a valid session
	const sessionId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + 30 * 24 * 60 * 60;
	await db.d1
		.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
		.bind(sessionId, user.id, expiresAt, now)
		.run();

	return { userId: user.id, orgId: org.id, sessionId, email, name };
}

/**
 * Builds a mockRequestEvent with the given session cookie set.
 * Optionally injects locals.user directly (needed for endpoints that use
 * locals.user from SvelteKit hooks rather than requireAuth cookie-based auth).
 */
function authedEvent(
	db: TestDb,
	sessionId: string,
	overrides: {
		method?: string;
		pathname?: string;
		body?: unknown;
		params?: Record<string, string>;
		searchParams?: Record<string, string>;
		localsUser?: { id: string; email: string; name: string };
	} = {}
) {
	const event = mockRequestEvent({
		db: db.d1,
		method: overrides.method ?? 'GET',
		pathname: overrides.pathname ?? '/',
		body: overrides.body,
		params: overrides.params,
		searchParams: overrides.searchParams,
		cookies: { paverate_session: sessionId }
	});
	if (overrides.localsUser) {
		(event as any).locals = { user: overrides.localsUser };
	}
	return event;
}

/**
 * Calls a config route handler (which uses `throw error(...)` not `return json(...)`)
 * and returns a normalized { status, body } regardless of whether the handler throws
 * a SvelteKit HttpError or returns a normal Response.
 */
async function callConfig(
	handler: RequestHandler<any, any>,
	event: MockRequestEvent
): Promise<{ status: number; json: () => Promise<any> }> {
	try {
		const res = await handler(event as unknown as Parameters<RequestHandler<any, any>>[0]);
		return {
			status: res.status,
			json: () => res.json()
		};
	} catch (err: any) {
		// SvelteKit HttpError has { status, body }
		if (err && typeof err.status === 'number') {
			return {
				status: err.status,
				json: async () => err.body ?? {}
			};
		}
		throw err;
	}
}


describe('POST /api/job-sites — create', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('creates a job site with only a name', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, {
			method: 'POST',
			body: { name: 'SR-400 Resurfacing' }
		});

		const res = await createJobSite(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.id).toBeTruthy();
		expect(body.name).toBe('SR-400 Resurfacing');
		expect(body.status).toBe('active');
		expect(body.location_description).toBeNull();
	});

	it('creates a job site with all optional fields', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, {
			method: 'POST',
			body: {
				name: 'I-285 Overlay',
				location_description: 'I-285 between exits 10 and 15',
				latitude: 33.749,
				longitude: -84.388
			}
		});

		const res = await createJobSite(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.name).toBe('I-285 Overlay');
		expect(body.location_description).toBe('I-285 between exits 10 and 15');
		expect(body.latitude).toBeCloseTo(33.749);
		expect(body.longitude).toBeCloseTo(-84.388);
	});

	it('returns 400 when name is missing', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, {
			method: 'POST',
			body: { location_description: 'No name provided' }
		});

		const res = await createJobSite(event as any);
		expect(res.status).toBe(400);

		const body = (await res.json()) as any;
		expect(body.error).toMatch(/name/i);
	});

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({ db: db.d1, method: 'POST', body: { name: 'Test' } });

		const res = await createJobSite(event as any);
		expect(res.status).toBe(401);
	});
});

describe('GET /api/job-sites — list', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('returns an empty list when no sites exist', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId);
		const res = await listJobSites(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(Array.isArray(body.job_sites)).toBe(true);
		expect(body.job_sites).toHaveLength(0);
	});

	it('returns only the sites belonging to the authenticated user org', async () => {
		const { sessionId, orgId } = await seedUserWithOrg(db);

		// Create 2 sites in this org
		await createTestJobSite(db, orgId, { name: 'Site A' });
		await createTestJobSite(db, orgId, { name: 'Site B' });

		// Another org with its own site
		const { orgId: otherOrgId } = await seedUserWithOrg(db, { email: 'other@example.com' });
		await createTestJobSite(db, otherOrgId, { name: 'Other Org Site' });

		const event = authedEvent(db, sessionId);
		const res = await listJobSites(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.job_sites).toHaveLength(2);
		const names = body.job_sites.map((s: any) => s.name);
		expect(names).toContain('Site A');
		expect(names).toContain('Site B');
		expect(names).not.toContain('Other Org Site');
	});

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({ db: db.d1 });
		const res = await listJobSites(event as any);
		expect(res.status).toBe(401);
	});

	it('list response shape includes required fields', async () => {
		const { sessionId, orgId } = await seedUserWithOrg(db);
		await createTestJobSite(db, orgId, { name: 'Shape Test' });

		const event = authedEvent(db, sessionId);
		const res = await listJobSites(event as any);
		const body = (await res.json()) as any;

		const site = body.job_sites[0];
		expect(site).toHaveProperty('id');
		expect(site).toHaveProperty('org_id');
		expect(site).toHaveProperty('name');
		expect(site).toHaveProperty('status');
		expect(site).toHaveProperty('created_at');
		expect(site).toHaveProperty('updated_at');
	});
});

describe('GET /api/job-sites/[id] — single', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('returns a job site by id', async () => {
		const { sessionId, orgId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId, { name: 'SR-9 Overlay' });

		const event = authedEvent(db, sessionId, { params: { id: site.id } });
		const res = await getJobSite(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.id).toBe(site.id);
		expect(body.name).toBe('SR-9 Overlay');
		expect(body.org_id).toBe(orgId);
	});

	it('returns 404 for a non-existent site id', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, { params: { id: 'does-not-exist' } });
		const res = await getJobSite(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 403 when user from a different org requests a site (cross-org isolation)', async () => {
		// Org A creates a site
		const { orgId: orgAId } = await seedUserWithOrg(db, { email: 'usera@example.com' });
		const siteA = await createTestJobSite(db, orgAId, { name: 'Org A Site' });

		// Org B's user tries to read it
		const { sessionId: sessionB } = await seedUserWithOrg(db, { email: 'userb@example.com' });

		const event = authedEvent(db, sessionB, { params: { id: siteA.id } });
		const res = await getJobSite(event as any);
		expect(res.status).toBe(403);
	});

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({ db: db.d1, params: { id: 'any-id' } });
		const res = await getJobSite(event as any);
		expect(res.status).toBe(401);
	});
});

describe('PATCH /api/job-sites/[id] — update', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('updates the name of a job site', async () => {
		const { sessionId, orgId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId, { name: 'Old Name' });

		const event = authedEvent(db, sessionId, {
			method: 'PATCH',
			params: { id: site.id },
			body: { name: 'New Name' }
		});

		const res = await updateJobSite(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.name).toBe('New Name');
		expect(body.id).toBe(site.id);
	});

	it('updates location_description and coordinates', async () => {
		const { sessionId, orgId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);

		const event = authedEvent(db, sessionId, {
			method: 'PATCH',
			params: { id: site.id },
			body: { location_description: 'Exit 42 off I-75', latitude: 34.1, longitude: -84.5 }
		});

		const res = await updateJobSite(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.location_description).toBe('Exit 42 off I-75');
		expect(body.latitude).toBeCloseTo(34.1);
		expect(body.longitude).toBeCloseTo(-84.5);
	});

	it('archives a job site by setting status to archived', async () => {
		const { sessionId, orgId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId, { status: 'active' });

		const event = authedEvent(db, sessionId, {
			method: 'PATCH',
			params: { id: site.id },
			body: { status: 'archived' }
		});

		const res = await updateJobSite(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.status).toBe('archived');
	});

	it('returns 400 for invalid status value', async () => {
		const { sessionId, orgId } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);

		const event = authedEvent(db, sessionId, {
			method: 'PATCH',
			params: { id: site.id },
			body: { status: 'invalid-status' }
		});

		const res = await updateJobSite(event as any);
		expect(res.status).toBe(400);
	});

	it('returns 404 for non-existent site', async () => {
		const { sessionId } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, {
			method: 'PATCH',
			params: { id: 'ghost-site' },
			body: { name: 'Ghost' }
		});

		const res = await updateJobSite(event as any);
		expect(res.status).toBe(404);
	});

	it('returns 403 when user from different org attempts update (cross-org isolation)', async () => {
		const { orgId: orgAId } = await seedUserWithOrg(db, { email: 'usera2@example.com' });
		const siteA = await createTestJobSite(db, orgAId, { name: 'Org A Site 2' });

		const { sessionId: sessionB } = await seedUserWithOrg(db, { email: 'userb2@example.com' });

		const event = authedEvent(db, sessionB, {
			method: 'PATCH',
			params: { id: siteA.id },
			body: { name: 'Hijacked' }
		});

		const res = await updateJobSite(event as any);
		expect(res.status).toBe(403);
	});

	it('returns 401 for unauthenticated request', async () => {
		const event = mockRequestEvent({
			db: db.d1,
			method: 'PATCH',
			params: { id: 'any' },
			body: { name: 'x' }
		});
		const res = await updateJobSite(event as any);
		expect(res.status).toBe(401);
	});
});

describe('PUT /api/job-sites/[id]/config — save calc config', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('creates config for a job site (upsert, first write)', async () => {
		const { sessionId, orgId, userId, email, name } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);

		const event = authedEvent(db, sessionId, {
			method: 'PUT',
			params: { id: site.id },
			body: {
				road_type: 'state_route',
				scope_of_work: 'mill_and_fill',
				target_thickness_in: 2.0,
				target_spread_rate: 110
			},
			localsUser: { id: userId, email, name }
		});

		const res = await callConfig(putConfig, event);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.config).toBeTruthy();
		expect(body.config.road_type).toBe('state_route');
		expect(body.config.scope_of_work).toBe('mill_and_fill');
		expect(body.config.target_thickness_in).toBe(2.0);
		expect(body.config.target_spread_rate).toBe(110);
	});

	it('updates existing config (upsert, second write)', async () => {
		const { sessionId, orgId, userId, email, name } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);

		// First write
		const firstEvent = authedEvent(db, sessionId, {
			method: 'PUT',
			params: { id: site.id },
			body: { road_type: 'highway', target_thickness_in: 3.0 },
			localsUser: { id: userId, email, name }
		});
		await callConfig(putConfig, firstEvent);

		// Second write - should update
		const secondEvent = authedEvent(db, sessionId, {
			method: 'PUT',
			params: { id: site.id },
			body: { road_type: 'county_road', target_thickness_in: 1.5, mix_type: 'GDOT 9.5 mm' },
			localsUser: { id: userId, email, name }
		});

		const res = await callConfig(putConfig, secondEvent);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.config.road_type).toBe('county_road');
		expect(body.config.target_thickness_in).toBe(1.5);
		expect(body.config.mix_type).toBe('GDOT 9.5 mm');
	});

	it('returns 404 when job site does not exist', async () => {
		const { sessionId, userId, email, name } = await seedUserWithOrg(db);

		const event = authedEvent(db, sessionId, {
			method: 'PUT',
			params: { id: 'nonexistent-site' },
			body: { road_type: 'highway' },
			localsUser: { id: userId, email, name }
		});

		const res = await callConfig(putConfig, event);
		expect(res.status).toBe(404);
	});

	it('returns 403 when user from different org attempts config save (cross-org isolation)', async () => {
		const { orgId: orgAId } = await seedUserWithOrg(db, { email: 'configa@example.com' });
		const siteA = await createTestJobSite(db, orgAId);

		const { sessionId: sessionB, userId: userBId, email: emailB, name: nameB } =
			await seedUserWithOrg(db, { email: 'configb@example.com' });

		const event = authedEvent(db, sessionB, {
			method: 'PUT',
			params: { id: siteA.id },
			body: { road_type: 'highway' },
			localsUser: { id: userBId, email: emailB, name: nameB }
		});

		const res = await callConfig(putConfig, event);
		expect(res.status).toBe(403);
	});

	it('returns 401 for unauthenticated config write', async () => {
		const event = mockRequestEvent({
			db: db.d1,
			method: 'PUT',
			params: { id: 'any' },
			body: { road_type: 'highway' }
		});
		const res = await callConfig(putConfig, event);
		expect(res.status).toBe(401);
	});
});

describe('GET /api/job-sites/[id]/config — read calc config', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('returns null config when no config has been saved', async () => {
		const { sessionId, orgId, userId, email, name } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);

		const event = authedEvent(db, sessionId, {
			params: { id: site.id },
			localsUser: { id: userId, email, name }
		});
		const res = await callConfig(getConfig, event);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.config).toBeNull();
	});

	it('returns the config after it has been saved', async () => {
		const { sessionId, orgId, userId, email, name } = await seedUserWithOrg(db);
		const site = await createTestJobSite(db, orgId);

		// Save config first
		const saveEvent = authedEvent(db, sessionId, {
			method: 'PUT',
			params: { id: site.id },
			body: { road_type: 'parking_lot', num_lanes: 2, lane_width_ft: 12 },
			localsUser: { id: userId, email, name }
		});
		await callConfig(putConfig, saveEvent);

		// Read it back
		const readEvent = authedEvent(db, sessionId, {
			params: { id: site.id },
			localsUser: { id: userId, email, name }
		});
		const res = await callConfig(getConfig, readEvent);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.config).toBeTruthy();
		expect(body.config.road_type).toBe('parking_lot');
		expect(body.config.num_lanes).toBe(2);
		expect(body.config.lane_width_ft).toBe(12);
	});

	it('returns 403 for cross-org config read (cross-org isolation)', async () => {
		const { orgId: orgAId } = await seedUserWithOrg(db, { email: 'reada@example.com' });
		const siteA = await createTestJobSite(db, orgAId);

		const { sessionId: sessionB, userId: userBId, email: emailB, name: nameB } =
			await seedUserWithOrg(db, { email: 'readb@example.com' });

		const event = authedEvent(db, sessionB, {
			params: { id: siteA.id },
			localsUser: { id: userBId, email: emailB, name: nameB }
		});
		const res = await callConfig(getConfig, event);
		expect(res.status).toBe(403);
	});

	it('returns 401 for unauthenticated config read', async () => {
		const event = mockRequestEvent({ db: db.d1, params: { id: 'any' } });
		const res = await callConfig(getConfig, event);
		expect(res.status).toBe(401);
	});
});

describe('Cross-org isolation — end-to-end', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('user A cannot list user B sites', async () => {
		const { sessionId: sessionA, orgId: orgA } = await seedUserWithOrg(db, {
			email: 'isolation-a@example.com'
		});
		const { orgId: orgB } = await seedUserWithOrg(db, { email: 'isolation-b@example.com' });

		await createTestJobSite(db, orgA, { name: 'A Site' });
		await createTestJobSite(db, orgB, { name: 'B Site' });

		// User A lists sites — should only see A's site
		const event = authedEvent(db, sessionA);
		const res = await listJobSites(event as any);
		expect(res.status).toBe(200);

		const body = (await res.json()) as any;
		expect(body.job_sites).toHaveLength(1);
		expect(body.job_sites[0].name).toBe('A Site');
	});

	it('user A cannot update user B site', async () => {
		const { sessionId: sessionA } = await seedUserWithOrg(db, {
			email: 'update-a@example.com'
		});
		const { orgId: orgB } = await seedUserWithOrg(db, { email: 'update-b@example.com' });
		const siteB = await createTestJobSite(db, orgB, { name: 'B Site' });

		const event = authedEvent(db, sessionA, {
			method: 'PATCH',
			params: { id: siteB.id },
			body: { name: 'Stolen' }
		});
		const res = await updateJobSite(event as any);
		expect(res.status).toBe(403);
	});

	it('user A cannot write config on user B site', async () => {
		const { sessionId: sessionA, userId: userAId, email: emailA, name: nameA } =
			await seedUserWithOrg(db, { email: 'cfga@example.com' });
		const { orgId: orgB } = await seedUserWithOrg(db, { email: 'cfgb@example.com' });
		const siteB = await createTestJobSite(db, orgB);

		const event = authedEvent(db, sessionA, {
			method: 'PUT',
			params: { id: siteB.id },
			body: { road_type: 'highway' },
			localsUser: { id: userAId, email: emailA, name: nameA }
		});
		const res = await callConfig(putConfig, event);
		expect(res.status).toBe(403);
	});
});
