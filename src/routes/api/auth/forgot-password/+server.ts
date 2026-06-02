import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { sendPasswordResetEmail } from '$lib/server/email';

interface ForgotPasswordRequest {
	email: string;
}

export async function POST(event: RequestEvent) {
	try {
		const body: ForgotPasswordRequest = await event.request.json();

		if (!body.email) {
			return json({ error: 'Email is required' }, { status: 400 });
		}

		const db = new DbHelper(event.platform!.env.DB);
		const user = await db.getUserByEmail(body.email);

		// Always return success to prevent email enumeration
		if (user) {
			// Create reset token (1h expiry)
			const resetToken = await db.createEmailToken(user.id, 'reset_password', 60 * 60);
			const baseUrl = new URL(event.request.url).origin;

			await sendPasswordResetEmail(
				event.platform?.env.RESEND_API_KEY,
				user.email,
				user.name,
				resetToken,
				baseUrl
			);
		}

		return json({ success: true });
	} catch (error) {
		console.error('Forgot password error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
