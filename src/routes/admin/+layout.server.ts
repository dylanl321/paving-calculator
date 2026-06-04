import { redirect } from '@sveltejs/kit';
import { getAuthUser } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

/**
 * Admin console access guard.
 *
 * The unified admin console serves two audiences:
 *  - Global (platform) admins: full access to every org/user/email/audit section.
 *  - Org owners/admins: access to their own organization's admin sections.
 *
 * Entry is allowed for either; the shell uses the returned `isGlobalAdmin` /
 * `orgRole` flags to decide which sidebar groups to show. Each section's own
 * server loaders / API endpoints retain their stricter guards, so unifying the
 * entry point here does not loosen any data access.
 */
export const load: LayoutServerLoad = async (event) => {
	const user = await getAuthUser(event);
	if (!user) throw redirect(303, '/login');

	let orgRole: string | null = null;
	let orgId: string | null = null;
	let orgName: string | null = null;

	if (event.platform?.env?.DB) {
		const db = new DbHelper(event.platform.env.DB);
		const org = await db.getOrgByUserId(user.id);
		if (org) {
			orgId = org.id;
			orgName = org.name;
			orgRole = await db.getUserRole(user.id, org.id);
		}
	}

	const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';

	// Must be a global admin or an org owner/admin to enter the console at all.
	if (!user.isGlobalAdmin && !isOrgAdmin) {
		throw redirect(303, '/dashboard');
	}

	return {
		adminUser: user,
		isGlobalAdmin: !!user.isGlobalAdmin,
		orgRole,
		orgId,
		orgName,
		isOrgAdmin
	};
};
