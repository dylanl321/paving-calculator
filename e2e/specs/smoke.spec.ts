/**
 * e2e/specs/smoke.spec.ts
 *
 * Smoke tests — verify the app loads and basic pages are reachable.
 */
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';

test.describe('Smoke tests', () => {
	test('login page loads', async ({ page }) => {
		const loginPage = new LoginPage(page);
		await loginPage.goto();
		await expect(page).toHaveTitle(/PaveRate|Pave/i);
		await expect(page.getByLabel(/email/i)).toBeVisible();
		await expect(page.getByLabel(/password/i)).toBeVisible();
	});

	test('login page has correct URL', async ({ page }) => {
		await page.goto('/login');
		await expect(page).toHaveURL(/\/login/);
	});
});
