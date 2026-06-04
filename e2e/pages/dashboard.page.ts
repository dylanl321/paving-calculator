/**
 * e2e/pages/dashboard.page.ts
 *
 * Page object for the main dashboard / app shell.
 */
import { type Page, expect } from '@playwright/test';

export class DashboardPage {
	constructor(private page: Page) {}

	async expectVisible() {
		// Check dashboard nav is visible — app shell renders a <nav> element
		await expect(this.page.getByRole('navigation')).toBeVisible({ timeout: 10000 });
	}

	async navigateTo(path: string) {
		await this.page.goto(path);
	}
}
