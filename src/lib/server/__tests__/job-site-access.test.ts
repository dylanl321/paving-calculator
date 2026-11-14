import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../tests/helpers/request.js';
import { createTestUser } from '../../../../tests/fixtures/users.js';
import { createTestOrg, createTestMembership } from '../../../../tests/fixtures/orgs.js';
import { createTestJobSite } from '../../../../tests/fixtures/job-sites.js';
import { DbHelper } from '../db.js';
import {
	enforceJobSiteAccess,
	jobSiteAccessDecision,
	jobSiteIdFromApiPath
} from '../job-site-access.js';
import { GET as listJobSites } from '../../../routes/api/job-sites/+server.js';
import { GET as getSchedule } from '../../../routes/api/job-sites/[id]/schedule/+server.js';

async function assign(db: TestDb, orgId: string, userId: string, jobSiteId: string) {
	const crewId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	await db.d1
		.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(crewId, orgId, 'Day crew', 'slate', userId, now)
		.run();
	await db.d1
		.prepare('INSERT INTO crew_members (crew_id, user_id, org_id, assigned_at) VALUES (?, ?, ?, ?)')
		.bind(crewId, userId, orgId, now)
		.run();
	await db.d1
		.prepare(
			'INSERT INTO crew_job_sites (crew_id, job_site_id, org_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(crewId, jobSiteId, orgId, now, userId)
		.run();
}

describe('job site access by id', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('reads the project id from nested API paths and ignores collection routes', () => {
		expect(jobSiteIdFromApiPath('/api/job-sites/abc/loads')).toBe('abc');
		expect(jobSiteIdFromApiPath('/api/job-sites/abc')).toBe('abc');
		expect(jobSiteIdFromApiPath('/api/job-sites/import-pdf')).toBeNull();
		expect(jobSiteIdFromApiPath('/api/job-sites')).toBeNull();
	});

	it('lets a laborer open only the project their crew is assigned to', async () => {
		const user = await createTestUser(db, { email: 'laborer-access@example.com' });
		const org = await createTestOrg(db);
		await createTestMembership(db, user.id, org.id, { role: 'laborer' });
		const mine = await createTestJobSite(db, org.id, { name: 'Mine' });
		const other = await createTestJobSite(db, org.id, { name: 'Other' });
		await assign(db, org.id, user.id, mine.id);

		expect((await jobSiteAccessDecision(db.d1, user.id, mine.id)).ok).toBe(true);
		const denied = await jobSiteAccessDecision(db.d1, user.id, other.id);
		expect(denied.ok).toBe(false);
		if (!denied.ok) expect(denied.status).toBe(403);

		const event = mockRequestEvent({
			db: db.d1,
			pathname: `/api/job-sites/${other.id}/config`
		});
		(event as { locals: { user: { id: string } } }).locals = { user: { id: user.id } };
		const response = await enforceJobSiteAccess(event as any, other.id);
		expect(response?.status).toBe(403);
	});

	it('lets owner, office, and inspector open any project in the org', async () => {
		const org = await createTestOrg(db, { slug: 'wide-org' });
		const site = await createTestJobSite(db, org.id);
		for (const role of ['owner', 'office', 'inspector'] as const) {
			const user = await createTestUser(db, { email: `${role}-access@example.com` });
			await createTestMembership(db, user.id, org.id, { role });
			expect((await jobSiteAccessDecision(db.d1, user.id, site.id)).ok).toBe(true);
		}
	});

	it('hides unassigned projects from an operator on the project list', async () => {
		const user = await createTestUser(db, { email: 'operator-list@example.com', name: 'Op' });
		const org = await createTestOrg(db, { slug: 'op-org' });
		await createTestMembership(db, user.id, org.id, { role: 'operator' });
		const mine = await createTestJobSite(db, org.id, { name: 'Assigned' });
		await createTestJobSite(db, org.id, { name: 'Hidden' });
		await assign(db, org.id, user.id, mine.id);

		const sessionId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
			.bind(sessionId, user.id, now + 3600, now)
			.run();

		const event = mockRequestEvent({
			db: db.d1,
			cookies: { paverate_session: sessionId }
		});
		const res = await listJobSites(event as any);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { job_sites: Array<{ name: string }> };
		expect(body.job_sites.map((site) => site.name)).toEqual(['Assigned']);
	});
});

describe('active organization', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('uses the most recent membership until an active org is chosen', async () => {
		const user = await createTestUser(db, { email: 'multi@example.com' });
		const older = await createTestOrg(db, { name: 'Older Co', slug: 'older-co' });
		const newer = await createTestOrg(db, { name: 'Newer Co', slug: 'newer-co' });
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare(
				'INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(user.id, older.id, 'member', now - 100, now - 100)
			.run();
		await db.d1
			.prepare(
				'INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?)'
			)
			.bind(user.id, newer.id, 'foreman', now, now)
			.run();

		const helper = new DbHelper(db.d1);
		expect((await helper.getOrgByUserId(user.id))?.id).toBe(newer.id);

		await helper.setActiveOrg(user.id, older.id);
		expect((await helper.getOrgByUserId(user.id))?.id).toBe(older.id);

		const orgs = await helper.listUserOrgs(user.id);
		expect(orgs.map((org) => org.id)).toEqual([newer.id, older.id]);
	});
});

describe('schedule conflicts stay inside the caller’s projects', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('does not name the other project for a laborer who cannot open it', async () => {
		const user = await createTestUser(db, { email: 'sched-labor@example.com', name: 'Labor' });
		const owner = await createTestUser(db, { email: 'sched-owner@example.com', name: 'Owner' });
		const org = await createTestOrg(db, { slug: 'sched-org' });
		await createTestMembership(db, user.id, org.id, { role: 'laborer' });
		await createTestMembership(db, owner.id, org.id, { role: 'owner' });
		const mine = await createTestJobSite(db, org.id, { name: 'My Overlay' });
		const secret = await createTestJobSite(db, org.id, { name: 'Secret Widening' });
		const now = Math.floor(Date.now() / 1000);
		const myCrew = crypto.randomUUID();
		const otherCrew = crypto.randomUUID();
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(myCrew, org.id, 'Day crew', 'slate', owner.id, now)
			.run();
		await db.d1
			.prepare('INSERT INTO crews (id, org_id, name, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(otherCrew, org.id, 'Night crew', 'blue', owner.id, now)
			.run();
		await db.d1
			.prepare('INSERT INTO crew_members (crew_id, user_id, org_id, assigned_at) VALUES (?, ?, ?, ?)')
			.bind(myCrew, user.id, org.id, now)
			.run();
		await db.d1
			.prepare(
				`INSERT INTO crew_job_sites (crew_id, job_site_id, org_id, assigned_at, assigned_by, start_date, end_date)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(myCrew, mine.id, org.id, now, owner.id, '2026-06-01', '2026-06-10')
			.run();
		for (const site of [mine, secret]) {
			await db.d1
				.prepare(
					`INSERT INTO crew_job_sites (crew_id, job_site_id, org_id, assigned_at, assigned_by, start_date, end_date)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(otherCrew, site.id, org.id, now, owner.id, '2026-06-01', '2026-06-10')
				.run();
		}
		const sessionId = crypto.randomUUID();
		await db.d1
			.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
			.bind(sessionId, user.id, now + 3600, now)
			.run();
		const event = mockRequestEvent({
			db: db.d1,
			params: { id: mine.id },
			cookies: { paverate_session: sessionId }
		});
		const res = await getSchedule(event as any);
		expect(res.status).toBe(200);
		const raw = await res.text();
		expect(raw).not.toContain('Secret Widening');
		expect(raw).not.toContain(secret.id);
		const body = JSON.parse(raw) as { conflicts: Array<{ a: { jobName: string }; b: { jobName: string } }> };
		expect(body.conflicts.length).toBe(1);
		const names = [body.conflicts[0].a.jobName, body.conflicts[0].b.jobName].sort();
		expect(names).toEqual(['Another project', 'My Overlay']);
	});
});
