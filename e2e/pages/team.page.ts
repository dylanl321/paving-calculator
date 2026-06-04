/**
 * e2e/pages/team.page.ts
 *
 * Page object for the /dashboard/team route.
 */
import { type Page, expect } from '@playwright/test';

export class TeamPage {
	constructor(private page: Page) {}

	async goto() {
		await this.page.goto('/dashboard/team');
	}

	// --- Invite flow ---

	async openInviteModal() {
		await this.page.getByRole('button', { name: /invite member/i }).click();
	}

	async fillInviteForm(email: string, role = 'member') {
		await this.page.getByLabel(/email/i).fill(email);
		// Role select is inside the modal
		const roleSelect = this.page.locator('.modal select').first();
		await roleSelect.selectOption(role);
	}

	async submitInvite() {
		await this.page.getByRole('button', { name: /send invite/i }).click();
	}

	async cancelInviteModal() {
		await this.page.getByRole('button', { name: /cancel/i }).first().click();
	}

	// --- Member list helpers ---

	getMemberCard(name: string) {
		return this.page.locator('.member-card').filter({ hasText: name });
	}

	getInvitationCard(email: string) {
		return this.page.locator('.invitation-card').filter({ hasText: email });
	}

	async expectMemberVisible(name: string) {
		await expect(this.getMemberCard(name)).toBeVisible();
	}

	async expectMemberNotVisible(name: string) {
		await expect(this.getMemberCard(name)).not.toBeVisible();
	}

	async expectInvitePending(email: string) {
		await expect(this.getInvitationCard(email)).toBeVisible();
	}

	async expectInviteNotPending(email: string) {
		await expect(this.getInvitationCard(email)).not.toBeVisible();
	}

	// --- Role change ---

	async changeMemberRole(memberName: string, newRole: string) {
		const card = this.getMemberCard(memberName);
		const roleSelect = card.locator('select.role-select');
		await roleSelect.selectOption(newRole);
	}

	async confirmRoleChange() {
		// The team page shows its own inline confirm dialog
		await this.page
			.locator('.modal.confirm-dialog')
			.getByRole('button', { name: /confirm/i })
			.click();
	}

	async cancelRoleChange() {
		await this.page
			.locator('.modal.confirm-dialog')
			.getByRole('button', { name: /cancel/i })
			.click();
	}

	// --- Remove member ---

	async removeMember(memberName: string) {
		const card = this.getMemberCard(memberName);
		await card.getByRole('button', { name: /remove member/i }).click();
	}

	// --- Confirm modal (confirmStore) ---

	async confirmDestructiveAction() {
		// ConfirmModal uses .btn-confirm.destructive
		await this.page.locator('[role="dialog"] .btn-confirm').click();
	}

	async cancelDestructiveAction() {
		await this.page.locator('[role="dialog"] .btn-cancel').click();
	}

	// --- Invitations revoke ---

	async revokeInvitation(email: string) {
		const card = this.getInvitationCard(email);
		await card.getByRole('button', { name: /revoke invitation/i }).click();
	}

	// --- Loading state ---

	async waitForLoaded() {
		await expect(this.page.locator('.loading')).not.toBeVisible({ timeout: 8000 });
	}
}
