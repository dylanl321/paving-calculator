/**
 * tests/fixtures/job-sites.ts
 *
 * Factory for creating test job sites in the in-memory D1-compatible database.
 */

import type { TestDb } from '../helpers/db.js';
import type { DbJobSite } from '../../src/lib/server/db-jobsites.js';

let _counter = 0;

export function resetJobSiteCounter(): void {
	_counter = 0;
}

function nextCounter(): number {
	return ++_counter;
}

export interface CreateTestJobSiteOptions {
	name?: string;
	locationDescription?: string | null;
	status?: 'active' | 'completed' | 'archived';
	jobNumber?: string | null;
	projectNumber?: string | null;
	latitude?: number | null;
	longitude?: number | null;
}

/**
 * Insert a job_sites row directly into the test DB.
 * orgId is required because job_sites has a NOT NULL FK to organizations.
 */
export async function createTestJobSite(
	testDb: TestDb,
	orgId: string,
	opts: CreateTestJobSiteOptions = {}
): Promise<DbJobSite> {
	const n = nextCounter();
	const id = `test-site-${n}`;
	const name = opts.name ?? `Test Job Site ${n}`;
	const locationDescription = opts.locationDescription ?? null;
	const status = opts.status ?? 'active';
	const jobNumber = opts.jobNumber ?? null;
	const projectNumber = opts.projectNumber ?? null;
	const latitude = opts.latitude ?? null;
	const longitude = opts.longitude ?? null;
	const now = Math.floor(Date.now() / 1000);

	await testDb.d1
		.prepare(
			`INSERT INTO job_sites
        (id, org_id, name, location_description, status, job_number, project_number,
         latitude, longitude, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(id, orgId, name, locationDescription, status, jobNumber, projectNumber, latitude, longitude, now, now)
		.run();

	return {
		id,
		org_id: orgId,
		name,
		location_description: locationDescription,
		latitude,
		longitude,
		gdot_county: null,
		gdot_district: null,
		status,
		job_number: jobNumber,
		project_number: projectNumber,
		contract_id: null,
		work_type: null,
		contract_type: null,
		contract_amount: null,
		retainage_pct: null,
		est_start_date: null,
		completion_date: null,
		customer_name: null,
		customer_address: null,
		customer_contact: null,
		customer_phone: null,
		customer_email: null,
		owner_name: null,
		owner_address: null,
		project_manager: null,
		asphalt_supplier: null,
		import_source_key: null,
		scopes_json: null,
		created_at: now,
		updated_at: now
	};
}
