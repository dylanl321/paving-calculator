/**
 * e2e/specs/job-site.spec.ts
 *
 * E2E tests: Job Site creation and configuration.
 *
 * Covers:
 *  1. Login
 *  2. Create a new job site from the dashboard (name + location)
 *  3. Verify the site appears in the dashboard list
 *  4. Open the site detail page
 *  5. Navigate to Configuration tab and configure a mix design
 *  6. Verify configuration persisted after a page reload
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';
import { DashboardPage } from '../pages/dashboard.page.js';
import { JobSitePage } from '../pages/job-site.page.js';

// Unique name per run so parallel runs do not clash
const SITE_NAME = `E2E Test Site ${Date.now()}`;
const SITE_LOCATION = 'Mile Marker 10-15';
const MIX_NAME = 'Surface Mix';
const MIX_TYPE = '9.5mm Superpave Type 1';

// Dev-login credentials seeded by the dev-login endpoint
const DEV_EMAIL = 'dev@paverate.local';
const DEV_PASSWORD = 'DevPass123!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function devLogin(page: import('@playwright/test').Page): Promise<void> {
	// Try the /api/auth/dev-login shortcut first (seeds user + org automatically)
	const resp = await page.request.post('/api/auth/dev-login');
	if (resp.ok()) {
		// Cookie is set — navigate to dashboard
		await page.goto('/dashboard');
		return;
	}
	// Fallback: manual form login
	const loginPage = new LoginPage(page);
	await loginPage.goto();
	await loginPage.login(DEV_EMAIL, DEV_PASSWORD);
	await loginPage.expectLoggedIn();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Job Site creation and configuration', () => {
	test('can log in and reach the dashboard', async ({ page }) => {
		await devLogin(page);
		const dashboard = new DashboardPage(page);
		await dashboard.expectVisible();
		await expect(page).not.toHaveURL(/\/login/);
	});

	test('can create a new job site from the dashboard', async ({ page }) => {
		await devLogin(page);
		await page.goto('/dashboard');

		// Open the create form — "New Project" button in the header
		const newProjectBtn = page.getByRole('button', { name: /new project/i });
		// If the empty state is shown, find "Create your first project" instead
		const emptyStateBtn = page.getByRole('button', { name: /create your first project/i });

		if (await emptyStateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			await emptyStateBtn.click();
		} else {
			await newProjectBtn.click();
		}

		// Fill in the form
		await page.getByLabel(/project name/i).fill(SITE_NAME);
		await page.getByLabel(/location description/i).fill(SITE_LOCATION);

		// Submit
		await page.getByRole('button', { name: /^create$/i }).click();

		// After creation, should redirect to the site detail page
		await expect(page).toHaveURL(/\/dashboard\/job-sites\/[a-z0-9_-]+/i, { timeout: 15000 });
	});

	test('created site appears in the dashboard list', async ({ page }) => {
		// Create a fresh site via API for predictable state
		await devLogin(page);
		const createResp = await page.request.post('/api/job-sites', {
			data: { name: SITE_NAME, location_description: SITE_LOCATION }
		});
		expect(createResp.ok()).toBeTruthy();
		const body = await createResp.json() as { id?: string };
		expect(body.id).toBeTruthy();

		await page.goto('/dashboard');
		// The site name should be visible somewhere on the page
		await expect(page.getByText(SITE_NAME, { exact: false }).first()).toBeVisible({
			timeout: 10000
		});
	});

	test('site detail page loads after creation', async ({ page }) => {
		await devLogin(page);
		const createResp = await page.request.post('/api/job-sites', {
			data: { name: SITE_NAME, location_description: SITE_LOCATION }
		});
		expect(createResp.ok()).toBeTruthy();
		const { id } = await createResp.json() as { id: string };

		const sitePage = new JobSitePage(page);
		await sitePage.goto(id);
		await sitePage.expectLoaded();
		// Site name should be visible on the page
		await sitePage.expectSiteNameVisible(SITE_NAME);
	});

	test('can configure a mix design and config persists after reload', async ({ page }) => {
		// Create site via API
		await devLogin(page);
		const createResp = await page.request.post('/api/job-sites', {
			data: { name: SITE_NAME, location_description: SITE_LOCATION }
		});
		expect(createResp.ok()).toBeTruthy();
		const { id } = await createResp.json() as { id: string };

		const sitePage = new JobSitePage(page);
		await sitePage.goto(id);
		await sitePage.expectLoaded();
		await sitePage.openConfigurationTab();

		// Add a mix
		await sitePage.addMix();
		await sitePage.fillMixName(MIX_NAME);
		await sitePage.selectMixType(MIX_TYPE);

		// Give the auto-save a moment to persist
		await page.waitForTimeout(1500);

		// Reload and verify config is still there
		await page.reload();
		await sitePage.expectLoaded();
		await sitePage.openConfigurationTab();
		await sitePage.expectMixVisible(MIX_NAME);
	});

	test('full flow: login, create, verify in list, open detail, configure mix', async ({ page }) => {
		// 1. Login
		await devLogin(page);
		const dashboard = new DashboardPage(page);
		await page.goto('/dashboard');
		await dashboard.expectVisible();

		// 2. Create via API for reliability
		const createResp = await page.request.post('/api/job-sites', {
			data: { name: SITE_NAME + ' Full', location_description: SITE_LOCATION }
		});
		expect(createResp.ok()).toBeTruthy();
		const { id } = await createResp.json() as { id: string };

		// 3. Verify site in list
		await page.reload();
		await expect(page.getByText(SITE_NAME + ' Full', { exact: false }).first()).toBeVisible({
			timeout: 10000
		});

		// 4. Open detail page via the link in the list
		await page.getByText(SITE_NAME + ' Full', { exact: false }).first().click();
		await expect(page).toHaveURL(new RegExp(`/dashboard/job-sites/${id}`));

		const sitePage = new JobSitePage(page);
		await sitePage.expectLoaded();

		// 5. Configure a mix
		await sitePage.openConfigurationTab();
		await sitePage.addMix();
		await sitePage.fillMixName(MIX_NAME);
		await sitePage.selectMixType(MIX_TYPE);

		// Wait for auto-save
		await page.waitForTimeout(1500);

		// 6. Reload and verify persisted
		await page.reload();
		await sitePage.expectLoaded();
		await sitePage.openConfigurationTab();
		await sitePage.expectMixVisible(MIX_NAME);
	});
});
