import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { hashPassword } from '$lib/server/auth';
import { logAuditEvent } from '$lib/server/db-audit';

interface ResetPasswordRequest {
	token: string;
	password: string;
}

export async function POST(event: RequestEvent) {
	try {
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		const body: ResetPasswordRequest = await event.request.json();
		const token = typeof body.token === 'string' ? body.token.trim() : '';
		const password = typeof body.password === 'string' ? body.password : '';

		if (!token || !password) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		if (password.length < 8) {
			return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
		}

		const db = new DbHelper(event.platform.env.DB);
		const tokenData = await db.getEmailToken(token, 'reset_password');

		if (!tokenData) {
			return json({ error: 'Invalid reset token' }, { status: 400 });
		}

		const now = Math.floor(Date.now() / 1000);

		if (tokenData.expires_at < now) {
			return json({ error: 'Reset token has expired' }, { status: 400 });
		}

		if (tokenData.used_at) {
			return json({ error: 'Reset token has already been used' }, { status: 400 });
		}

		// Update password
		const passwordHash = await hashPassword(password);
		await db.updatePassword(tokenData.user_id, passwordHash);

		// Mark token as used
		await db.markEmailTokenUsed(token);

		// Delete all user sessions to force re-login
		await db.deleteSessionsByUserId(tokenData.user_id);

		// Log to admin audit log
		const ipAddress = event.request.headers.get('CF-Connecting-IP') || event.request.headers.get('X-Forwarded-For') || undefined;
		const userAgent = event.request.headers.get('user-agent') || undefined;
		const user = await db.getUserById(tokenData.user_id);
		const org = user ? await db.getOrgByUserId(user.id) : null;
		await logAuditEvent(event.platform.env.DB, {
			user_id: tokenData.user_id,
			org_id: org?.id,
			event_type: 'password_reset_complete',
			ip_address: ipAddress,
			user_agent: userAgent
		});

		return json({ success: true });
	} catch (error) {
		console.error('Reset password error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
