import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';

interface HealthSection {
	count: number;
	sample_ids: string[];
}

interface DbHealthReport {
	generated_at: string;
	checks: {
		orphaned_users: HealthSection;
		orphaned_org_members: HealthSection;
		orphaned_daily_logs: HealthSection;
		expired_email_tokens: HealthSection;
		old_sessions: HealthSection;
	};
}

export async function GET(event: RequestEvent) {
	try {
		// Super-admin only: verify user email is in SUPER_ADMIN_EMAILS env var
		const user = await requireGlobalAdmin(event);

		const superEmails = event.platform?.env?.SUPER_ADMIN_EMAILS;
		if (!superEmails) {
			return json({ error: 'Forbidden: SUPER_ADMIN_EMAILS not configured' }, { status: 403 });
		}
		const allowed = superEmails.split(',').map((e: string) => e.trim().toLowerCase());
		if (!allowed.includes(user.email.toLowerCase())) {
			return json({ error: 'Forbidden: email not in super-admin allowlist' }, { status: 403 });
		}

		const db = event.platform!.env.DB;
		if (!db) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		const now = Math.floor(Date.now() / 1000);
		const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

		// 1. Orphaned users — users with no org_members row
		const orphanedUsersResult = await db.prepare(`
			SELECT u.id
			FROM users u
			LEFT JOIN org_members om ON om.user_id = u.id
			WHERE om.user_id IS NULL
			ORDER BY u.created_at DESC
			LIMIT 5
		`).all();

		const orphanedUsersCount = await db.prepare(`
			SELECT COUNT(*) AS cnt
			FROM users u
			LEFT JOIN org_members om ON om.user_id = u.id
			WHERE om.user_id IS NULL
		`).first<{ cnt: number }>();

		// 2. Orphaned org_members — org_members whose org doesn't exist
		const orphanedOrgMembersResult = await db.prepare(`
			SELECT om.id
			FROM org_members om
			LEFT JOIN organizations o ON o.id = om.org_id
			WHERE o.id IS NULL
			ORDER BY om.id DESC
			LIMIT 5
		`).all();

		const orphanedOrgMembersCount = await db.prepare(`
			SELECT COUNT(*) AS cnt
			FROM org_members om
			LEFT JOIN organizations o ON o.id = om.org_id
			WHERE o.id IS NULL
		`).first<{ cnt: number }>();

		// 3. Orphaned daily_logs — daily_logs whose job_site doesn't exist
		const orphanedDailyLogsResult = await db.prepare(`
			SELECT dl.id
			FROM daily_logs dl
			LEFT JOIN job_sites js ON js.id = dl.job_site_id
			WHERE js.id IS NULL
			ORDER BY dl.created_at DESC
			LIMIT 5
		`).all();

		const orphanedDailyLogsCount = await db.prepare(`
			SELECT COUNT(*) AS cnt
			FROM daily_logs dl
			LEFT JOIN job_sites js ON js.id = dl.job_site_id
			WHERE js.id IS NULL
		`).first<{ cnt: number }>();

		// 4. Expired email_tokens
		const expiredTokensResult = await db.prepare(`
			SELECT id
			FROM email_tokens
			WHERE expires_at < ?
			ORDER BY expires_at ASC
			LIMIT 5
		`).bind(now).all();

		const expiredTokensCount = await db.prepare(`
			SELECT COUNT(*) AS cnt
			FROM email_tokens
			WHERE expires_at < ?
		`).bind(now).first<{ cnt: number }>();

		// 5. Sessions older than 30 days
		const oldSessionsResult = await db.prepare(`
			SELECT id
			FROM sessions
			WHERE created_at < ?
			ORDER BY created_at ASC
			LIMIT 5
		`).bind(thirtyDaysAgo).all();

		const oldSessionsCount = await db.prepare(`
			SELECT COUNT(*) AS cnt
			FROM sessions
			WHERE created_at < ?
		`).bind(thirtyDaysAgo).first<{ cnt: number }>();

		const report: DbHealthReport = {
			generated_at: new Date().toISOString(),
			checks: {
				orphaned_users: {
					count: orphanedUsersCount?.cnt ?? 0,
					sample_ids: (orphanedUsersResult.results as Array<{ id: string }>).map((r) => r.id)
				},
				orphaned_org_members: {
					count: orphanedOrgMembersCount?.cnt ?? 0,
					sample_ids: (orphanedOrgMembersResult.results as Array<{ id: string }>).map((r) => r.id)
				},
				orphaned_daily_logs: {
					count: orphanedDailyLogsCount?.cnt ?? 0,
					sample_ids: (orphanedDailyLogsResult.results as Array<{ id: string }>).map((r) => r.id)
				},
				expired_email_tokens: {
					count: expiredTokensCount?.cnt ?? 0,
					sample_ids: (expiredTokensResult.results as Array<{ id: string }>).map((r) => r.id)
				},
				old_sessions: {
					count: oldSessionsCount?.cnt ?? 0,
					sample_ids: (oldSessionsResult.results as Array<{ id: string }>).map((r) => r.id)
				}
			}
		};

		return json(report);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('DB health check error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
