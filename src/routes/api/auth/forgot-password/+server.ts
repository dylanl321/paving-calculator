import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { sendPasswordResetEmail, buildOrgBranding } from '$lib/server/email';
import { checkRateLimit } from '$lib/server/rate-limit';
import { logAuditEvent } from '$lib/server/db-audit';

interface ForgotPasswordRequest {
	email: string;
}

export async function POST(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		// Rate limiting: 3 attempts per hour
		const ip =
			event.request.headers.get('CF-Connecting-IP') ||
			event.request.headers.get('X-Forwarded-For') ||
			'0.0.0.0';
		const rateLimit = await checkRateLimit(event.platform.env.DB, ip, 'forgot-password', 3, 3600);
		if (!rateLimit.allowed) {
			return json(
				{ error: 'Too many requests. Please try again later.' },
				{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
			);
		}

		const body: ForgotPasswordRequest = await event.request.json();
		const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

		if (!email) {
			return json({ error: 'Email is required' }, { status: 400 });
		}

		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(email)) {
			return json({ error: 'Invalid email format' }, { status: 400 });
		}

		const db = new DbHelper(event.platform.env.DB);
		const user = await db.getUserByEmail(email);

		const ipAddress = event.request.headers.get('CF-Connecting-IP') ?? event.request.headers.get('X-Forwarded-For') ?? 'unknown';
		const userAgent = event.request.headers.get('User-Agent') ?? '';

		// Unknown addresses return success to prevent email enumeration.
		if (user) {
			// Create reset token (1h expiry)
			const resetToken = await db.createEmailToken(user.id, 'reset_password', 60 * 60);
			const baseUrl = new URL(event.request.url).origin;

			const org = await db.getOrgByUserId(user.id);
			const settings = org ? await db.getOrgSettings(org.id) : null;
			const branding = buildOrgBranding(org, settings);

			const result = await sendPasswordResetEmail(
				event.platform?.env.RESEND_API_KEY,
				user.email,
				user.name,
				resetToken,
				baseUrl,
				branding,
				{ logger: db, orgId: org?.id ?? null, userId: user.id }
			);

			if (!result.ok) {
				return json(
					{ error: 'Could not send password reset email. Please try again later.' },
					{ status: 502 }
				);
			}

			// Log password reset request
			await logAuditEvent(event.platform.env.DB, {
				user_id: user.id,
				org_id: org?.id,
				event_type: 'password_reset_request',
				ip_address: ipAddress,
				user_agent: userAgent,
				metadata: { email: user.email }
			});
		}

		return json({ success: true });
	} catch (error) {
		console.error('Forgot password error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
