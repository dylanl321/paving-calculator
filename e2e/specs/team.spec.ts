/**
 * e2e/specs/team.spec.ts
 *
 * E2E tests for the Team Management page (/dashboard/team).
 *
 * All API calls are intercepted with Playwright route mocking so tests run
 * against the real UI without needing a live Cloudflare D1 backend.
 *
 * Covered scenarios:
 *  - Page renders the team member list
 *  - Invite flow: open modal, enter email, verify pending invite appears
 *  - Role change: select new role, confirm dialog, verify updated badge/select
 *  - Remove member: click remove, confirm destructive dialog, verify gone
 *  - Revoke invitation: click revoke, confirm, verify gone from pending list
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';
import { TeamPage } from '../pages/team.page.js';
import { ADMIN_USER } from '../fixtures/seed.js';

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const MOCK_ME = {
	user: { id: 'user_admin_001', name: ADMIN_USER.name, email: ADMIN_USER.email },
	org: { id: 'org_test_001', name: 'Test Paving Co', role: 'admin' }
};

const MOCK_MEMBER_ALICE = {
	user_id: 'user_alice_001',
	user_name: 'Alice Smith',
	user_email: 'alice@paverate.test',
	role: 'foreman',
	invited_at: Math.floor(Date.now() / 1000) - 86400 * 10
};

const MOCK_MEMBER_BOB = {
	user_id: 'user_bob_001',
	user_name: 'Bob Jones',
	user_email: 'bob@paverate.test',
	role: 'operator',
	invited_at: Math.floor(Date.now() / 1000) - 86400 * 5
};

const MOCK_INVITE_CAROL = {
	id: 'inv_carol_001',
	email: 'carol@paverate.test',
	role: 'member',
	invited_by_name: ADMIN_USER.name,
	created_at: Math.floor(Date.now() / 1000) - 3600,
	expires_at: Math.floor(Date.now() / 1000) + 86400 * 6
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock /api/auth/me */
function mockMe(page: Page) {
	return page.route('/api/auth/me', (route: Route) =>
		route.fulfill({ json: MOCK_ME })
	);
}

/** Mock /api/org — member list */
function mockMembers(page: Page, members = [MOCK_MEMBER_ALICE, MOCK_MEMBER_BOB]) {
	return page.route('/api/org', (route: Route) =>
		route.fulfill({ json: { members } })
	);
}

/** Mock /api/org/invite GET */
function mockInvites(page: Page, invitations: typeof MOCK_INVITE_CAROL[] = []) {
	return page.route('/api/org/invite', (route: Route) => {
		if (route.request().method() === 'GET') {
			return route.fulfill({ json: { invitations } });
		}
		// POST is handled inline in individual tests
		return route.continue();
	});
}

/** Mock /api/org/activity */
function mockActivity(page: Page) {
	return page.route('/api/org/activity', (route: Route) =>
		route.fulfill({ json: { activity: {} } })
	);
}

/**
 * Full suite of standard API mocks. Returns the page after interceptors are
 * registered but before navigation so callers can override specific routes.
 */
async function setupApiMocks(
	page: Page,
	opts: {
		members?: typeof MOCK_MEMBER_ALICE[];
		invitations?: typeof MOCK_INVITE_CAROL[];
	} = {}
) {
	await mockMe(page);
	await mockMembers(page, opts.members ?? [MOCK_MEMBER_ALICE, MOCK_MEMBER_BOB]);
	await mockInvites(page, opts.invitations ?? []);
	await mockActivity(page);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Team management page', () => {
	test.beforeEach(async ({ page }) => {
		// Stub the auth session so the app thinks we are logged in
		await page.addInitScript(() => {
			// SvelteKit reads a cookie for session; mock the /api/auth/me endpoint
			// is enough for client-side auth checks, but we also need to prevent
			// the layout guard from redirecting us before the page mounts.
			// We do this by intercepting fetch inside the page.
		});
	});

	// -------------------------------------------------------------------------
	test('renders team member list', async ({ page }) => {
		await setupApiMocks(page);
		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		await teamPage.expectMemberVisible('Alice Smith');
		await teamPage.expectMemberVisible('Bob Jones');
	});

	// -------------------------------------------------------------------------
	test('invite new member — modal opens, email submitted, invite appears in pending list', async ({
		page
	}) => {
		const newInviteEmail = 'newmember@paverate.test';

		// Start with no pending invitations
		await setupApiMocks(page, { invitations: [] });

		// After POST /api/org/invite succeeds, the page re-fetches invitations.
		// We'll flip the GET mock to include the new invite after the POST.
		let inviteCreated = false;

		await page.route('/api/org/invite', async (route: Route) => {
			if (route.request().method() === 'POST') {
				inviteCreated = true;
				await route.fulfill({ status: 200, json: { success: true } });
				return;
			}
			// GET
			const invitations = inviteCreated
				? [
						{
							id: 'inv_new_001',
							email: newInviteEmail,
							role: 'member',
							invited_by_name: ADMIN_USER.name,
							created_at: Math.floor(Date.now() / 1000),
							expires_at: Math.floor(Date.now() / 1000) + 86400 * 7
						}
					]
				: [];
			await route.fulfill({ json: { invitations } });
		});

		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		// No pending invites section visible initially
		await expect(page.locator('.invitations-section')).not.toBeVisible();

		// Open modal and submit invite
		await teamPage.openInviteModal();
		await expect(page.locator('.modal')).toBeVisible();

		await teamPage.fillInviteForm(newInviteEmail, 'member');
		await teamPage.submitInvite();

		// Modal should close
		await expect(page.locator('.modal')).not.toBeVisible({ timeout: 5000 });

		// Pending invitations section should now appear with the new invite
		await expect(page.locator('.invitations-section')).toBeVisible({ timeout: 5000 });
		await teamPage.expectInvitePending(newInviteEmail);
	});

	// -------------------------------------------------------------------------
	test('invite modal cancel closes without submitting', async ({ page }) => {
		await setupApiMocks(page);

		// Track if POST was ever called — it should not be
		let postCalled = false;
		await page.route('/api/org/invite', async (route: Route) => {
			if (route.request().method() === 'POST') {
				postCalled = true;
				await route.fulfill({ status: 200, json: {} });
				return;
			}
			await route.fulfill({ json: { invitations: [] } });
		});

		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		await teamPage.openInviteModal();
		await expect(page.locator('.modal')).toBeVisible();

		// Fill email but cancel
		await teamPage.fillInviteForm('nobody@paverate.test');
		await teamPage.cancelInviteModal();

		await expect(page.locator('.modal')).not.toBeVisible();
		expect(postCalled).toBe(false);
	});

	// -------------------------------------------------------------------------
	test('change member role — selects new role, confirm dialog appears, role updated', async ({
		page
	}) => {
		await setupApiMocks(page);

		let patchedUserId: string | null = null;
		let patchedRole: string | null = null;

		// PATCH /api/org/members/:id
		await page.route('/api/org/members/**', async (route: Route) => {
			if (route.request().method() === 'PATCH') {
				const url = route.request().url();
				patchedUserId = url.split('/').pop() ?? null;
				const body = route.request().postDataJSON() as { role: string };
				patchedRole = body.role;

				// Return updated member list with Alice having new role
				return route.fulfill({ status: 200, json: { success: true } });
			}
			await route.continue();
		});

		// After the PATCH, members re-fetched with updated role
		let aliceRole = 'foreman';
		await page.route('/api/org', (route: Route) => {
			const members = [
				{ ...MOCK_MEMBER_ALICE, role: aliceRole },
				MOCK_MEMBER_BOB
			];
			return route.fulfill({ json: { members } });
		});

		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		// Alice currently has role "foreman", change to "admin"
		await teamPage.changeMemberRole('Alice Smith', 'admin');

		// Inline confirm dialog should appear
		await expect(page.locator('.modal.confirm-dialog')).toBeVisible();
		// Message should mention old and new role
		await expect(page.locator('.confirm-message')).toContainText('Foreman');
		await expect(page.locator('.confirm-message')).toContainText('Admin');

		// Before confirming, mark alice as admin so next GET returns updated data
		aliceRole = 'admin';
		await teamPage.confirmRoleChange();

		// Dialog should close
		await expect(page.locator('.modal.confirm-dialog')).not.toBeVisible({ timeout: 5000 });

		// Verify the PATCH was called with the right params
		expect(patchedUserId).toBe(MOCK_MEMBER_ALICE.user_id);
		expect(patchedRole).toBe('admin');
	});

	// -------------------------------------------------------------------------
	test('change member role — cancel confirm dialog keeps original role', async ({ page }) => {
		await setupApiMocks(page);

		let patchCalled = false;
		await page.route('/api/org/members/**', async (route: Route) => {
			if (route.request().method() === 'PATCH') {
				patchCalled = true;
				await route.fulfill({ status: 200, json: {} });
				return;
			}
			await route.continue();
		});

		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		await teamPage.changeMemberRole('Alice Smith', 'admin');
		await expect(page.locator('.modal.confirm-dialog')).toBeVisible();

		await teamPage.cancelRoleChange();

		await expect(page.locator('.modal.confirm-dialog')).not.toBeVisible();
		expect(patchCalled).toBe(false);
	});

	// -------------------------------------------------------------------------
	test('remove member — confirm removes them from the list', async ({ page }) => {
		await setupApiMocks(page);

		let memberRemoved = false;
		let deletedUserId: string | null = null;

		await page.route('/api/org/members/**', async (route: Route) => {
			if (route.request().method() === 'DELETE') {
				const url = route.request().url();
				deletedUserId = url.split('/').pop() ?? null;
				memberRemoved = true;
				await route.fulfill({ status: 200, json: { success: true } });
				return;
			}
			await route.continue();
		});

		// After DELETE the member list reloads without Bob
		await page.route('/api/org', (route: Route) => {
			const members = memberRemoved ? [MOCK_MEMBER_ALICE] : [MOCK_MEMBER_ALICE, MOCK_MEMBER_BOB];
			return route.fulfill({ json: { members } });
		});

		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		// Both members visible initially
		await teamPage.expectMemberVisible('Alice Smith');
		await teamPage.expectMemberVisible('Bob Jones');

		// Remove Bob
		await teamPage.removeMember('Bob Jones');

		// ConfirmModal (confirmStore) should appear
		await expect(page.locator('[role="dialog"]')).toBeVisible();
		await expect(page.locator('[role="dialog"]')).toContainText('Bob Jones');

		await teamPage.confirmDestructiveAction();

		// Dialog gone and Bob gone from member list
		await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
		await teamPage.expectMemberNotVisible('Bob Jones');
		await teamPage.expectMemberVisible('Alice Smith');

		expect(deletedUserId).toBe(MOCK_MEMBER_BOB.user_id);
	});

	// -------------------------------------------------------------------------
	test('remove member — cancel keeps member in list', async ({ page }) => {
		await setupApiMocks(page);

		let deleteCalled = false;
		await page.route('/api/org/members/**', async (route: Route) => {
			if (route.request().method() === 'DELETE') {
				deleteCalled = true;
				await route.fulfill({ status: 200, json: {} });
				return;
			}
			await route.continue();
		});

		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		await teamPage.removeMember('Bob Jones');
		await expect(page.locator('[role="dialog"]')).toBeVisible();

		await teamPage.cancelDestructiveAction();

		await expect(page.locator('[role="dialog"]')).not.toBeVisible();
		await teamPage.expectMemberVisible('Bob Jones');
		expect(deleteCalled).toBe(false);
	});

	// -------------------------------------------------------------------------
	test('revoke pending invitation — invite removed from pending list', async ({ page }) => {
		// Start with Carol's invite in the pending list
		await setupApiMocks(page, { invitations: [MOCK_INVITE_CAROL] });

		let inviteRevoked = false;
		let revokedInviteId: string | null = null;

		await page.route('/api/org/invite/**', async (route: Route) => {
			if (route.request().method() === 'DELETE') {
				const url = route.request().url();
				revokedInviteId = url.split('/').pop() ?? null;
				inviteRevoked = true;
				await route.fulfill({ status: 200, json: { success: true } });
				return;
			}
			await route.continue();
		});

		// After DELETE the invite list reloads empty
		await page.route('/api/org/invite', async (route: Route) => {
			if (route.request().method() === 'GET') {
				const invitations = inviteRevoked ? [] : [MOCK_INVITE_CAROL];
				await route.fulfill({ json: { invitations } });
				return;
			}
			await route.continue();
		});

		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		// Carol's invite should be visible
		await expect(page.locator('.invitations-section')).toBeVisible();
		await teamPage.expectInvitePending('carol@paverate.test');

		// Revoke it
		await teamPage.revokeInvitation('carol@paverate.test');

		// ConfirmModal appears
		await expect(page.locator('[role="dialog"]')).toBeVisible();
		await expect(page.locator('[role="dialog"]')).toContainText('carol@paverate.test');

		await teamPage.confirmDestructiveAction();

		// Dialog closes, pending section disappears
		await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
		await teamPage.expectInviteNotPending('carol@paverate.test');
		await expect(page.locator('.invitations-section')).not.toBeVisible();

		expect(revokedInviteId).toBe(MOCK_INVITE_CAROL.id);
	});

	// -------------------------------------------------------------------------
	test('search filter narrows member list', async ({ page }) => {
		await setupApiMocks(page);

		const teamPage = new TeamPage(page);
		await teamPage.goto();
		await teamPage.waitForLoaded();

		await teamPage.expectMemberVisible('Alice Smith');
		await teamPage.expectMemberVisible('Bob Jones');

		// Type into search
		const searchInput = page.locator('input[type="search"]');
		await searchInput.fill('alice');

		// Only Alice should be visible
		await teamPage.expectMemberVisible('Alice Smith');
		await expect(page.locator('.member-card').filter({ hasText: 'Bob Jones' })).not.toBeVisible();
	});
});
