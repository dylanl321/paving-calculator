import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { clearSessionCookie } from '$lib/server/auth';

export async function POST(event: RequestEvent) {
	try {
		const token = event.cookies.get('paverate_session');

		if (token) {
			const db = new DbHelper(event.platform!.env.DB);
			await db.deleteSession(token);
		}

		clearSessionCookie(event.cookies);

		return json({ success: true });
	} catch (error) {
		console.error('Logout error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
