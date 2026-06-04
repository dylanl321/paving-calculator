/**
 * tests/helpers/db.integration.test.ts
 *
 * Smoke tests: migration runner handles all SQL files, D1 wrapper API works,
 * and the seed factories produce rows that round-trip correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from './db.js';
import { createTestUser } from '../fixtures/users.js';
import { createTestOrg, createTestMembership } from '../fixtures/orgs.js';
import { createTestJobSite } from '../fixtures/job-sites.js';

describe('createTestDb — migration runner', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	afterEach(() => {
		db.close();
	});

	it('applies all migration files without error', () => {
		// If we get here, the constructor ran migrations successfully.
		expect(db.raw.open).toBe(true);
	});

	it('creates the users table', async () => {
		const result = await db.d1
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
			.first<{ name: string }>();
		expect(result?.name).toBe('users');
	});

	it('creates the organizations table', async () => {
		const result = await db.d1
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'")
			.first<{ name: string }>();
		expect(result?.name).toBe('organizations');
	});

	it('creates the job_sites table', async () => {
		const result = await db.d1
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='job_sites'")
			.first<{ name: string }>();
		expect(result?.name).toBe('job_sites');
	});

	it('creates the sessions table', async () => {
		const result = await db.d1
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
			.first<{ name: string }>();
		expect(result?.name).toBe('sessions');
	});
});

describe('D1 wrapper — API shape', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	afterEach(() => {
		db.close();
	});

	it('prepare().bind().first() returns null for missing row', async () => {
		const result = await db.d1
			.prepare('SELECT * FROM users WHERE id = ?')
			.bind('nonexistent')
			.first();
		expect(result).toBeNull();
	});

	it('prepare().bind().all() returns empty results array for empty table', async () => {
		const result = await db.d1.prepare('SELECT * FROM users').all();
		expect(result.success).toBe(true);
		expect(result.results).toEqual([]);
	});

	it('prepare().bind().run() inserts and succeeds', async () => {
		const now = Math.floor(Date.now() / 1000);
		const result = await db.d1
			.prepare(
				'INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.bind('u1', 'test@example.com', '$2b$10$hash', 'Test', now, now)
			.run();
		expect(result.success).toBe(true);
	});
});

describe('createTestUser fixture', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	afterEach(() => {
		db.close();
	});

	it('inserts a user and retrieves it back', async () => {
		const user = await createTestUser(db, { email: 'alice@example.com', name: 'Alice' });

		const row = await db.d1
			.prepare('SELECT * FROM users WHERE id = ?')
			.bind(user.id)
			.first<{ id: string; email: string; name: string }>();

		expect(row?.id).toBe(user.id);
		expect(row?.email).toBe('alice@example.com');
		expect(row?.name).toBe('Alice');
	});

	it('uses defaults when no options provided', async () => {
		const user = await createTestUser(db);
		expect(user.id).toMatch(/^test-user-/);
		expect(user.email).toMatch(/@test\.example\.com$/);
		expect(user.is_global_admin).toBe(false);
		expect(user.disabled).toBe(false);
	});

	it('respects isGlobalAdmin and emailVerified flags', async () => {
		const user = await createTestUser(db, { isGlobalAdmin: true, emailVerified: true });
		expect(user.is_global_admin).toBe(true);
		expect(user.email_verified).toBe(true);
	});
});

describe('createTestOrg + createTestMembership fixtures', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	afterEach(() => {
		db.close();
	});

	it('inserts an org and retrieves it back', async () => {
		const org = await createTestOrg(db, { name: 'Acme Paving', slug: 'acme' });

		const row = await db.d1
			.prepare('SELECT * FROM organizations WHERE id = ?')
			.bind(org.id)
			.first<{ id: string; name: string; slug: string }>();

		expect(row?.name).toBe('Acme Paving');
		expect(row?.slug).toBe('acme');
	});

	it('creates a membership linking user to org', async () => {
		const user = await createTestUser(db);
		const org = await createTestOrg(db);
		const membership = await createTestMembership(db, user.id, org.id, { role: 'owner' });

		const row = await db.d1
			.prepare('SELECT * FROM org_members WHERE user_id = ? AND org_id = ?')
			.bind(user.id, org.id)
			.first<{ user_id: string; org_id: string; role: string; accepted_at: number | null }>();

		expect(row?.role).toBe('owner');
		expect(row?.accepted_at).not.toBeNull();
		expect(membership.role).toBe('owner');
	});

	it('creates pending membership when accepted=false', async () => {
		const user = await createTestUser(db);
		const org = await createTestOrg(db);
		const membership = await createTestMembership(db, user.id, org.id, { accepted: false });

		expect(membership.accepted_at).toBeNull();
	});
});

describe('createTestJobSite fixture', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});

	afterEach(() => {
		db.close();
	});

	it('inserts a job site and retrieves it back', async () => {
		const org = await createTestOrg(db);
		const site = await createTestJobSite(db, org.id, { name: 'SR-400 Resurfacing' });

		const row = await db.d1
			.prepare('SELECT * FROM job_sites WHERE id = ?')
			.bind(site.id)
			.first<{ id: string; name: string; org_id: string; status: string }>();

		expect(row?.name).toBe('SR-400 Resurfacing');
		expect(row?.org_id).toBe(org.id);
		expect(row?.status).toBe('active');
	});

	it('uses defaults for optional fields', async () => {
		const org = await createTestOrg(db);
		const site = await createTestJobSite(db, org.id);

		expect(site.id).toMatch(/^test-site-/);
		expect(site.status).toBe('active');
		expect(site.latitude).toBeNull();
		expect(site.job_number).toBeNull();
	});

	it('respects status and job number options', async () => {
		const org = await createTestOrg(db);
		const site = await createTestJobSite(db, org.id, {
			status: 'completed',
			jobNumber: 'JN-1234'
		});

		expect(site.status).toBe('completed');
		expect(site.job_number).toBe('JN-1234');
	});
});
