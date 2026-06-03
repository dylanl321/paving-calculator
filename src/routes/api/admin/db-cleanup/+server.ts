import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';

type CleanupAction = 'purge_expired_tokens' | 'remove_orphaned_sessions' | 'normalize_emails';

interface CleanupRequest {
	action: CleanupAction;
}

interface CleanupResponse {
	action: CleanupAction;
	records_affected: number;
	dry_run: boolean;
}

export async function POST(event: RequestEvent) {
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

		// Parse request body
		const body = (await event.request.json()) as CleanupRequest;
		const { action } = body;

		// Validate action
		const validActions: CleanupAction[] = ['purge_expired_tokens', 'remove_orphaned_sessions', 'normalize_emails'];
		if (!action || !validActions.includes(action)) {
			return json({ error: 'Invalid action. Must be one of: purge_expired_tokens, remove_orphaned_sessions, normalize_emails' }, { status: 400 });
		}

		// Check for dry_run query param
		const dryRun = event.url.searchParams.get('dry_run') === 'true';

		const now = Math.floor(Date.now() / 1000);
		let recordsAffected = 0;

		switch (action) {
			case 'purge_expired_tokens': {
				if (dryRun) {
					const result = await db.prepare(`
						SELECT COUNT(*) AS cnt
						FROM email_tokens
						WHERE expires_at < ?
					`).bind(now).first<{ cnt: number }>();
					recordsAffected = result?.cnt ?? 0;
				} else {
					const result = await db.prepare(`
						DELETE FROM email_tokens
						WHERE expires_at < ?
					`).bind(now).run();
					recordsAffected = result.meta.changes;
				}
				break;
			}

			case 'remove_orphaned_sessions': {
				if (dryRun) {
					const result = await db.prepare(`
						SELECT COUNT(*) AS cnt
						FROM sessions s
						LEFT JOIN users u ON u.id = s.user_id
						WHERE u.id IS NULL
					`).first<{ cnt: number }>();
					recordsAffected = result?.cnt ?? 0;
				} else {
					const result = await db.prepare(`
						DELETE FROM sessions
						WHERE id IN (
							SELECT s.id
							FROM sessions s
							LEFT JOIN users u ON u.id = s.user_id
							WHERE u.id IS NULL
						)
					`).run();
					recordsAffected = result.meta.changes;
				}
				break;
			}

			case 'normalize_emails': {
				if (dryRun) {
					const result = await db.prepare(`
						SELECT COUNT(*) AS cnt
						FROM users
						WHERE email != LOWER(TRIM(email))
					`).first<{ cnt: number }>();
					recordsAffected = result?.cnt ?? 0;
				} else {
					const result = await db.prepare(`
						UPDATE users
						SET email = LOWER(TRIM(email))
						WHERE email != LOWER(TRIM(email))
					`).run();
					recordsAffected = result.meta.changes;
				}
				break;
			}
		}

		const response: CleanupResponse = {
			action,
			records_affected: recordsAffected,
			dry_run: dryRun
		};

		return json(response);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('DB cleanup error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// Return 405 for non-POST requests
export async function GET() {
	return json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
