/**
 * tests/helpers/auth.ts
 *
 * Test helper for creating authenticated RequestEvents with a full user/org/session setup.
 */

import { createTestDb, type D1DatabaseCompat } from './db.js';
import { mockRequestEvent, type MockRequestEvent } from './request.js';

export interface CreateAuthenticatedEventOpts {
	email?: string;
	name?: string;
	method?: string;
	pathname?: string;
	searchParams?: Record<string, string>;
	body?: unknown;
	params?: Record<string, string>;
}

/**
 * Creates a test database with a user, org, org membership, and session,
 * then returns a mockRequestEvent with the session cookie set.
 */
export async function createAuthenticatedEvent(
	db: D1DatabaseCompat,
	opts: CreateAuthenticatedEventOpts = {}
): Promise<MockRequestEvent> {
	const {
		email = 'test@example.com',
		name = 'Test User',
		method = 'GET',
		pathname = '/',
		searchParams,
		body,
		params
	} = opts;

	const database = db;

	// Generate IDs
	const userId = crypto.randomUUID();
	const orgId = crypto.randomUUID();
	const sessionId = crypto.randomUUID();

	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + 30 * 24 * 60 * 60; // 30 days

	// Insert user
	await database
		.prepare(
			'INSERT INTO users (id, email, name, password_hash, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(userId, email, name, 'test-hash', 1, now)
		.run();

	// Insert org
	const orgSlug = email.split('@')[0] ?? 'test-org';
	await database
		.prepare('INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)')
		.bind(orgId, `${name} Org`, orgSlug, now)
		.run();

	// Insert org membership (no id column; invited_at + accepted_at columns)
	await database
		.prepare(
			'INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(userId, orgId, 'admin', now, now)
		.run();

	// Insert session
	await database
		.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
		.bind(sessionId, userId, expiresAt, now)
		.run();

	// Create request event with session cookie
	return mockRequestEvent({
		db: database,
		method,
		pathname,
		searchParams,
		body,
		params,
		cookies: {
			paverate_session: sessionId
		}
	});
}
