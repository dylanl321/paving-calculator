/**
 * tests/setup-d1.ts
 *
 * Vitest setup file for the "integration" project.
 * Exports getTestDb() so individual test files can share a per-suite DB
 * or create isolated ones via createTestDb().
 */

import { createTestDb, type TestDb } from './helpers/db.js';

let _db: TestDb | null = null;

/**
 * Returns a lazily-created shared TestDb for the current test run.
 * Use this when you want all tests in a file to share the same DB state.
 *
 * For full isolation, call createTestDb() directly in each test's beforeEach.
 */
export function getTestDb(): TestDb {
	if (!_db) {
		_db = createTestDb();
	}
	return _db;
}

// Re-export createTestDb for per-test isolation pattern
export { createTestDb } from './helpers/db.js';
