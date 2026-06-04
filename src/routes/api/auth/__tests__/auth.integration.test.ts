/**
 * Integration tests for authentication API endpoints.
 * Tests register, login, me, logout, forgot-password, and reset-password flows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb, type TestDb } from '../../../../../tests/helpers/db.js';
import { mockRequestEvent } from '../../../../../tests/helpers/request.js';
import { hashPassword, createSession } from '$lib/server/auth.js';
import { DbHelper } from '$lib/server/db.js';

// Import handlers
import { POST as registerHandler } from '../register/+server.js';
import { POST as loginHandler } from '../login/+server.js';
import { GET as meHandler } from '../me/+server.js';
import { POST as logoutHandler } from '../logout/+server.js';
import { POST as forgotPasswordHandler } from '../forgot-password/+server.js';
import { POST as resetPasswordHandler } from '../reset-password/+server.js';

// Mock email senders
vi.mock('$lib/server/email-template-senders', () => ({
	sendVerificationEmailTemplated: vi.fn().mockResolvedValue({ ok: true, status: 'sent' }),
	sendPasswordResetEmailTemplated: vi.fn().mockResolvedValue({ ok: true, status: 'sent' })
}));

// Mock audit logging
vi.mock('$lib/server/db-audit', () => ({
	logAuditEvent: vi.fn().mockResolvedValue(undefined)
}));

// Mock rate limiting
vi.mock('$lib/server/rate-limit', () => ({
	checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 })
}));

// Mock audit (used in login)
vi.mock('$lib/server/audit', () => ({
	recordAudit: vi.fn().mockResolvedValue(undefined)
}));

// Mock role-views (used in login)
vi.mock('$lib/server/role-views', () => ({
	getViewForRole: vi.fn().mockReturnValue('dashboard'),
	getRedirectForView: vi.fn().mockReturnValue('/dashboard')
}));

describe('Auth API Integration Tests', () => {
	let testDb: TestDb;

	beforeEach(() => {
		testDb = createTestDb();
		vi.clearAllMocks();
	});

	describe('POST /api/auth/register', () => {
		it('registers new user, creates org, returns user+org, sets session cookie', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/register',
				body: {
					email: 'alice@example.com',
					password: 'password123',
					name: 'Alice Smith',
					orgName: 'Alice Corp'
				}
			});

			const response = await registerHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.user).toMatchObject({
				email: 'alice@example.com',
				name: 'Alice Smith',
				email_verified: false
			});
			expect(data.org).toMatchObject({
				name: 'Alice Corp',
				slug: 'alice-corp'
			});

			// Verify session cookie was set
			const cookies = event.cookies.getAll();
			const sessionCookie = cookies.find((c) => c.name === 'paverate_session');
			expect(sessionCookie).toBeDefined();
			expect(sessionCookie!.value).toBeTruthy();
		});

		it('returns 409 for duplicate email', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			await db.createUser('bob@example.com', passwordHash, 'Bob');

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/register',
				body: {
					email: 'bob@example.com',
					password: 'password456',
					name: 'Bob Clone',
					orgName: 'Bob Corp'
				}
			});

			const response = await registerHandler(event);
			const data = await response.json();

			expect(response.status).toBe(409);
			expect(data.error).toContain('already registered');
		});

		it('returns 400 for weak password (< 8 chars)', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/register',
				body: {
					email: 'charlie@example.com',
					password: 'pass',
					name: 'Charlie',
					orgName: 'Charlie Corp'
				}
			});

			const response = await registerHandler(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('at least 8 characters');
		});

		it('returns 400 for missing required fields', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/register',
				body: {
					email: 'test@example.com',
					password: 'password123'
					// missing name and orgName
				}
			});

			const response = await registerHandler(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Missing required fields');
		});
	});

	describe('POST /api/auth/login', () => {
		it('returns user+redirectTo, sets session cookie', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			const user = await db.createUser('diana@example.com', passwordHash, 'Diana');
			const org = await db.createOrganization('Diana Org', 'diana-org');
			await db.addOrgMember(user.id, org.id, 'owner');

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/login',
				body: {
					email: 'diana@example.com',
					password: 'password123'
				}
			});

			const response = await loginHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.user).toMatchObject({
				email: 'diana@example.com',
				name: 'Diana'
			});
			expect(data.redirectTo).toBe('/dashboard');

			// Verify session cookie was set
			const cookies = event.cookies.getAll();
			const sessionCookie = cookies.find((c) => c.name === 'paverate_session');
			expect(sessionCookie).toBeDefined();
		});

		it('returns 401 for wrong password', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			await db.createUser('eve@example.com', passwordHash, 'Eve');

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/login',
				body: {
					email: 'eve@example.com',
					password: 'wrongpassword'
				}
			});

			const response = await loginHandler(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toContain('Invalid credentials');
		});

		it('returns 401 for unknown email', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/login',
				body: {
					email: 'nobody@example.com',
					password: 'password123'
				}
			});

			const response = await loginHandler(event);
			const data = await response.json();

			expect(response.status).toBe(401);
			expect(data.error).toContain('Invalid credentials');
		});

		it('returns 400 for missing fields', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/login',
				body: {
					email: 'test@example.com'
					// missing password
				}
			});

			const response = await loginHandler(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Missing email or password');
		});
	});

	describe('GET /api/auth/me', () => {
		it('returns user+org with email_verified for valid session', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			const user = await db.createUser('frank@example.com', passwordHash, 'Frank');
			const org = await db.createOrganization('Frank Org', 'frank-org');
			await db.addOrgMember(user.id, org.id, 'admin');
			const sessionToken = await createSession(db, user.id);

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'GET',
				pathname: '/api/auth/me',
				cookies: {
					paverate_session: sessionToken
				}
			});

			const response = await meHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.user).toMatchObject({
				email: 'frank@example.com',
				name: 'Frank',
				email_verified: false
			});
			expect(data.org).toMatchObject({
				name: 'Frank Org',
				slug: 'frank-org',
				role: 'admin'
			});
		});

		it('returns { user: null, org: null } for no session cookie', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'GET',
				pathname: '/api/auth/me'
				// no cookies
			});

			const response = await meHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.user).toBeNull();
			expect(data.org).toBeNull();
		});

		it('returns { user: null, org: null } for expired session', async () => {
			const userId = crypto.randomUUID();
			const sessionId = crypto.randomUUID();
			const now = Math.floor(Date.now() / 1000);
			const expiredTime = now - 3600; // 1 hour ago

			// Insert user
			await testDb.d1
				.prepare(
					'INSERT INTO users (id, email, name, password_hash, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?)'
				)
				.bind(userId, 'expired@example.com', 'Expired User', 'hash', 0, now)
				.run();

			// Insert expired session
			await testDb.d1
				.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
				.bind(sessionId, userId, expiredTime, now)
				.run();

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'GET',
				pathname: '/api/auth/me',
				cookies: {
					paverate_session: sessionId
				}
			});

			const response = await meHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.user).toBeNull();
			expect(data.org).toBeNull();
		});
	});

	describe('POST /api/auth/logout', () => {
		it('clears session cookie, deletes session from DB, returns { success: true }', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			const user = await db.createUser('grace@example.com', passwordHash, 'Grace');
			const sessionToken = await createSession(db, user.id);

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/logout',
				cookies: {
					paverate_session: sessionToken
				}
			});

			const response = await logoutHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);

			// Verify session was deleted from DB
			const session = await testDb.d1
				.prepare('SELECT * FROM sessions WHERE id = ?')
				.bind(sessionToken)
				.first();
			expect(session).toBeNull();

			// Verify cookie was cleared (cookie should be deleted)
			const cookies = event.cookies.getAll();
			const sessionCookie = cookies.find((c) => c.name === 'paverate_session');
			expect(sessionCookie).toBeUndefined();
		});

		it('works even without a session', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/logout'
				// no cookies
			});

			const response = await logoutHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});
	});

	describe('POST /api/auth/forgot-password', () => {
		it('returns { success: true }, creates reset token in DB for known email', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			const user = await db.createUser('henry@example.com', passwordHash, 'Henry');

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/forgot-password',
				body: {
					email: 'henry@example.com'
				}
			});

			const response = await forgotPasswordHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);

			// Verify token was created in DB
			const token = await testDb.d1
				.prepare('SELECT * FROM email_tokens WHERE user_id = ? AND type = ?')
				.bind(user.id, 'reset_password')
				.first<{ token: string }>();
			expect(token).toBeTruthy();
		});

		it('returns { success: true } for unknown email (prevents enumeration)', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/forgot-password',
				body: {
					email: 'unknown@example.com'
				}
			});

			const response = await forgotPasswordHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);
		});

		it('returns 400 for invalid email format', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/forgot-password',
				body: {
					email: 'not-an-email'
				}
			});

			const response = await forgotPasswordHandler(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid email format');
		});
	});

	describe('POST /api/auth/reset-password', () => {
		it('updates password, marks token used, deletes sessions, returns { success: true }', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('oldpassword123');
			const user = await db.createUser('iris@example.com', passwordHash, 'Iris');
			const sessionToken = await createSession(db, user.id);

			// Create reset token
			const resetToken = await db.createEmailToken(user.id, 'reset_password', 3600);

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/reset-password',
				body: {
					token: resetToken,
					password: 'newpassword123'
				}
			});

			const response = await resetPasswordHandler(event);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.success).toBe(true);

			// Verify token is marked used
			const tokenData = await testDb.d1
				.prepare('SELECT used_at FROM email_tokens WHERE token = ?')
				.bind(resetToken)
				.first<{ used_at: number | null }>();
			expect(tokenData?.used_at).toBeTruthy();

			// Verify session was deleted
			const session = await testDb.d1
				.prepare('SELECT * FROM sessions WHERE id = ?')
				.bind(sessionToken)
				.first();
			expect(session).toBeNull();
		});

		it('returns 400 for invalid token', async () => {
			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/reset-password',
				body: {
					token: 'invalid-token-12345',
					password: 'newpassword123'
				}
			});

			const response = await resetPasswordHandler(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('Invalid reset token');
		});

		it('returns 400 for expired token', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			const user = await db.createUser('jack@example.com', passwordHash, 'Jack');

			// Create expired token (negative expiry duration)
			const expiredToken = await db.createEmailToken(user.id, 'reset_password', -3600);

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/reset-password',
				body: {
					token: expiredToken,
					password: 'newpassword123'
				}
			});

			const response = await resetPasswordHandler(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('expired');
		});

		it('returns 400 for already used token', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			const user = await db.createUser('kate@example.com', passwordHash, 'Kate');
			const resetToken = await db.createEmailToken(user.id, 'reset_password', 3600);

			// Mark token as used
			await db.markEmailTokenUsed(resetToken);

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/reset-password',
				body: {
					token: resetToken,
					password: 'newpassword123'
				}
			});

			const response = await resetPasswordHandler(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('already been used');
		});

		it('returns 400 for weak password', async () => {
			const db = new DbHelper(testDb.d1);
			const passwordHash = await hashPassword('password123');
			const user = await db.createUser('leo@example.com', passwordHash, 'Leo');
			const resetToken = await db.createEmailToken(user.id, 'reset_password', 3600);

			const event = mockRequestEvent({
				db: testDb.d1,
				method: 'POST',
				pathname: '/api/auth/reset-password',
				body: {
					token: resetToken,
					password: 'short'
				}
			});

			const response = await resetPasswordHandler(event);
			const data = await response.json();

			expect(response.status).toBe(400);
			expect(data.error).toContain('at least 8 characters');
		});
	});
});
