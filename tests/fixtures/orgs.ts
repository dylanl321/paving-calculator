/**
 * tests/fixtures/orgs.ts
 *
 * Factories for creating test organizations and memberships.
 */

import type { TestDb } from '../helpers/db.js';
import type { DbOrganization, DbOrgMember, OrgRole } from '../../src/lib/server/db-org.js';

let _counter = 0;

export function resetOrgCounter(): void {
	_counter = 0;
}

function nextCounter(): number {
	return ++_counter;
}

export interface CreateTestOrgOptions {
	name?: string;
	slug?: string;
	address?: string | null;
	superintendentEmail?: string | null;
}

/**
 * Insert an organization row directly into the test DB.
 */
export async function createTestOrg(
	testDb: TestDb,
	opts: CreateTestOrgOptions = {}
): Promise<DbOrganization> {
	const n = nextCounter();
	const id = `test-org-${n}`;
	const name = opts.name ?? `Test Org ${n}`;
	const slug = opts.slug ?? `test-org-${n}`;
	const now = Math.floor(Date.now() / 1000);

	await testDb.d1
		.prepare(
			`INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)`
		)
		.bind(id, name, slug, now)
		.run();

	return {
		id,
		name,
		slug,
		address: opts.address ?? null,
		superintendentEmail: opts.superintendentEmail ?? null,
		created_at: now
	} as unknown as DbOrganization;
}

export interface CreateTestMembershipOptions {
	role?: OrgRole;
	/** Whether the invitation has been accepted (default: true) */
	accepted?: boolean;
}

/**
 * Insert an org_members row linking a user to an organization.
 */
export async function createTestMembership(
	testDb: TestDb,
	userId: string,
	orgId: string,
	opts: CreateTestMembershipOptions = {}
): Promise<DbOrgMember> {
	const role: OrgRole = opts.role ?? 'member';
	const now = Math.floor(Date.now() / 1000);
	const accepted = opts.accepted ?? true;
	const acceptedAt = accepted ? now : null;

	await testDb.d1
		.prepare(
			`INSERT INTO org_members (user_id, org_id, role, invited_at, accepted_at)
       VALUES (?, ?, ?, ?, ?)`
		)
		.bind(userId, orgId, role, now, acceptedAt)
		.run();

	return {
		user_id: userId,
		org_id: orgId,
		role,
		invited_at: now,
		accepted_at: acceptedAt
	};
}
