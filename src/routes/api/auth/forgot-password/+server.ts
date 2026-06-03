import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { sendPasswordResetEmail, buildOrgBranding } from '$lib/server/email';
import { checkRateLimit } from '$lib/server/rate-limit';

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

		if (!body.email) {
			return json({ error: 'Email is required' }, { status: 400 });
		}

		const db = new DbHelper(event.platform.env.DB);
		const user = await db.getUserByEmail(body.email);

		// Always return success to prevent email enumeration
		if (user) {
			// Create reset token (1h expiry)
			const resetToken = await db.createEmailToken(user.id, 'reset_password', 60 * 60);
			const baseUrl = new URL(event.request.url).origin;

			const org = await db.getOrgByUserId(user.id);
			const settings = org ? await db.getOrgSettings(org.id) : null;
			const branding = buildOrgBranding(org, settings);

			await sendPasswordResetEmail(
				event.platform?.env.RESEND_API_KEY,
				user.email,
				user.name,
				resetToken,
				baseUrl,
				branding,
				{ logger: db, orgId: org?.id ?? null, userId: user.id }
			);
		}

		return json({ success: true });
	} catch (error) {
		console.error('Forgot password error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
