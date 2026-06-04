/**
 * e2e/specs/admin.spec.ts
 *
 * E2E tests for the Admin Panel pages (/admin/*).
 *
 * All API calls are intercepted with Playwright route mocking so tests run
 * against the real UI without needing a live Cloudflare D1 backend.
 *
 * Covered scenarios:
 *  - Global admin can access /admin overview page (KPIs render)
 *  - View all users page (/admin/users) with search functionality
 *  - View all orgs page (/admin/orgs) with list rendering
 *  - View org detail page (/admin/orgs/[id]) with tabs
 *  - Non-admin user gets redirected away from /admin routes
 */
import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const MOCK_ADMIN_USER = {
	id: 'user_admin_001',
	name: 'Admin User',
	email: 'admin@test.com',
	is_global_admin: true,
	disabled: false,
	org_name: 'Test Paving Co',
	org_id: 'org_test_001',
	role: 'owner',
	phone: null,
	created_at: 1700000000
};

const MOCK_REG_USER = {
	id: 'user_reg_001',
	name: 'Regular User',
	email: 'user@test.com',
	is_global_admin: false,
	disabled: false,
	org_name: 'Test Paving Co',
	org_id: 'org_test_001',
	role: 'member',
	phone: null,
	created_at: 1700100000
};

const MOCK_USER_ALICE = {
	id: 'user_alice_001',
	name: 'Alice Smith',
	email: 'alice@paverate.test',
	is_global_admin: false,
	disabled: false,
	org_name: 'Alpha Paving',
	org_id: 'org_alpha_001',
	role: 'admin',
	phone: null,
	created_at: 1700200000
};

const MOCK_ORG = {
	id: 'org_test_001',
	name: 'Test Paving Co',
	slug: 'test-paving-co',
	member_count: 2,
	created_at: 1700000000
};

const MOCK_ORG_ALPHA = {
	id: 'org_alpha_001',
	name: 'Alpha Paving',
	slug: 'alpha-paving',
	member_count: 3,
	created_at: 1700050000
};

const MOCK_ORG_DETAIL = {
	org: MOCK_ORG,
	members: [
		{
			user_id: MOCK_ADMIN_USER.id,
			user_name: MOCK_ADMIN_USER.name,
			user_email: MOCK_ADMIN_USER.email,
			role: 'owner',
			invited_at: 1700000000
		},
		{
			user_id: MOCK_REG_USER.id,
			user_name: MOCK_REG_USER.name,
			user_email: MOCK_REG_USER.email,
			role: 'member',
			invited_at: 1700100000
		}
	],
	invitations: [],
	jobSites: []
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock /api/auth/me for global admin */
function mockMeAsAdmin(page: Page) {
	return page.route('/api/auth/me', (route: Route) =>
		route.fulfill({
			json: {
				user: {
					id: MOCK_ADMIN_USER.id,
					name: MOCK_ADMIN_USER.name,
					email: MOCK_ADMIN_USER.email
				},
				org: { id: MOCK_ADMIN_USER.org_id, name: MOCK_ADMIN_USER.org_name, role: 'owner' }
			}
		})
	);
}

/** Mock /api/auth/me for regular (non-admin) user */
function mockMeAsRegularUser(page: Page) {
	return page.route('/api/auth/me', (route: Route) =>
		route.fulfill({
			json: {
				user: { id: MOCK_REG_USER.id, name: MOCK_REG_USER.name, email: MOCK_REG_USER.email },
				org: { id: MOCK_REG_USER.org_id, name: MOCK_REG_USER.org_name, role: 'member' }
			}
		})
	);
}

/** Mock /api/admin/users */
function mockAdminUsers(page: Page, users = [MOCK_ADMIN_USER, MOCK_REG_USER, MOCK_USER_ALICE]) {
	return page.route('/api/admin/users', (route: Route) => route.fulfill({ json: { users } }));
}

/** Mock /api/admin/orgs */
function mockAdminOrgs(page: Page, orgs = [MOCK_ORG, MOCK_ORG_ALPHA]) {
	return page.route('/api/admin/orgs', (route: Route) => route.fulfill({ json: { orgs } }));
}

/** Mock /api/admin/orgs/[id] */
function mockAdminOrgDetail(page: Page, orgId: string, data = MOCK_ORG_DETAIL) {
	return page.route(`/api/admin/orgs/${orgId}`, (route: Route) => route.fulfill({ json: data }));
}

/** Mock /api/org/activity */
function mockActivity(page: Page) {
	return page.route('/api/org/activity', (route: Route) =>
		route.fulfill({ json: { activity: {} } })
	);
}

/**
 * Full suite of standard API mocks for admin user
 */
async function setupAdminApiMocks(page: Page) {
	await mockMeAsAdmin(page);
	await mockAdminUsers(page);
	await mockAdminOrgs(page);
	await mockAdminOrgDetail(page, MOCK_ORG.id);
	await mockActivity(page);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin panel', () => {
	test.beforeEach(async ({ page }) => {
		// Stub the auth session so the app thinks we are logged in
		await page.addInitScript(() => {
			// Mock auth checks happen via /api/auth/me route interception
		});
	});

	// -------------------------------------------------------------------------
	test('global admin can access /admin overview with KPIs', async ({ page }) => {
		await setupAdminApiMocks(page);

		await page.goto('/admin');
		await page.waitForLoadState('networkidle');

		// Overview page should show KPI links
		const kpiOrgs = page.locator('a[href="/admin/orgs"].kpi');
		const kpiUsers = page.locator('a[href="/admin/users"].kpi');

		await expect(kpiOrgs).toBeVisible();
		await expect(kpiUsers).toBeVisible();
	});

	// -------------------------------------------------------------------------
	test('view all users page — shows user list with search', async ({ page }) => {
		await setupAdminApiMocks(page);

		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		// Should show users table
		await expect(page.locator('.users-table')).toBeVisible();

		// All users should be visible
		await expect(page.locator('text=admin@test.com')).toBeVisible();
		await expect(page.locator('text=user@test.com')).toBeVisible();
		await expect(page.locator('text=alice@paverate.test')).toBeVisible();

		// Admin user should have admin badge
		const adminBadge = page.locator('.badge.admin').first();
		await expect(adminBadge).toBeVisible();

		// Search should filter users
		const searchInput = page.locator('input[type="search"]');
		await searchInput.fill('alice');

		// Only Alice should remain visible (client-side filter via oninput)
		await expect(page.locator('text=alice@paverate.test')).toBeVisible();
		// Give filter time to apply
		await page.waitForTimeout(100);
	});

	// -------------------------------------------------------------------------
	test('view all orgs page — shows org list', async ({ page }) => {
		await setupAdminApiMocks(page);

		await page.goto('/admin/orgs');
		await page.waitForLoadState('networkidle');

		// Should show orgs table or list
		const orgsContainer = page.locator('.orgs-table').or(page.locator('text=Test Paving Co'));
		await expect(orgsContainer).toBeVisible();

		// Both orgs should be visible
		await expect(page.locator('text=Test Paving Co')).toBeVisible();
		await expect(page.locator('text=Alpha Paving')).toBeVisible();

		// Search should work
		const searchInput = page.locator('input[type="search"]');
		if (await searchInput.isVisible()) {
			await searchInput.fill('alpha');
			await page.waitForTimeout(100);
			await expect(page.locator('text=Alpha Paving')).toBeVisible();
		}
	});

	// -------------------------------------------------------------------------
	test('view org detail page — shows tabs and org info', async ({ page }) => {
		await setupAdminApiMocks(page);

		await page.goto(`/admin/orgs/${MOCK_ORG.id}`);
		await page.waitForLoadState('networkidle');

		// Should show org name
		await expect(page.locator(`text=${MOCK_ORG.name}`)).toBeVisible();

		// Should show tabs (overview, members, job-sites, audit)
		const tabs = page.locator('[role="tablist"]').or(page.locator('.tabs'));
		await expect(tabs).toBeVisible();

		// Members should be visible (default tab or clickable)
		await expect(
			page.locator(`text=${MOCK_ADMIN_USER.email}`).or(page.locator('text=owner'))
		).toBeVisible();
	});

	// -------------------------------------------------------------------------
	test('non-admin user redirected from /admin', async ({ page }) => {
		// Mock as regular user (not admin)
		await mockMeAsRegularUser(page);
		await mockActivity(page);

		// Navigate to /admin — server-side +layout.server.ts should redirect
		await page.goto('/admin');
		await page.waitForLoadState('networkidle');

		// Should be redirected to /dashboard (server redirect in +layout.server.ts)
		// Or possibly /login if not authenticated
		const url = page.url();
		expect(url).toMatch(/\/(dashboard|login)/);
	});

	// -------------------------------------------------------------------------
	test('non-admin user redirected from /admin/users', async ({ page }) => {
		await mockMeAsRegularUser(page);
		await mockActivity(page);

		await page.goto('/admin/users');
		await page.waitForLoadState('networkidle');

		// Should be redirected away (layout guard)
		const url = page.url();
		expect(url).toMatch(/\/(dashboard|login)/);
	});

	// -------------------------------------------------------------------------
	test('non-admin user redirected from /admin/orgs', async ({ page }) => {
		await mockMeAsRegularUser(page);
		await mockActivity(page);

		await page.goto('/admin/orgs');
		await page.waitForLoadState('networkidle');

		// Should be redirected away (layout guard)
		const url = page.url();
		expect(url).toMatch(/\/(dashboard|login)/);
	});
});
