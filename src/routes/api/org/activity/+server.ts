import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

interface MemberActivity {
	action: string;
	resource_type: string;
	created_at: number;
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const d1 = event.platform!.env.DB;

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const members = await db.getOrgMembersByOrgId(org.id);
		const memberIds = members.map((m) => m.user_id);

		const activity: Record<string, MemberActivity | null> = {};

		for (const userId of memberIds) {
			const activities: Array<{ action: string; resource_type: string; created_at: number }> = [];

			try {
				const auditResult = await d1
					.prepare(
						`SELECT action, resource_type, created_at
						FROM audit_log
						WHERE actor_user_id = ?
						ORDER BY created_at DESC
						LIMIT 1`
					)
					.bind(userId)
					.first<{ action: string; resource_type: string; created_at: number }>();

				if (auditResult) {
					activities.push(auditResult);
				}
			} catch (e) {
				console.warn('Failed to query audit_log:', e);
			}

			try {
				const calcResult = await d1
					.prepare(
						`SELECT calc_type, created_at
						FROM calculations
						WHERE user_id = ?
						ORDER BY created_at DESC
						LIMIT 1`
					)
					.bind(userId)
					.first<{ calc_type: string; created_at: number }>();

				if (calcResult) {
					activities.push({
						action: 'ran calc',
						resource_type: calcResult.calc_type,
						created_at: calcResult.created_at
					});
				}
			} catch (e) {
				console.warn('Failed to query calculations:', e);
			}

			try {
				const logResult = await d1
					.prepare(
						`SELECT created_at
						FROM daily_logs
						WHERE created_by = ?
						ORDER BY created_at DESC
						LIMIT 1`
					)
					.bind(userId)
					.first<{ created_at: number }>();

				if (logResult) {
					activities.push({
						action: 'logged day',
						resource_type: 'daily_log',
						created_at: logResult.created_at
					});
				}
			} catch (e) {
				console.warn('Failed to query daily_logs:', e);
			}

			if (activities.length === 0) {
				activity[userId] = null;
			} else {
				activities.sort((a, b) => b.created_at - a.created_at);
				activity[userId] = activities[0];
			}
		}

		return json({ activity });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Get activity error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
