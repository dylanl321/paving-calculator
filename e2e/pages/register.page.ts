/**
 * e2e/pages/register.page.ts
 *
 * Page object for the /register route.
 */
import { type Page, expect } from '@playwright/test';

export class RegisterPage {
	constructor(private page: Page) {}

	async goto() {
		await this.page.goto('/register');
	}

	async fill(fields: {
		name: string;
		email: string;
		password: string;
		confirmPassword: string;
		orgName: string;
	}) {
		await this.page.getByLabel('Your Name').fill(fields.name);
		await this.page.getByLabel('Email').fill(fields.email);
		// Use exact label to avoid matching Confirm Password
		await this.page.getByLabel('Password', { exact: true }).fill(fields.password);
		await this.page.getByLabel('Confirm Password').fill(fields.confirmPassword);
		await this.page.getByLabel('Organization Name').fill(fields.orgName);
	}

	async submit() {
		await this.page.getByRole('button', { name: /create account|sign up|register/i }).click();
	}

	async expectSuccess() {
		// Success banner appears before redirect
		await expect(
			this.page.getByText(/account created|redirecting/i)
		).toBeVisible({ timeout: 5000 });
	}

	async expectFieldError(fieldId: string, message: string) {
		await expect(this.page.locator(`#${fieldId}-error`)).toContainText(message);
	}
}
