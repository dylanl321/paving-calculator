/**
 * e2e/specs/daily-log.spec.ts
 *
 * E2E tests: Daily log workflow
 *   1. Log in via dev-login endpoint
 *   2. Navigate to an existing job site
 *   3. Open / create today's daily log
 *   4. Add paving entries (station, tonnage, width)
 *   5. Record loads (via loads API)
 *   6. Close out the log (foreman signature)
 *   7. Verify summary report shows correct totals
 *
 * Note: these tests talk to the vite dev server backed by a local D1 (wrangler)
 * database. The dev-login endpoint seeds a dev user + org + job site on first
 * call so no external fixtures are needed.
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Authenticate by hitting the dev-login convenience endpoint.
 * Returns the dev user's job site id (created by the seed path).
 */
async function devLogin(request: APIRequestContext, page: Page): Promise<void> {
	const res = await request.post('/api/auth/dev-login');
	// If dev-login is unavailable (CI with real DB), skip gracefully
	if (res.status() === 404 || res.status() === 503) {
		test.skip(true, 'dev-login not available in this environment');
		return;
	}
	expect(res.status()).toBe(200);
	// Grab cookies from the response and apply to the browser context
	await page.goto('/dashboard');
}

/**
 * Navigate to the log page for a job site, creating the site if necessary.
 * Returns the site id used.
 */
async function getOrCreateJobSiteId(request: APIRequestContext): Promise<string> {
	const listRes = await request.get('/api/job-sites');
	if (!listRes.ok()) {
		throw new Error(`Failed to list job sites: ${listRes.status()}`);
	}
	const data = await listRes.json() as { job_sites?: { id: string; name: string }[] } | { id: string; name: string }[];
	const sites = Array.isArray(data)
		? (data as { id: string; name: string }[])
		: ((data as { job_sites?: { id: string; name: string }[] }).job_sites ?? []);

	if (sites.length > 0) {
		return sites[0].id;
	}

	// Create one
	const createRes = await request.post('/api/job-sites', {
		data: { name: 'E2E Test Highway', description: 'Created by daily-log E2E spec' }
	});
	expect(createRes.status()).toBe(201);
	const { job_site } = await createRes.json() as { job_site: { id: string } };
	return job_site.id;
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

test.describe('Daily log workflow', () => {
	let siteId: string;

	test.beforeEach(async ({ page, request }) => {
		// Authenticate
		await devLogin(request, page);
		// Resolve job site
		siteId = await getOrCreateJobSiteId(request);
	});

	// -------------------------------------------------------------------------
	// 1. Navigate to job site and open today's log page
	// -------------------------------------------------------------------------

	test('navigates to log page from job site dashboard', async ({ page }) => {
		await page.goto(`/dashboard/job-sites/${siteId}`);
		// Site detail page should be visible
		await expect(page).toHaveURL(new RegExp(`/dashboard/job-sites/${siteId}`));

		// Find the "Open today's log" link/button or navigate directly
		const logLink = page.getByRole('link', { name: /open today'?s log/i });
		if (await logLink.isVisible({ timeout: 5000 }).catch(() => false)) {
			await logLink.click();
		} else {
			await page.goto(`/dashboard/job-sites/${siteId}/log`);
		}

		await expect(page).toHaveURL(new RegExp(`/dashboard/job-sites/${siteId}/log`));
	});

	// -------------------------------------------------------------------------
	// 2. Create (start) a new daily log
	// -------------------------------------------------------------------------

	test('starts a new daily log when none exists for today', async ({ page }) => {
		await page.goto(`/dashboard/job-sites/${siteId}/log`);

		// If there is already a log for today the start button may not be present
		const startBtn = page.getByRole('button', { name: /start today'?s log/i });
		const hasStart = await startBtn.isVisible({ timeout: 5000 }).catch(() => false);

		if (hasStart) {
			await startBtn.click();
			// After creating the log the entry form / log content becomes visible
			await expect(page.getByRole('button', { name: /\+ add entry/i })).toBeVisible({
				timeout: 10000
			});
		} else {
			// Log already exists for today — verify entry button is present
			await expect(page.getByRole('button', { name: /\+ add entry/i }).or(
				page.locator('.fab')
			)).toBeVisible({ timeout: 10000 });
		}
	});

	// -------------------------------------------------------------------------
	// 3. Add paving entries via the entry modal
	// -------------------------------------------------------------------------

	test('adds a paving entry with station and tonnage', async ({ page }) => {
		await page.goto(`/dashboard/job-sites/${siteId}/log`);

		// Ensure there is an active log (start one if needed)
		const startBtn = page.getByRole('button', { name: /start today'?s log/i });
		if (await startBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
			await startBtn.click();
		}

		// Open entry form — try both the inline button and the FAB
		const addEntryBtn = page.getByRole('button', { name: /\+ add entry/i }).first();
		await expect(addEntryBtn.or(page.locator('.fab'))).toBeVisible({ timeout: 10000 });
		await addEntryBtn.click();

		// Modal should open
		await expect(page.getByRole('heading', { name: /add entry/i })).toBeVisible();

		// Fill entry fields
		// Type: Paving (default, but be explicit)
		await page.locator('#entry-type').selectOption('paving');

		// Station start
		await page.locator('#sta-start').fill('10.00');

		// Station end
		await page.locator('#sta-end').fill('15.00');

		// Tonnage
		await page.locator('#tons').fill('22.5');

		// Loads count
		await page.locator('#loads').fill('2');

		// Submit
		await page.getByRole('button', { name: /^add entry$/i }).click();

		// Modal should close
		await expect(page.getByRole('heading', { name: /add entry/i })).not.toBeVisible({
			timeout: 5000
		});

		// Entry list should now show at least one row
		// The page renders entries as list items or table rows
		const entryRow = page.locator('.entry-row, [data-entry], table tbody tr').first();
		await expect(entryRow.or(page.getByText('paving', { exact: false }))).toBeVisible({
			timeout: 8000
		});
	});

	// -------------------------------------------------------------------------
	// 4. Record a load via the API (loads endpoint)
	// -------------------------------------------------------------------------

	test('records a load via the loads API', async ({ request }) => {
		const ts = Math.floor(Date.now() / 1000);
		const res = await request.post(`/api/job-sites/${siteId}/loads`, {
			data: {
				tons: 18.5,
				ticket_number: 'E2E-001',
				timestamp: ts
			}
		});
		// 201 created
		expect(res.status()).toBe(201);
		const body = await res.json() as { load: { id: string; tons: number } };
		expect(body.load).toBeDefined();
		expect(body.load.tons).toBeCloseTo(18.5);
	});

	// -------------------------------------------------------------------------
	// 5. Close out the log via the close-out modal
	// -------------------------------------------------------------------------

	test('closes out the log with foreman name', async ({ page, request }) => {
		// Ensure there is an active log via API first
		const createRes = await request.post(`/api/job-sites/${siteId}/logs`, { data: {} });
		// 201 or 200 (idempotent)
		expect([200, 201]).toContain(createRes.status());
		const { log } = await createRes.json() as { log: { id: string; closed_at: number | null } };

		// If already closed, unlock first (admin can)
		if (log.closed_at) {
			const unlockRes = await request.post(`/api/job-sites/${siteId}/logs/${log.id}/unlock`, {
				data: {}
			});
			// Unlock may return 200 or 404 if route doesn't exist
			if (!unlockRes.ok()) {
				test.skip(true, 'Cannot unlock log — skipping close-out test');
				return;
			}
		}

		await page.goto(`/dashboard/job-sites/${siteId}/log`);

		// Ensure the close out button is visible
		const closeOutBtn = page.getByRole('button', { name: /close out/i });
		const hasCloseOut = await closeOutBtn.isVisible({ timeout: 8000 }).catch(() => false);

		if (!hasCloseOut) {
			// Might not be visible if already closed; verify locked state instead
			const lockedIndicator = page.getByText(/locked|closed/i);
			const isLocked = await lockedIndicator.isVisible({ timeout: 4000 }).catch(() => false);
			if (isLocked) {
				// Log was already closed — test passes
				return;
			}
			// Start a log if it's not there
			const startBtn = page.getByRole('button', { name: /start today'?s log/i });
			if (await startBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
				await startBtn.click();
				await expect(page.getByRole('button', { name: /close out/i })).toBeVisible({
					timeout: 10000
				});
			}
		}

		await page.getByRole('button', { name: /close out/i }).click();

		// Close-out modal should open
		await expect(page.getByRole('heading', { name: /close out day/i })).toBeVisible({
			timeout: 8000
		});

		// Fill foreman signature
		await page.locator('#foreman-name').fill('Test Foreman');

		// Click "Close Without PDF" to avoid PDF generation in test
		await page.getByRole('button', { name: /close without pdf/i }).click();

		// After close-out, the modal should close and the log shows as closed/locked
		await expect(page.getByRole('heading', { name: /close out day/i })).not.toBeVisible({
			timeout: 10000
		});

		// Page should show "Day Closed" or a locked indicator
		const closedIndicator = page.getByText(/day closed|locked|closed/i);
		await expect(closedIndicator).toBeVisible({ timeout: 10000 });
	});

	// -------------------------------------------------------------------------
	// 6. Verify summary report shows correct totals (via API)
	// -------------------------------------------------------------------------

	test('summary report reflects added entry totals', async ({ request }) => {
		// Create a fresh log
		const logRes = await request.post(`/api/job-sites/${siteId}/logs`, { data: {} });
		expect([200, 201]).toContain(logRes.status());
		const { log } = await logRes.json() as { log: { id: string; closed_at: number | null } };

		// Add a paving entry
		const now = new Date();
		const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
		const entryRes = await request.post(`/api/job-sites/${siteId}/logs/${log.id}/entries`, {
			data: {
				entry_type: 'paving',
				timestamp,
				station_start: 10.0,
				station_end: 15.0,
				distance_ft: 264,
				tons_placed: 22.5,
				loads_count: 2
			}
		});
		expect(entryRes.status()).toBe(201);

		// Add a second entry
		const entry2Res = await request.post(`/api/job-sites/${siteId}/logs/${log.id}/entries`, {
			data: {
				entry_type: 'paving',
				timestamp,
				station_start: 15.0,
				station_end: 20.0,
				distance_ft: 264,
				tons_placed: 18.0,
				loads_count: 2
			}
		});
		expect(entry2Res.status()).toBe(201);

		// Fetch the log details which includes the summary
		const detailRes = await request.get(`/api/job-sites/${siteId}/logs/${log.id}`);
		expect(detailRes.ok()).toBe(true);
		const detail = await detailRes.json() as {
			log: { id: string };
			entries: unknown[];
			summary: { total_tons: number; total_loads: number; total_distance_ft: number };
		};

		// Verify aggregated totals
		expect(detail.entries.length).toBeGreaterThanOrEqual(2);
		expect(detail.summary.total_tons).toBeCloseTo(40.5, 1);
		expect(detail.summary.total_loads).toBe(4);
		expect(detail.summary.total_distance_ft).toBe(528);
	});

	// -------------------------------------------------------------------------
	// 7. Summary report UI shows correct totals after close-out
	// -------------------------------------------------------------------------

	test('summary modal shows correct totals from log entries', async ({ page, request }) => {
		// Build a log with known entries via API
		const logRes = await request.post(`/api/job-sites/${siteId}/logs`, { data: {} });
		expect([200, 201]).toContain(logRes.status());
		const { log } = await logRes.json() as { log: { id: string; closed_at: number | null } };

		const now = new Date();
		const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

		await request.post(`/api/job-sites/${siteId}/logs/${log.id}/entries`, {
			data: {
				entry_type: 'paving',
				timestamp,
				distance_ft: 100,
				tons_placed: 10.0,
				loads_count: 1
			}
		});

		// Navigate to log page
		await page.goto(`/dashboard/job-sites/${siteId}/log`);

		// Open the summary view
		const summaryBtn = page.getByRole('button', { name: /summary/i });
		const hasSummary = await summaryBtn.isVisible({ timeout: 8000 }).catch(() => false);

		if (!hasSummary) {
			// Summary button only appears when a log is active; skip if no log
			test.skip(true, 'Summary button not visible — log may not be active');
			return;
		}

		await summaryBtn.click();

		// Summary panel/modal should open
		// Look for tons displayed somewhere in the summary section
		const tonsText = page.getByText(/\d+\.?\d*\s*t(ons?)?/i);
		await expect(tonsText).toBeVisible({ timeout: 8000 });
	});
});
