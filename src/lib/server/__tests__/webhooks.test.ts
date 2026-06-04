/**
 * Unit tests for src/lib/server/webhooks.ts
 *
 * Tests: payload structure, HMAC signature generation, delivery status tracking,
 * retry logic, and event-type filtering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Minimal D1 mock ────────────────────────────────────────────────────────────

interface MockRow {
	[key: string]: unknown;
}

function makeMockDb(webhooks: MockRow[] = [], deliveryUpdates: MockRow[] = []) {
	const runs: { sql: string; values: unknown[] }[] = [];
	const inserts: { sql: string; values: unknown[] }[] = [];

	const self = {
		_runs: runs,
		_inserts: inserts,
		prepare(sql: string) {
			return {
				bind(...values: unknown[]) {
					return {
						async run() {
							if (/^INSERT/i.test(sql)) {
								inserts.push({ sql, values });
							} else {
								runs.push({ sql, values });
							}
							return { success: true, results: [], meta: {} };
						},
						async first<T>(): Promise<T | null> {
							return null;
						},
						async all<T>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }> {
							// Return webhooks for the SELECT query
							if (/SELECT.*FROM webhooks/i.test(sql)) {
								return { results: webhooks as T[], success: true, meta: {} };
							}
							return { results: [], success: true, meta: {} };
						}
					};
				}
			};
		}
	};
	return self;
}

// ── Re-export internal helpers via module-level test ─────────────────────────
// We test the exported API surface, plus we extract signPayload behavior
// by testing the X-PaveRate-Signature header that fetch receives.

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateWebhookSecret', () => {
	it('returns a 64-char hex string', async () => {
		const { generateWebhookSecret } = await import('../webhooks.js');
		const secret = generateWebhookSecret();
		expect(secret).toMatch(/^[0-9a-f]{64}$/);
	});

	it('returns a different value each call', async () => {
		const { generateWebhookSecret } = await import('../webhooks.js');
		const a = generateWebhookSecret();
		const b = generateWebhookSecret();
		expect(a).not.toBe(b);
	});
});

describe('deliverWebhook — no active webhooks', () => {
	it('returns early when no webhooks exist for the org', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const db = makeMockDb([]) as unknown as import('../../cloudflare').D1Database;
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'job_site.created',
			orgId: 'org-1',
			payload: { id: 'site-1' },
			occurredAt: 1000000
		});

		expect(fetchSpy).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});

describe('deliverWebhook — event type filtering', () => {
	it('does not deliver when webhook events list does not include the event type', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const webhook = {
			id: 'wh-1',
			org_id: 'org-1',
			url: 'https://example.com/hook',
			secret: 'abc123',
			events: JSON.stringify(['log.closed']), // not job_site.created
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		};
		const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'job_site.created',
			orgId: 'org-1',
			payload: { id: 'site-1' },
			occurredAt: 1000000
		});

		// Give fire-and-forget promises a chance to settle
		await new Promise((r) => setTimeout(r, 20));
		expect(fetchSpy).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it('delivers when webhook events list includes the event type', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const webhook = {
			id: 'wh-2',
			org_id: 'org-1',
			url: 'https://example.com/hook',
			secret: 'abc123',
			events: JSON.stringify(['job_site.created', 'log.closed']),
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		};
		const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;
		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => 'OK'
		});
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'job_site.created',
			orgId: 'org-1',
			payload: { id: 'site-1' },
			occurredAt: 1000000
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(fetchSpy).toHaveBeenCalledOnce();
		vi.unstubAllGlobals();
	});
});

describe('deliverWebhook — payload structure', () => {
	const EVENT_TYPES = [
		'job_site.created',
		'log.closed',
		'load.recorded',
		'org.updated',
		'webhook.test'
	] as const;

	for (const eventType of EVENT_TYPES) {
		it(`sends correct payload structure for ${eventType}`, async () => {
			const { deliverWebhook } = await import('../webhooks.js');
			const webhook = {
				id: 'wh-struct',
				org_id: 'org-42',
				url: 'https://hook.example/receive',
				secret: 'super-secret-key',
				events: JSON.stringify([eventType]),
				description: 'test webhook',
				is_active: 1,
				created_by: 'user-1',
				created_at: 1000,
				updated_at: 1000
			};
			const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;

			let capturedBody: unknown;
			const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
				capturedBody = JSON.parse(init.body as string);
				return { ok: true, status: 200, text: async () => 'OK' };
			});
			vi.stubGlobal('fetch', fetchSpy);

			const occurredAt = 1700000000;
			await deliverWebhook(db, {
				type: eventType,
				orgId: 'org-42',
				payload: { sampleField: 'value', count: 7 },
				occurredAt
			});

			await new Promise((r) => setTimeout(r, 20));
			expect(fetchSpy).toHaveBeenCalledOnce();

			// Validate payload shape
			const body = capturedBody as {
				id: string;
				event: string;
				org_id: string;
				occurred_at: number;
				data: Record<string, unknown>;
			};
			expect(typeof body.id).toBe('string');
			expect(body.id).toMatch(/^[0-9a-f-]{36}$/); // UUID
			expect(body.event).toBe(eventType);
			expect(body.org_id).toBe('org-42');
			expect(body.occurred_at).toBe(occurredAt);
			expect(body.data).toEqual({ sampleField: 'value', count: 7 });

			vi.unstubAllGlobals();
		});
	}
});

describe('deliverWebhook — HMAC signature', () => {
	it('sends X-PaveRate-Signature header on delivery', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const secret = 'test-secret-for-hmac';
		const webhook = {
			id: 'wh-sig',
			org_id: 'org-sig',
			url: 'https://sig.example/hook',
			secret,
			events: JSON.stringify(['load.recorded']),
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		};
		const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;

		let capturedHeaders: Record<string, string> = {};
		let capturedBody = '';
		const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
			capturedHeaders = init.headers as Record<string, string>;
			capturedBody = init.body as string;
			return { ok: true, status: 200, text: async () => 'OK' };
		});
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'load.recorded',
			orgId: 'org-sig',
			payload: { loadId: 'load-99' },
			occurredAt: 1700000001
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(fetchSpy).toHaveBeenCalledOnce();

		// Signature must be present and be a 64-char hex string
		const sig = capturedHeaders['X-PaveRate-Signature'];
		expect(sig).toBeDefined();
		expect(sig).toMatch(/^[0-9a-f]{64}$/);

		// Verify the signature is correct by re-computing it
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(secret),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const rawSig = await crypto.subtle.sign('HMAC', key, encoder.encode(capturedBody));
		const expectedSig = Array.from(new Uint8Array(rawSig))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		expect(sig).toBe(expectedSig);

		vi.unstubAllGlobals();
	});

	it('different secrets produce different signatures for same payload', async () => {
		const { deliverWebhook } = await import('../webhooks.js');

		const sigs: string[] = [];

		for (const secret of ['secret-A', 'secret-B']) {
			const webhook = {
				id: `wh-${secret}`,
				org_id: 'org-diff',
				url: 'https://diff.example/hook',
				secret,
				events: JSON.stringify(['log.closed']),
				description: null,
				is_active: 1,
				created_by: null,
				created_at: 1000,
				updated_at: 1000
			};
			const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;

			let sig = '';
			const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
				sig = (init.headers as Record<string, string>)['X-PaveRate-Signature'];
				return { ok: true, status: 200, text: async () => 'OK' };
			});
			vi.stubGlobal('fetch', fetchSpy);

			await deliverWebhook(db, {
				type: 'log.closed',
				orgId: 'org-diff',
				payload: { logId: 'log-1' },
				occurredAt: 1700000002
			});

			await new Promise((r) => setTimeout(r, 20));
			sigs.push(sig);
			vi.unstubAllGlobals();
		}

		expect(sigs[0]).toBeDefined();
		expect(sigs[1]).toBeDefined();
		expect(sigs[0]).not.toBe(sigs[1]);
	});
});

describe('deliverWebhook — delivery status tracking', () => {
	it('inserts a pending delivery record before the HTTP call', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const webhook = {
			id: 'wh-track',
			org_id: 'org-track',
			url: 'https://track.example/hook',
			secret: 'track-secret',
			events: JSON.stringify(['job_site.created']),
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		};
		const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;
		const rawDb = db as unknown as ReturnType<typeof makeMockDb>;

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => 'OK'
		});
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'job_site.created',
			orgId: 'org-track',
			payload: { id: 'site-new' },
			occurredAt: 1700000003
		});

		await new Promise((r) => setTimeout(r, 20));

		// There should be at least one INSERT into webhook_deliveries
		const deliveryInsert = rawDb._inserts.find((r) =>
			/webhook_deliveries/i.test(r.sql)
		);
		expect(deliveryInsert).toBeDefined();
		// Status should start as 'pending'
		expect(deliveryInsert!.values).toContain('pending');
		// Attempt count should be 0 on insert
		expect(deliveryInsert!.values).toContain(0);

		vi.unstubAllGlobals();
	});

	it('updates delivery record to delivered on HTTP 200', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const webhook = {
			id: 'wh-200',
			org_id: 'org-200',
			url: 'https://ok.example/hook',
			secret: 'ok-secret',
			events: JSON.stringify(['load.recorded']),
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		};
		const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;
		const rawDb = db as unknown as ReturnType<typeof makeMockDb>;

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => 'accepted'
		});
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'load.recorded',
			orgId: 'org-200',
			payload: { loadId: 'load-2' },
			occurredAt: 1700000004
		});

		await new Promise((r) => setTimeout(r, 20));

		const updateRun = rawDb._runs.find(
			(r) => /UPDATE webhook_deliveries/i.test(r.sql)
		);
		expect(updateRun).toBeDefined();
		expect(updateRun!.values).toContain('delivered');
		expect(updateRun!.values).toContain(200);

		vi.unstubAllGlobals();
	});

	it('updates delivery record to failed on HTTP 4xx/5xx', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const webhook = {
			id: 'wh-500',
			org_id: 'org-500',
			url: 'https://err.example/hook',
			secret: 'err-secret',
			events: JSON.stringify(['log.closed']),
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		};
		const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;
		const rawDb = db as unknown as ReturnType<typeof makeMockDb>;

		const fetchSpy = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			text: async () => 'Internal Server Error'
		});
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'log.closed',
			orgId: 'org-500',
			payload: { logId: 'log-x' },
			occurredAt: 1700000005
		});

		await new Promise((r) => setTimeout(r, 20));

		const updateRun = rawDb._runs.find(
			(r) => /UPDATE webhook_deliveries/i.test(r.sql)
		);
		expect(updateRun).toBeDefined();
		expect(updateRun!.values).toContain('failed');
		expect(updateRun!.values).toContain(500);

		vi.unstubAllGlobals();
	});

	it('updates delivery record to failed on network error', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const webhook = {
			id: 'wh-net',
			org_id: 'org-net',
			url: 'https://gone.example/hook',
			secret: 'net-secret',
			events: JSON.stringify(['job_site.created']),
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		};
		const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;
		const rawDb = db as unknown as ReturnType<typeof makeMockDb>;

		const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'job_site.created',
			orgId: 'org-net',
			payload: { id: 'site-net' },
			occurredAt: 1700000006
		});

		await new Promise((r) => setTimeout(r, 20));

		const updateRun = rawDb._runs.find(
			(r) => /UPDATE webhook_deliveries/i.test(r.sql)
		);
		expect(updateRun).toBeDefined();
		expect(updateRun!.values).toContain('failed');
		// Error message should be stored
		const values = updateRun!.values as string[];
		const hasErrMsg = values.some((v) => typeof v === 'string' && v.includes('ECONNREFUSED'));
		expect(hasErrMsg).toBe(true);

		vi.unstubAllGlobals();
	});
});

describe('deliverWebhook — request headers', () => {
	it('sends Content-Type: application/json', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const webhook = {
			id: 'wh-ct',
			org_id: 'org-ct',
			url: 'https://ct.example/hook',
			secret: 'ct-secret',
			events: JSON.stringify(['load.recorded']),
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		};
		const db = makeMockDb([webhook]) as unknown as import('../../cloudflare').D1Database;

		let headers: Record<string, string> = {};
		const fetchSpy = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
			headers = init.headers as Record<string, string>;
			return { ok: true, status: 200, text: async () => 'OK' };
		});
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'load.recorded',
			orgId: 'org-ct',
			payload: { loadId: 'l-3' },
			occurredAt: 1700000007
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(headers['Content-Type']).toBe('application/json');
		expect(headers['User-Agent']).toBe('PaveRate-Webhooks/1.0');

		vi.unstubAllGlobals();
	});
});

describe('deliverWebhook — multiple subscribers', () => {
	it('delivers to all matching webhooks for the org', async () => {
		const { deliverWebhook } = await import('../webhooks.js');
		const makeWebhook = (id: string, url: string) => ({
			id,
			org_id: 'org-multi',
			url,
			secret: `secret-${id}`,
			events: JSON.stringify(['org.updated']),
			description: null,
			is_active: 1,
			created_by: null,
			created_at: 1000,
			updated_at: 1000
		});
		const db = makeMockDb([
			makeWebhook('wh-m1', 'https://a.example/hook'),
			makeWebhook('wh-m2', 'https://b.example/hook')
		]) as unknown as import('../../cloudflare').D1Database;

		const calledUrls: string[] = [];
		const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
			calledUrls.push(url as string);
			return { ok: true, status: 200, text: async () => 'OK' };
		});
		vi.stubGlobal('fetch', fetchSpy);

		await deliverWebhook(db, {
			type: 'org.updated',
			orgId: 'org-multi',
			payload: { name: 'Acme Paving' },
			occurredAt: 1700000008
		});

		await new Promise((r) => setTimeout(r, 20));
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		expect(calledUrls).toContain('https://a.example/hook');
		expect(calledUrls).toContain('https://b.example/hook');

		vi.unstubAllGlobals();
	});
});
