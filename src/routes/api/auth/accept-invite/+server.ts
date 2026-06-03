import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { hashPassword, createSession, setSessionCookie } from '$lib/server/auth';
import { sendWelcomeEmail, type OrgBranding } from '$lib/server/email';

interface AcceptInviteBody {
	token?: string;
	name?: string;
	password?: string;
	existingUser?: boolean;
}

export async function POST(event: RequestEvent) {
	try {
		const { token, name, password, existingUser } =
			(await event.request.json()) as AcceptInviteBody;

		if (!token) {
			return json({ error: 'Missing token' }, { status: 400 });
		}

		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}

		const db = new DbHelper(event.platform.env.DB);

		const invitation = await db.getInvitationByToken(token);

		if (!invitation) {
			return json({ error: 'Invalid invitation token' }, { status: 400 });
		}

		if (invitation.accepted_at !== null) {
			return json({ error: 'This invitation has already been accepted' }, { status: 400 });
		}

		const now = Math.floor(Date.now() / 1000);
		if (invitation.expires_at < now) {
			return json({ error: 'This invitation has expired' }, { status: 400 });
		}

		const org = await db.getOrganizationById(invitation.org_id);

		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		if (existingUser) {
			const user = await db.getUserByEmail(invitation.email);

			if (!user) {
				return json({ error: 'User not found' }, { status: 400 });
			}

			const existingRole = await db.getUserRole(user.id, invitation.org_id);
			if (existingRole) {
				return json({ error: 'You are already a member of this organization' }, { status: 409 });
			}

			await db.addOrgMember(user.id, invitation.org_id, invitation.role);
			await db.acceptInvitation(token);

			const sessionToken = await createSession(db, user.id);
			setSessionCookie(event.cookies, sessionToken);

			sendWelcomeEmail(
				event.platform.env.RESEND_API_KEY,
				user.email,
				user.name,
				org.name,
				event.url.origin
			).catch((error) => {
				console.error('Failed to send welcome email:', error);
			});

			return json({ success: true });
		} else {
			if (!name || !password) {
				return json({ error: 'Name and password are required' }, { status: 400 });
			}

			if (password.length < 8) {
				return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
			}

			const existingUser = await db.getUserByEmail(invitation.email);
			if (existingUser) {
				return json({ error: 'An account with this email already exists' }, { status: 409 });
			}

			const passwordHash = await hashPassword(password);
			const user = await db.createUser(invitation.email, passwordHash, name);

			await db.addOrgMember(user.id, invitation.org_id, invitation.role);
			await db.acceptInvitation(token);

			const sessionToken = await createSession(db, user.id);
			setSessionCookie(event.cookies, sessionToken);

			sendWelcomeEmail(
				event.platform.env.RESEND_API_KEY,
				user.email,
				user.name,
				org.name,
				event.url.origin
			).catch((error) => {
				console.error('Failed to send welcome email:', error);
			});

			return json({ success: true });
		}
	} catch (error) {
		console.error('Accept invitation error:', error);
		return json({ error: 'An error occurred while accepting the invitation' }, { status: 500 });
	}
}
