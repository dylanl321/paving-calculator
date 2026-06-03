import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { hashPassword, slugify, createSession, setSessionCookie } from '$lib/server/auth';
import { sendVerificationEmail, buildOrgBranding } from '$lib/server/email';

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

		// Send verification email (24h expiry)
		const verifyToken = await db.createEmailToken(user.id, 'verify_email', 24 * 60 * 60);
		const baseUrl = new URL(event.request.url).origin;
		const settings = await db.getOrgSettings(org.id);
		const branding = buildOrgBranding(org, settings);
		await sendVerificationEmail(
			event.platform?.env.RESEND_API_KEY,
			user.email,
			user.name,
			verifyToken,
			baseUrl,
			branding,
			{ logger: db, orgId: org.id, userId: user.id }
		);

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				email_verified: false
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
