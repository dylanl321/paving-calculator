import { redirect, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';

export async function GET(event: RequestEvent) {
	const token = event.url.searchParams.get('token');

	if (!token) {
		throw redirect(303, '/dashboard?verify_error=missing_token');
	}

	const db = new DbHelper(event.platform!.env.DB);
	const tokenData = await db.getEmailToken(token, 'verify_email');

	if (!tokenData) {
		throw redirect(303, '/dashboard?verify_error=invalid_token');
	}

	const now = Math.floor(Date.now() / 1000);

	if (tokenData.expires_at < now) {
		throw redirect(303, '/dashboard?verify_error=expired');
	}

	if (tokenData.used_at) {
		throw redirect(303, '/dashboard?verify_error=already_used');
	}

	// Mark token as used and verify the user's email
	await db.markEmailTokenUsed(token);
	await db.setEmailVerified(tokenData.user_id);

	throw redirect(303, '/dashboard?verified=true');
}
