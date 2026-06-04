/**
 * Unit tests for src/lib/server/rate-limit.ts
 *
 * Uses an in-memory better-sqlite3 database with the rate_limits schema applied
 * directly so we can test the sliding-window logic without any network or KV
 * dependencies. The D1Database interface is fulfilled by a thin synchronous
 * wrapper (same pattern as tests/helpers/db.ts).
 */
import Database from 'better-sqlite3';
import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit } from '../rate-limit.js';

// ── Minimal D1-compatible shim (no migrations runner, just one table) ─────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  window_start INTEGER NOT NULL,
  PRIMARY KEY (ip, endpoint)
);
`;

function buildD1(db: Database.Database) {
	function wrapStmt(query: string, boundValues: unknown[]) {
		const stmt: any = {
			bind(...values: unknown[]) {
				return wrapStmt(query, values);
			},
			async first<T = unknown>(): Promise<T | null> {
				const prepared = db.prepare(query);
				const row = prepared.get(...(boundValues as Parameters<typeof prepared.get>));
				return (row as T) ?? null;
			},
			async all<T = unknown>() {
				const prepared = db.prepare(query);
				const rows = prepared.all(...(boundValues as Parameters<typeof prepared.all>));
				return { results: rows as T[], success: true, meta: {} };
			},
			async run() {
				const prepared = db.prepare(query);
				prepared.run(...(boundValues as Parameters<typeof prepared.run>));
				return { results: [], success: true, meta: {} };
			}
		};
		return stmt;
	}

	return {
		prepare(query: string) {
			return wrapStmt(query, []);
		}
	};
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

const IP = '1.2.3.4';
const ENDPOINT = '/api/auth/login';
const MAX = 5;
const WINDOW = 60; // seconds

let raw: Database.Database;
let d1: ReturnType<typeof buildD1>;

function nowSec() {
	return Math.floor(Date.now() / 1000);
}

/**
 * Insert a rate_limit record at a given window_start with a given count.
 * Useful for seeding state before testing overrun / expiry scenarios.
 */
function seedRecord(ip: string, endpoint: string, count: number, windowStart: number) {
	raw
		.prepare(
			'INSERT OR REPLACE INTO rate_limits (ip, endpoint, count, window_start) VALUES (?, ?, ?, ?)'
		)
		.run(ip, endpoint, count, windowStart);
}

beforeEach(() => {
	raw = new Database(':memory:');
	raw.exec(SCHEMA);
	d1 = buildD1(raw);
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
	describe('first request (no existing record)', () => {
		it('allows the first request and creates a record', async () => {
			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			expect(result.allowed).toBe(true);
			expect(result.retryAfter).toBeUndefined();

			const row = raw
				.prepare('SELECT count FROM rate_limits WHERE ip = ? AND endpoint = ?')
				.get(IP, ENDPOINT) as { count: number } | undefined;
			expect(row?.count).toBe(1);
		});
	});

	describe('requests within the limit', () => {
		it('allows consecutive requests up to maxAttempts', async () => {
			for (let i = 0; i < MAX; i++) {
				const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);
				expect(result.allowed).toBe(true);
			}

			const row = raw
				.prepare('SELECT count FROM rate_limits WHERE ip = ? AND endpoint = ?')
				.get(IP, ENDPOINT) as { count: number } | undefined;
			expect(row?.count).toBe(MAX);
		});
	});

	describe('requests over the limit', () => {
		it('returns allowed=false when count equals maxAttempts', async () => {
			// Pre-seed to exactly maxAttempts
			seedRecord(IP, ENDPOINT, MAX, nowSec());

			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			expect(result.allowed).toBe(false);
		});

		it('includes a positive retryAfter when rate limited', async () => {
			seedRecord(IP, ENDPOINT, MAX, nowSec());

			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			expect(result.retryAfter).toBeGreaterThan(0);
			expect(result.retryAfter).toBeLessThanOrEqual(WINDOW);
		});

		it('rejects a (MAX + 1)th attempt that would push count over limit', async () => {
			// Drive the counter to MAX via real checkRateLimit calls
			for (let i = 0; i < MAX; i++) {
				await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);
			}
			// Next call must be denied
			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);
			expect(result.allowed).toBe(false);
		});
	});

	describe('exactly-at-limit edge case', () => {
		it('allows the maxAttempts-th request itself (count goes from MAX-1 to MAX)', async () => {
			// Seed with count = MAX - 1 so the next call is the last allowed one
			seedRecord(IP, ENDPOINT, MAX - 1, nowSec());

			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);
			expect(result.allowed).toBe(true);
		});

		it('denies the request immediately after reaching the limit', async () => {
			seedRecord(IP, ENDPOINT, MAX - 1, nowSec());
			// Last allowed
			await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);
			// Now over limit
			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);
			expect(result.allowed).toBe(false);
		});
	});

	describe('window expiry / reset behavior', () => {
		it('allows a new request after the window has fully expired', async () => {
			// Seed a record that is well outside the current window
			const expiredWindowStart = nowSec() - WINDOW - 10;
			seedRecord(IP, ENDPOINT, MAX, expiredWindowStart);

			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			expect(result.allowed).toBe(true);
		});

		it('resets count to 1 after window expiry', async () => {
			const expiredWindowStart = nowSec() - WINDOW - 10;
			seedRecord(IP, ENDPOINT, MAX, expiredWindowStart);

			await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			const row = raw
				.prepare('SELECT count FROM rate_limits WHERE ip = ? AND endpoint = ?')
				.get(IP, ENDPOINT) as { count: number } | undefined;
			expect(row?.count).toBe(1);
		});

		it('cleans up expired records for the same endpoint on each call', async () => {
			// Insert a stale record for a different IP on the same endpoint
			const staleIp = '9.9.9.9';
			const expiredWindowStart = nowSec() - WINDOW - 10;
			seedRecord(staleIp, ENDPOINT, 3, expiredWindowStart);

			await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			const staleRow = raw
				.prepare('SELECT count FROM rate_limits WHERE ip = ? AND endpoint = ?')
				.get(staleIp, ENDPOINT);
			expect(staleRow).toBeUndefined();
		});

		it('does not clean up records that are still within their window', async () => {
			// Insert a fresh record for another IP
			const otherIp = '5.6.7.8';
			seedRecord(otherIp, ENDPOINT, 2, nowSec());

			await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			const otherRow = raw
				.prepare('SELECT count FROM rate_limits WHERE ip = ? AND endpoint = ?')
				.get(otherIp, ENDPOINT);
			expect(otherRow).toBeDefined();
		});
	});

	describe('sliding window logic', () => {
		it('does not reset when window_start is very recent (well within window)', async () => {
			const recentWindowStart = nowSec() - Math.floor(WINDOW / 2);
			seedRecord(IP, ENDPOINT, 2, recentWindowStart);

			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			// count was 2, still < MAX (5), so should be allowed and counter incremented
			expect(result.allowed).toBe(true);

			const row = raw
				.prepare('SELECT count FROM rate_limits WHERE ip = ? AND endpoint = ?')
				.get(IP, ENDPOINT) as { count: number } | undefined;
			expect(row?.count).toBe(3);
		});

		it('treats different endpoints independently', async () => {
			const endpoint2 = '/api/auth/register';
			seedRecord(IP, ENDPOINT, MAX, nowSec());

			const result = await checkRateLimit(d1 as any, IP, endpoint2, MAX, WINDOW);
			expect(result.allowed).toBe(true);
		});

		it('treats different IPs independently on the same endpoint', async () => {
			const ip2 = '8.8.8.8';
			seedRecord(IP, ENDPOINT, MAX, nowSec());

			const result = await checkRateLimit(d1 as any, ip2, ENDPOINT, MAX, WINDOW);
			expect(result.allowed).toBe(true);
		});

		it('retryAfter approaches 0 as the window nears expiry', async () => {
			// Window started just under WINDOW seconds ago (1 second left)
			const almostExpiredWindowStart = nowSec() - WINDOW + 1;
			seedRecord(IP, ENDPOINT, MAX, almostExpiredWindowStart);

			const result = await checkRateLimit(d1 as any, IP, ENDPOINT, MAX, WINDOW);

			expect(result.allowed).toBe(false);
			// retryAfter should be very small (0 or 1)
			expect(result.retryAfter).toBeLessThanOrEqual(2);
		});
	});
});
