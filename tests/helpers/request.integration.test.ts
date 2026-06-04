/**
 * tests/helpers/request.integration.test.ts
 *
 * Integration tests for mockRequestEvent and createAuthenticatedEvent helpers.
 */

import { describe, it, expect } from 'vitest';
import { createTestDb } from './db.js';
import { createAuthenticatedEvent } from './auth.js';
import { mockRequestEvent } from './request.js';
import { GET } from '../../src/routes/api/auth/me/+server.js';

describe('request helpers integration', () => {
	it('GET /api/auth/me returns user and org for authenticated session', async () => {
		const db = createTestDb();
		const event = await createAuthenticatedEvent(db.d1);

		const response = await GET(event as any);

		expect(response.status).toBe(200);

		const body = await response.json() as { user: { email: string }, org: { role: string } };
		expect(body.user.email).toBe('test@example.com');
		expect(body.org).toBeTruthy();
		expect(body.org.role).toBe('admin');
	});

	it('GET /api/auth/me returns null user for unauthenticated request', async () => {
		const db = createTestDb();
		const event = mockRequestEvent({ db: db.d1 });

		const response = await GET(event as any);

		expect(response.status).toBe(200);

		const body = await response.json() as { user: null | object };
		expect(body.user).toBeNull();
	});
});
