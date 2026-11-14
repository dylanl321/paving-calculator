import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createTestDb, type TestDb } from '../../../../tests/helpers/db.js';
import { createTestUser } from '../../../../tests/fixtures/users.js';
import { createTestOrg, createTestMembership } from '../../../../tests/fixtures/orgs.js';
import { notifyOrg, type OutboundNotice } from '../notify.js';
import { extractFieldDocumentSmart } from '../field-documents.js';

describe('notifyOrg', () => {
	let db: TestDb;

	beforeEach(() => {
		db = createTestDb();
	});
	afterEach(() => db.close());

	it('emails office roles for a submitted log and skips someone who opted out', async () => {
		const org = await createTestOrg(db, { slug: 'notice-org' });
		const office = await createTestUser(db, { email: 'office-notice@example.com', name: 'Office' });
		const owner = await createTestUser(db, { email: 'owner-notice@example.com', name: 'Owner' });
		const laborer = await createTestUser(db, { email: 'labor-notice@example.com', name: 'Labor' });
		await createTestMembership(db, office.id, org.id, { role: 'office' });
		await createTestMembership(db, owner.id, org.id, { role: 'owner' });
		await createTestMembership(db, laborer.id, org.id, { role: 'laborer' });
		await db.d1
			.prepare(
				`INSERT INTO user_notification_prefs (user_id, pref_key, enabled, updated_at) VALUES (?, 'email_daily_summary', 0, 1)`
			)
			.bind(owner.id)
			.run();

		const sent: OutboundNotice[] = [];
		const result = await notifyOrg(
			db.d1,
			{
				orgId: org.id,
				eventKey: 'daily_log:1',
				eventType: 'daily_log_submitted',
				subject: 'Log submitted',
				text: 'The log is in.'
			},
			{ async send(message) { sent.push(message); } }
		);
		expect(result.skipped).toBeNull();
		expect(sent.map((m) => m.to)).toEqual(['office-notice@example.com']);

		const again = await notifyOrg(
			db.d1,
			{
				orgId: org.id,
				eventKey: 'daily_log:1',
				eventType: 'daily_log_submitted',
				subject: 'Log submitted',
				text: 'The log is in.'
			},
			{ async send() { throw new Error('should not send twice'); } }
		);
		expect(again.skipped).toBe('duplicate');
	});

	it('notifies only the assigned crew for a crew assignment', async () => {
		const org = await createTestOrg(db, { slug: 'crew-notice' });
		const onCrew = await createTestUser(db, { email: 'on-crew@example.com', name: 'On' });
		const offCrew = await createTestUser(db, { email: 'off-crew@example.com', name: 'Off' });
		await createTestMembership(db, onCrew.id, org.id, { role: 'foreman' });
		await createTestMembership(db, offCrew.id, org.id, { role: 'foreman' });
		const sent: string[] = [];
		await notifyOrg(
			db.d1,
			{
				orgId: org.id,
				eventKey: 'crew_assigned:c:j',
				eventType: 'crew_assigned',
				subject: 'Assigned',
				text: 'You are on the job.',
				onlyUserIds: [onCrew.id]
			},
			{ async send(message) { sent.push(message.to); } }
		);
		expect(sent).toEqual(['on-crew@example.com']);
	});
});

describe('extractFieldDocumentSmart', () => {
	it('uses the model when labeled text does not yield a usable ticket', async () => {
		const scanned = 'blurred scan without field labels';
		const draft = await extractFieldDocumentSmart(scanned, {
			async complete() {
				return JSON.stringify({
					kind: 'weight_ticket',
					fields: {
						tons: 19.2,
						mix: '12.5 mm',
						truck: 'T-9',
						ticket_number: '88',
						time: '09:40',
						date: '2026-07-01'
					}
				});
			}
		});
		expect(draft?.kind).toBe('weight_ticket');
		if (draft?.kind === 'weight_ticket') expect(draft.fields.tons).toBe(19.2);
	});

	it('keeps the labeled result when the model fails', async () => {
		const text = 'WEIGHT TICKET\nNet Tons: 10\nMix: SP\nTruck: T-1\nTicket No: 5\n';
		const draft = await extractFieldDocumentSmart(text, {
			async complete() {
				throw new Error('model down');
			}
		});
		expect(draft?.kind).toBe('weight_ticket');
		if (draft?.kind === 'weight_ticket') expect(draft.fields.tons).toBe(10);
	});
});
