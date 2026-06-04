/**
 * e2e/fixtures/seed.ts
 *
 * Test data constants and seed helpers for E2E tests.
 * Exports known credentials and IDs used across test specs.
 */

export const ADMIN_USER = {
	id: 'user_admin_test_001',
	email: 'admin@test.com',
	password: 'Admin123!',
	name: 'Admin User'
} as const;

export const REGULAR_USER = {
	id: 'user_reg_test_001',
	email: 'user@test.com',
	password: 'User123!',
	name: 'Regular User'
} as const;

export const TEST_ORG = {
	id: 'org_test_001',
	name: 'Test Paving Co'
} as const;

export const TEST_JOB_SITE = {
	id: 'site_test_001',
	name: 'Test Highway 1'
} as const;

export const TEST_LOG_ID = 'log_test_001';
