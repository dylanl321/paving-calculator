import type { D1Database } from '@cloudflare/workers-types';

interface RateLimitResult {
	allowed: boolean;
	retryAfter?: number;
}

/**
 * Check if a request from the given IP to the given endpoint is allowed.
 * Implements a sliding window rate limiter with automatic cleanup of expired records.
 */
export async function checkRateLimit(
	db: D1Database,
	ip: string,
	endpoint: string,
	maxAttempts: number,
	windowSeconds: number
): Promise<RateLimitResult> {
	const now = Math.floor(Date.now() / 1000);

	// Clean up expired rate limit records for this endpoint
	await db
		.prepare('DELETE FROM rate_limits WHERE endpoint = ? AND window_start < ?')
		.bind(endpoint, now - windowSeconds)
		.run();

	// Get existing rate limit record
	const existing = await db
		.prepare('SELECT count, window_start FROM rate_limits WHERE ip = ? AND endpoint = ?')
		.bind(ip, endpoint)
		.first<{ count: number; window_start: number }>();

	// No record or window expired - create/reset
	if (!existing || now > existing.window_start + windowSeconds) {
		await db
			.prepare(
				'INSERT OR REPLACE INTO rate_limits (ip, endpoint, count, window_start) VALUES (?, ?, 1, ?)'
			)
			.bind(ip, endpoint, now)
			.run();
		return { allowed: true };
	}

	// Within window - check limit
	if (existing.count < maxAttempts) {
		await db
			.prepare('UPDATE rate_limits SET count = count + 1 WHERE ip = ? AND endpoint = ?')
			.bind(ip, endpoint)
			.run();
		return { allowed: true };
	}

	// Rate limit exceeded
	const retryAfter = existing.window_start + windowSeconds - now;
	return { allowed: false, retryAfter };
}
