/**
 * e2e/pages/login.page.ts
 *
 * Page object for the /login route.
 */
import { type Page, expect } from '@playwright/test';

export class LoginPage {
	constructor(private page: Page) {}

	async goto() {
		await this.page.goto('/login');
	}

	async login(email: string, password: string) {
		await this.page.getByLabel(/email/i).fill(email);
		await this.page.getByLabel(/password/i).fill(password);
		await this.page.getByRole('button', { name: /sign in|log in|login/i }).click();
	}

	async expectLoggedIn() {
		// After successful login, should redirect away from /login
		await expect(this.page).not.toHaveURL(/\/login/);
	}

	async expectError(message: string) {
		await expect(this.page.getByText(message)).toBeVisible();
	}
}
