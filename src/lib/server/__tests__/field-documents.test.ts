import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../tests/helpers/request.js';
import { createTestUser } from '../../../../tests/fixtures/users.js';
import { createTestOrg, createTestMembership } from '../../../../tests/fixtures/orgs.js';
import { createTestJobSite } from '../../../../tests/fixtures/job-sites.js';
import { extractFieldDocument } from '../field-documents.js';
import { POST as fieldDocuments } from '../../../routes/api/job-sites/[id]/field-documents/+server.js';

const TICKET = `WEIGHT TICKET
Ticket No: 44192
Date: 2026-06-02
Time: 7:15 AM
Truck: T-18
Mix: 12.5 mm SP
Net Tons: 22.4
`;

const CERT = `MATERIAL CERTIFICATION
Material: GAB
Spec: GDOT 815
Supplier: Macon Quarry
Category: aggregate
`;

const DAILY = `DAILY REPORT
Date: 06/03/2026
Weather: clear
Temp: 78
Crew count: 6
Tons placed: 410
Notes: Mainline overlay
`;

describe('extractFieldDocument', () => {
	it('reads tons, mix, truck, and time from a weight ticket', () => {
		const draft = extractFieldDocument(TICKET);
		expect(draft?.kind).toBe('weight_ticket');
		if (draft?.kind !== 'weight_ticket') return;
		expect(draft.fields.tons).toBe(22.4);
		expect(draft.fields.mix).toBe('12.5 mm SP');
		expect(draft.fields.truck).toBe('T-18');
		expect(draft.fields.ticket_number).toBe('44192');
		expect(draft.fields.time).toBe('07:15');
		expect(draft.fields.date).toBe('2026-06-02');
	});

	it('reads a material certification', () => {
		const draft = extractFieldDocument(CERT);
		expect(draft?.kind).toBe('material_certification');
		if (draft?.kind !== 'material_certification') return;
		expect(draft.fields.material).toBe('GAB');
		expect(draft.fields.supplier).toBe('Macon Quarry');
		expect(draft.fields.category).toBe('aggregate');
	});

	it('reads a daily report', () => {
		const draft = extractFieldDocument(DAILY);
		expect(draft?.kind).toBe('daily_report');
		if (draft?.kind !== 'daily_report') return;
		expect(draft.fields.date).toBe('2026-06-03');
		expect(draft.fields.tons).toBe(410);
		expect(draft.fields.weather).toBe('clear');
		expect(draft.fields.crew_count).toBe(6);
	});
});

describe('field document confirm', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('does not write a load until the reviewed ticket is confirmed', async () => {
		const user = await createTestUser(db, { email: 'ticket@example.com', name: 'Ticket User' });
		const org = await createTestOrg(db, { slug: 'ticket-org' });
		await createTestMembership(db, user.id, org.id, { role: 'foreman' });
		const site = await createTestJobSite(db, org.id);
		const sessionId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
			.bind(sessionId, user.id, now + 3600, now)
			.run();

		const preview = mockRequestEvent({
			db: db.d1,
			method: 'POST',
			params: { id: site.id },
			cookies: { paverate_session: sessionId },
			body: { action: 'preview', text: TICKET }
		});
		const previewRes = await fieldDocuments(preview as any);
		expect(previewRes.status).toBe(200);
		const before = await db.d1.prepare('SELECT COUNT(*) AS c FROM loads').first<{ c: number }>();
		expect(before?.c).toBe(0);

		const draft = extractFieldDocument(TICKET);
		const commit = mockRequestEvent({
			db: db.d1,
			method: 'POST',
			params: { id: site.id },
			cookies: { paverate_session: sessionId },
			body: { action: 'commit', kind: draft?.kind, fields: draft && 'fields' in draft ? draft.fields : {} }
		});
		const commitRes = await fieldDocuments(commit as any);
		expect(commitRes.status).toBe(201);
		const load = await db.d1
			.prepare('SELECT tons, ticket_number, notes FROM loads WHERE job_site_id = ?')
			.bind(site.id)
			.first<{ tons: number; ticket_number: string; notes: string }>();
		expect(load?.tons).toBe(22.4);
		expect(load?.ticket_number).toBe('44192');
		expect(load?.notes).toContain('12.5 mm SP');
	});

	it('saves a reviewed daily report as a log entry', async () => {
		const user = await createTestUser(db, { email: 'daily@example.com', name: 'Daily User' });
		const org = await createTestOrg(db, { slug: 'daily-org' });
		await createTestMembership(db, user.id, org.id, { role: 'admin' });
		const site = await createTestJobSite(db, org.id);
		const sessionId = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await db.d1
			.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
			.bind(sessionId, user.id, now + 3600, now)
			.run();
		const draft = extractFieldDocument(DAILY);
		const event = mockRequestEvent({
			db: db.d1,
			method: 'POST',
			params: { id: site.id },
			cookies: { paverate_session: sessionId },
			body: { action: 'commit', kind: 'daily_report', fields: draft && 'fields' in draft ? draft.fields : {} }
		});
		const res = await fieldDocuments(event as any);
		expect(res.status).toBe(201);
		const entry = await db.d1
			.prepare(
				`SELECT le.tons_placed, dl.log_date, dl.weather_conditions
				 FROM log_entries le JOIN daily_logs dl ON dl.id = le.daily_log_id
				 WHERE dl.job_site_id = ?`
			)
			.bind(site.id)
			.first<{ tons_placed: number; log_date: string; weather_conditions: string }>();
		expect(entry?.tons_placed).toBe(410);
		expect(entry?.log_date).toBe('2026-06-03');
		expect(entry?.weather_conditions).toBe('clear');
	});
});
