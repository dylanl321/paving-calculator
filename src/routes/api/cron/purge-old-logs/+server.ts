/**
 * POST /api/cron/purge-old-logs
 *
 * Cloudflare cron-trigger endpoint (or HTTP POST with CRON_SECRET) that:
 *  1. Deletes app_logs rows older than 30 days.
 *
 * Auth: CRON_SECRET header (x-cron-secret) or open when no secret is configured (dev).
 */

import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

type D1Database = import('../../../../cloudflare').D1Database;

export async function POST(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		// Auth: accept CRON_SECRET header, or allow if no secret is configured (dev).
		const cronSecret = event.platform.env.CRON_SECRET;
		const headerSecret = event.request.headers.get('x-cron-secret');
		const isAuthorized = !cronSecret || headerSecret === cronSecret;

		if (!isAuthorized) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const db: D1Database = event.platform.env.DB;

		// Retain 30 days of logs.
		const cutoffSecs = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

		const result = await db
			.prepare('DELETE FROM app_logs WHERE timestamp < ?')
			.bind(cutoffSecs)
			.run();

		return json({
			ok: true,
			deleted: result.meta?.changes ?? 0,
			cutoff_timestamp: cutoffSecs
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('purge-old-logs fatal error:', message);
		return json({ error: message }, { status: 500 });
	}
}
