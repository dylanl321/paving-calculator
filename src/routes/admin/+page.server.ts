import { redirect } from '@sveltejs/kit';
import { getAuthUser } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// The overview is the platform (global-admin) home. Org-only admins are
	// routed to their org section instead of hitting a 403 here.
	const user = await getAuthUser(event);
	if (!user) throw redirect(303, '/login');
	if (!user.isGlobalAdmin) throw redirect(303, '/admin/org/activity');

	const db = new DbHelper(event.platform!.env.DB);

	// Query document_feedback grouped by user_corrected_type for the admin view.
	const docFeedbackPromise = event.platform!.env.DB
		.prepare(
			`SELECT
				user_corrected_type,
				COUNT(*) as count,
				MAX(uploaded_at) as last_seen
			FROM document_feedback
			GROUP BY user_corrected_type
			ORDER BY count DESC
			LIMIT 20`
		)
		.all<{ user_corrected_type: string; count: number; last_seen: number }>()
		.then((r) => r.results ?? [])
		.catch(() => []);

	const [stats, recentUsers, recentOrgs, needingAttention, recentFailedEmails, docFeedbackGroups] =
		await Promise.all([
			db.getAdminStats(),
			db.getRecentUsers(6),
			db.getRecentOrganizations(6),
			db.getOrgsNeedingAttention(),
			db.getEmailLog({ failedOnly: true, limit: 8 }).then((r) => r.rows).catch(() => []),
			docFeedbackPromise
		]);

	return {
		stats,
		recentUsers: recentUsers.map(({ password_hash, ...u }) => u),
		recentOrgs,
		needingAttention,
		recentFailedEmails,
		docFeedbackGroups
	};
};
