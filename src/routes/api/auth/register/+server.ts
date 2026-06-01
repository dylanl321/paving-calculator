import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { hashPassword, slugify, createSession, setSessionCookie } from '$lib/server/auth';

interface RegisterRequest {
	email: string;
	password: string;
	name: string;
	orgName: string;
}

export async function POST(event: RequestEvent) {
	try {
		const body: RegisterRequest = await event.request.json();

		if (!body.email || !body.password || !body.name || !body.orgName) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		if (body.password.length < 8) {
			return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
		}

		const db = new DbHelper(event.platform!.env.DB);

		const existingUser = await db.getUserByEmail(body.email);
		if (existingUser) {
			return json({ error: 'Email already registered' }, { status: 409 });
		}

		const passwordHash = await hashPassword(body.password);
		const user = await db.createUser(body.email, passwordHash, body.name);

		const orgSlug = slugify(body.orgName);
		const org = await db.createOrganization(body.orgName, orgSlug);

		await db.addOrgMember(user.id, org.id, 'owner');

		const sessionToken = await createSession(db, user.id);
		setSessionCookie(event.cookies, sessionToken);

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name
			},
			org: {
				id: org.id,
				name: org.name,
				slug: org.slug
			}
		});
	} catch (error) {
		console.error('Registration error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
