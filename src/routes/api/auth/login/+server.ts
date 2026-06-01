import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { verifyPassword, createSession, setSessionCookie } from '$lib/server/auth';

interface LoginRequest {
	email: string;
	password: string;
}

export async function POST(event: RequestEvent) {
	try {
		const body: LoginRequest = await event.request.json();

		if (!body.email || !body.password) {
			return json({ error: 'Missing email or password' }, { status: 400 });
		}

		const db = new DbHelper(event.platform!.env.DB);

		const user = await db.getUserByEmail(body.email);
		if (!user) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		const isValid = await verifyPassword(body.password, user.password_hash);
		if (!isValid) {
			return json({ error: 'Invalid credentials' }, { status: 401 });
		}

		const sessionToken = await createSession(db, user.id);
		setSessionCookie(event.cookies, sessionToken);

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name
			}
		});
	} catch (error) {
		console.error('Login error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
