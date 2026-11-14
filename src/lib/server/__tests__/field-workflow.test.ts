import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../tests/helpers/request.js';
import { createTestUser } from '../../../../tests/fixtures/users.js';
import { createTestOrg, createTestMembership } from '../../../../tests/fixtures/orgs.js';
import { createTestJobSite } from '../../../../tests/fixtures/job-sites.js';
import { POST as createCalc } from '../../../routes/api/calculations/+server.js';
import { POST as createEntry } from '../../../routes/api/job-sites/[id]/logs/[logId]/entries/+server.js';

async function sessionFor(db: TestDb, userId: string): Promise<string> {
	const sessionId = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	await db.d1
		.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
		.bind(sessionId, userId, now + 3600, now)
		.run();
	return sessionId;
}

async function call(
	handler: (event: never) => Promise<Response>,
	event: unknown
): Promise<{ status: number }> {
	try {
		const res = await handler(event as never);
		return { status: res.status };
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err && typeof err.status === 'number') {
			return { status: err.status };
		}
		throw err;
	}
}

describe('field workflow guards', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('refuses a calculation on a project the laborer is not crewed on', async () => {
		const user = await createTestUser(db, { email: 'calc-labor@example.com', name: 'Labor' });
		const org = await createTestOrg(db, { slug: 'calc-org' });
		await createTestMembership(db, user.id, org.id, { role: 'laborer' });
		const site = await createTestJobSite(db, org.id, { name: 'Unassigned' });
		const sessionId = await sessionFor(db, user.id);
		const event = mockRequestEvent({
			db: db.d1,
			method: 'POST',
			cookies: { paverate_session: sessionId },
			body: {
				job_site_id: site.id,
				calc_type: 'feet_left',
				inputs: { station_start: 1, station_end: 2 },
				result: { feet: 100 }
			}
		});
		const res = await createCalc(event as any);
		expect(res.status).toBe(403);
	});

	it('does not write a log entry onto a different project than the URL', async () => {
		const user = await createTestUser(db, { email: 'log-labor@example.com', name: 'Labor' });
		const org = await createTestOrg(db, { slug: 'log-org' });
		await createTestMembership(db, user.id, org.id, { role: 'admin' });
		const allowed = await createTestJobSite(db, org.id, { name: 'Allowed' });
		const other = await createTestJobSite(db, org.id, { name: 'Other' });
		const now = Math.floor(Date.now() / 1000);
		const logId = crypto.randomUUID();
		await db.d1
			.prepare(
				`INSERT INTO daily_logs (id, job_site_id, log_date, created_by, created_at, updated_at)
				 VALUES (?, ?, '2026-06-02', ?, ?, ?)`
			)
			.bind(logId, other.id, user.id, now, now)
			.run();
		const sessionId = await sessionFor(db, user.id);
		const event = mockRequestEvent({
			db: db.d1,
			method: 'POST',
			params: { id: allowed.id, logId },
			cookies: { paverate_session: sessionId },
			body: { entry_type: 'paving', timestamp: '08:00', tons_placed: 12 }
		});
		(event as { locals: { user: { id: string; isGlobalAdmin?: boolean } } }).locals = {
			user: { id: user.id, isGlobalAdmin: false }
		};
		const res = await call(createEntry as never, event);
		expect(res.status).toBe(404);
		const count = await db.d1.prepare('SELECT COUNT(*) AS c FROM log_entries').first<{ c: number }>();
		expect(count?.c).toBe(0);
	});

	it('rejects a log entry with a negative tonnage', async () => {
		const user = await createTestUser(db, { email: 'tons-admin@example.com', name: 'Admin' });
		const org = await createTestOrg(db, { slug: 'tons-org' });
		await createTestMembership(db, user.id, org.id, { role: 'admin' });
		const site = await createTestJobSite(db, org.id);
		const now = Math.floor(Date.now() / 1000);
		const logId = crypto.randomUUID();
		await db.d1
			.prepare(
				`INSERT INTO daily_logs (id, job_site_id, log_date, created_by, created_at, updated_at)
				 VALUES (?, ?, '2026-06-02', ?, ?, ?)`
			)
			.bind(logId, site.id, user.id, now, now)
			.run();
		const sessionId = await sessionFor(db, user.id);
		const event = mockRequestEvent({
			db: db.d1,
			method: 'POST',
			params: { id: site.id, logId },
			cookies: { paverate_session: sessionId },
			body: { entry_type: 'paving', timestamp: '08:00', tons_placed: -4 }
		});
		(event as { locals: { user: { id: string } } }).locals = { user: { id: user.id } };
		const res = await call(createEntry as never, event);
		expect(res.status).toBe(400);
	});
});
