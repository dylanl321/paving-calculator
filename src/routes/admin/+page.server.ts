import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// Mirrors the layout guard but enforces admin at the data layer too.
	await requireGlobalAdmin(event);
	const db = new DbHelper(event.platform!.env.DB);

	const [stats, recentUsers, recentOrgs, needingAttention, recentFailedEmails] = await Promise.all([
		db.getAdminStats(),
		db.getRecentUsers(6),
		db.getRecentOrganizations(6),
		db.getOrgsNeedingAttention(),
		db.getEmailLog({ failedOnly: true, limit: 8 }).catch(() => [])
	]);

	return {
		stats,
		recentUsers: recentUsers.map(({ password_hash, ...u }) => u),
		recentOrgs,
		needingAttention,
		recentFailedEmails
	};
};
