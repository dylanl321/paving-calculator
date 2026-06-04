/**
 * e2e/specs/auth.spec.ts
 *
 * E2E tests for registration and login flows.
 *
 * Strategy: intercept /api/auth/* requests with page.route() so tests
 * run without a real D1 database. Each test sets up its own mock routes.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';
import { RegisterPage } from '../pages/register.page.js';
import { DashboardPage } from '../pages/dashboard.page.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Intercept /api/auth/register and return a 200 success payload. */
async function mockRegisterSuccess(page: import('@playwright/test').Page) {
	await page.route('/api/auth/register', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ ok: true })
		})
	);
}

/** Intercept /api/auth/login and return a 200 success with a redirectTo. */
async function mockLoginSuccess(
	page: import('@playwright/test').Page,
	redirectTo = '/dashboard'
) {
	await page.route('/api/auth/login', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ redirectTo })
		})
	);
	// /api/auth/me — return a minimal user so authStore.fetch() resolves
	await page.route('/api/auth/me', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				user: { id: 'u1', name: 'Test User', email: 'user@test.com', role: 'foreman' },
				org: { id: 'org1', name: 'Test Co' }
			})
		})
	);
}

/** Intercept /api/auth/login and return 401 invalid credentials. */
async function mockLoginFailure(page: import('@playwright/test').Page) {
	await page.route('/api/auth/login', (route) =>
		route.fulfill({
			status: 401,
			contentType: 'application/json',
			body: JSON.stringify({ error: 'Invalid credentials' })
		})
	);
}

/** Intercept /api/auth/logout. */
async function mockLogout(page: import('@playwright/test').Page) {
	await page.route('/api/auth/logout', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ ok: true })
		})
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Auth flows', () => {
	test('register new user — success banner shown, then redirect to dashboard', async ({
		page
	}) => {
		const registerPage = new RegisterPage(page);

		// Mock the register API so no DB is needed
		await mockRegisterSuccess(page);

		// Also mock /api/auth/me so the post-register fetch() resolves
		await page.route('/api/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					user: { id: 'u_new', name: 'New User', email: 'new@test.com', role: 'foreman' },
					org: { id: 'org_new', name: 'New Paving Co' }
				})
			})
		);

		await registerPage.goto();
		await registerPage.fill({
			name: 'New User',
			email: 'new@test.com',
			password: 'Secure123!',
			confirmPassword: 'Secure123!',
			orgName: 'New Paving Co'
		});
		await registerPage.submit();

		// Success banner must appear
		await registerPage.expectSuccess();

		// After the 1.2 s delay the page navigates to /dashboard
		await expect(page).toHaveURL(/\/dashboard/, { timeout: 6000 });
	});

	test('login with valid credentials — redirects to dashboard', async ({ page }) => {
		const loginPage = new LoginPage(page);
		const dashboardPage = new DashboardPage(page);

		await mockLoginSuccess(page, '/dashboard');

		await loginPage.goto();
		await loginPage.login('user@test.com', 'User123!');

		// Should leave /login
		await loginPage.expectLoggedIn();

		// Dashboard nav should be visible
		await dashboardPage.expectVisible();
	});

	test('login with wrong password — shows error message', async ({ page }) => {
		const loginPage = new LoginPage(page);

		await mockLoginFailure(page);

		await loginPage.goto();
		await loginPage.login('user@test.com', 'WrongPassword!');

		// Error banner should appear on the page
		await loginPage.expectError('Invalid credentials');

		// Must still be on the login page
		await expect(page).toHaveURL(/\/login/);
	});

	test('logout — redirects away from dashboard', async ({ page }) => {
		// Start the user already "logged in" by pre-seeding the /me response
		await page.route('/api/auth/me', (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					user: { id: 'u1', name: 'Test User', email: 'user@test.com', role: 'foreman' },
					org: { id: 'org1', name: 'Test Co' }
				})
			})
		);
		await mockLogout(page);

		// Navigate to dashboard directly
		await page.goto('/dashboard');

		// Open the user menu — avatar button aria-label="User menu"
		await page.getByRole('button', { name: /user menu/i }).click();

		// Click the Logout menu item
		await page.getByRole('button', { name: /logout/i }).click();

		// After logout authStore clears and goto('/') is called
		await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 8000 });
	});
});
