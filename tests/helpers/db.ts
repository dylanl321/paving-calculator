/**
 * tests/helpers/db.ts
 *
 * D1-compatible in-memory SQLite helper for integration tests.
 * Reads all migrations/00*.sql files (sorted), executes them on better-sqlite3,
 * and wraps the DB in an object that matches the Cloudflare D1Database API shape
 * used by src/lib/server/db.ts (.prepare().bind().first()/.all()/.run()).
 */

import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

// ── Types mirroring the D1 API ────────────────────────────────────────────────

export interface D1Result<T = unknown> {
	results: T[];
	success: boolean;
	meta: Record<string, unknown>;
}

export interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	first<T = unknown>(): Promise<T | null>;
	all<T = unknown>(): Promise<D1Result<T>>;
	run(): Promise<D1Result>;
}

export interface D1DatabaseCompat {
	prepare(query: string): D1PreparedStatement;
}

// ── Migration runner ──────────────────────────────────────────────────────────

const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');

function getMigrationFiles(): string[] {
	try {
		return readdirSync(MIGRATIONS_DIR)
			.filter((f) => /^00\d+_.+\.sql$/.test(f))
			.sort()
			.map((f) => join(MIGRATIONS_DIR, f));
	} catch {
		// fallback: try relative from the test file location
		const alt = resolve(__dirname, '../../migrations');
		return readdirSync(alt)
			.filter((f) => /^00\d+_.+\.sql$/.test(f))
			.sort()
			.map((f) => join(alt, f));
	}
}

function runMigrations(db: Database.Database): void {
	const files = getMigrationFiles();
	for (const file of files) {
		const sql = readFileSync(file, 'utf-8');
		// Execute each statement individually to handle multi-statement SQL files
		// better-sqlite3 exec() handles multiple statements separated by semicolons
		try {
			db.exec(sql);
		} catch (err) {
			throw new Error(`Migration failed in ${file}: ${(err as Error).message}`);
		}
	}
}

// ── D1-compatible wrapper ─────────────────────────────────────────────────────

function wrapStatement(
	db: Database.Database,
	query: string,
	boundValues: unknown[]
): D1PreparedStatement {
	const stmt: D1PreparedStatement = {
		bind(...values: unknown[]): D1PreparedStatement {
			return wrapStatement(db, query, values);
		},

		async first<T = unknown>(): Promise<T | null> {
			try {
				const prepared = db.prepare(query);
				const row = prepared.get(...(boundValues as Parameters<typeof prepared.get>)) as T | undefined;
				return row ?? null;
			} catch (err) {
				throw new Error(`D1 first() error for query "${query}": ${(err as Error).message}`);
			}
		},

		async all<T = unknown>(): Promise<D1Result<T>> {
			try {
				const prepared = db.prepare(query);
				const rows = prepared.all(...(boundValues as Parameters<typeof prepared.all>)) as T[];
				return { results: rows, success: true, meta: {} };
			} catch (err) {
				throw new Error(`D1 all() error for query "${query}": ${(err as Error).message}`);
			}
		},

		async run(): Promise<D1Result> {
			try {
				const prepared = db.prepare(query);
				prepared.run(...(boundValues as Parameters<typeof prepared.run>));
				return { results: [], success: true, meta: {} };
			} catch (err) {
				throw new Error(`D1 run() error for query "${query}": ${(err as Error).message}`);
			}
		}
	};

	return stmt;
}

function createD1Compat(db: Database.Database): D1DatabaseCompat {
	return {
		prepare(query: string): D1PreparedStatement {
			return wrapStatement(db, query, []);
		}
	};
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TestDb {
	/** The D1-compatible interface for use with DbHelper / domain helpers */
	d1: D1DatabaseCompat;
	/** The raw better-sqlite3 instance for direct inspection in tests */
	raw: Database.Database;
	/** Tear down (close) the database */
	close(): void;
}

/**
 * Creates a fresh in-memory SQLite database with all migrations applied.
 * Each call returns an independent DB — safe to use per-test.
 */
export function createTestDb(): TestDb {
	const db = new Database(':memory:');
	// Enable foreign keys (D1 has them enabled by default)
	db.pragma('foreign_keys = ON');
	// Use WAL for consistency with Cloudflare D1 behaviour
	db.pragma('journal_mode = WAL');

	runMigrations(db);

	return {
		d1: createD1Compat(db),
		raw: db,
		close() {
			db.close();
		}
	};
}
