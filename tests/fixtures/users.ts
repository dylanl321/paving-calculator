/**
 * tests/fixtures/users.ts
 *
 * Factory for creating test users in the in-memory D1-compatible database.
 */

import type { TestDb } from '../helpers/db.js';
import type { DbUser } from '../../src/lib/server/db-auth.js';

let _counter = 0;

function nextCounter(): number {
	return ++_counter;
}

/**
 * Reset the internal counter. Call between test suites if you need
 * deterministic email addresses (e.g. user1@test.com, user2@test.com, ...).
 */
export function resetUserCounter(): void {
	_counter = 0;
}

export interface CreateTestUserOptions {
	email?: string;
	name?: string;
	/** Plain-text password — stored as a bcrypt-style placeholder in tests */
	password?: string;
	isGlobalAdmin?: boolean;
	disabled?: boolean;
	emailVerified?: boolean;
}

/**
 * Insert a user row directly into the test DB.
 * Password is stored as a fixed placeholder hash so tests don't need
 * a real bcrypt implementation; the hash format matches what production
 * code would store (begins with $2b$).
 *
 * Returns the full DbUser row as it would come back from a SELECT *.
 */
export async function createTestUser(
	testDb: TestDb,
	opts: CreateTestUserOptions = {}
): Promise<DbUser> {
	const n = nextCounter();
	const id = `test-user-${n}`;
	const email = opts.email ?? `user${n}@test.example.com`;
	const name = opts.name ?? `Test User ${n}`;
	// A fixed bcrypt hash for "password" — deterministic, safe for tests
	const passwordHash =
		opts.password != null
			? `$2b$10$test_hash_for_${opts.password.replace(/[^a-z0-9]/gi, '_')}`
			: '$2b$10$test_hash_default_password';
	const isGlobalAdmin = opts.isGlobalAdmin ?? false;
	const disabled = opts.disabled ?? false;
	const emailVerified = opts.emailVerified ?? false;
	const now = Math.floor(Date.now() / 1000);

	await testDb.d1
		.prepare(
			`INSERT INTO users
        (id, email, password_hash, name, is_global_admin, disabled, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			email,
			passwordHash,
			name,
			isGlobalAdmin ? 1 : 0,
			disabled ? 1 : 0,
			emailVerified ? 1 : 0,
			now,
			now
		)
		.run();

	return {
		id,
		email,
		password_hash: passwordHash,
		name,
		is_global_admin: isGlobalAdmin,
		disabled,
		email_verified: emailVerified,
		phone: null,
		created_at: now,
		updated_at: now,
		last_login_at: null,
		last_login_ip: null
	};
}
