/**
 * e2e/pages/job-site.page.ts
 *
 * Page object for the /dashboard/job-sites/[id] route.
 */
import { type Page, expect } from '@playwright/test';

export class JobSitePage {
	constructor(private page: Page) {}

	async goto(siteId: string) {
		await this.page.goto(`/dashboard/job-sites/${siteId}`);
	}

	async expectLoaded() {
		// Wait for the tab list to appear — indicates the detail page rendered
		await expect(this.page.getByRole('tab', { name: /overview/i })).toBeVisible({
			timeout: 15000
		});
	}

	async switchToTab(tabName: string) {
		await this.page.getByRole('tab', { name: new RegExp(tabName, 'i') }).click();
	}

	// -------------------------------------------------------
	// Configuration tab helpers
	// -------------------------------------------------------

	async openConfigurationTab() {
		// Try the tab button; fallback to URL param navigation
		const tabBtn = this.page.getByRole('tab', { name: /config/i });
		if (await tabBtn.isVisible()) {
			await tabBtn.click();
		} else {
			const url = this.page.url();
			await this.page.goto(url.split('?')[0] + '?tab=configuration');
		}
		// The configuration form should now be visible
		await expect(this.page.locator('.config-form').first()).toBeVisible({ timeout: 10000 });
	}

	/** Click the "+ Add Mix" button inside the Configuration tab */
	async addMix() {
		await this.page.getByRole('button', { name: /add mix/i }).click();
	}

	/** Fill in the mix name for the last added mix row */
	async fillMixName(name: string) {
		const inputs = this.page.locator('.mix-name-input');
		const last = inputs.last();
		await last.fill(name);
		await last.dispatchEvent('input');
	}

	/** Select mix type from the last mix row's dropdown */
	async selectMixType(mixType: string) {
		const selects = this.page.locator('select').filter({ has: this.page.locator('option[value]') });
		// The mix type select is the one with the superpave option
		const mixTypeSelect = this.page
			.locator('select')
			.filter({ hasText: /superpave|patching|SMA/i })
			.last();
		await mixTypeSelect.selectOption(mixType);
	}

	async expectMixVisible(mixName: string) {
		await expect(this.page.getByText(mixName, { exact: false })).toBeVisible({ timeout: 10000 });
	}

	// -------------------------------------------------------
	// Overview tab helpers
	// -------------------------------------------------------

	async expectSiteNameVisible(name: string) {
		await expect(this.page.getByText(name, { exact: false }).first()).toBeVisible({
			timeout: 10000
		});
	}
}
