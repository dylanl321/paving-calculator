import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const body = await event.request.json();
		const { email, role } = body;

		if (!email || !role) {
			return json({ error: 'Email and role are required' }, { status: 400 });
		}

		if (!['owner', 'admin', 'member'].includes(role)) {
			return json({ error: 'Invalid role' }, { status: 400 });
		}

		const db = new DbHelper(event.platform!.env.DB);

		// Get user's org
		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'User not associated with an organization' }, { status: 400 });
		}

		// Check user has admin/owner role
		const userRole = await db.getUserRole(user.id, org.id);
		if (userRole !== 'owner' && userRole !== 'admin') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}

		// Check if user already exists
		const existingUser = await db.getUserByEmail(email);
		if (existingUser) {
			// Check if already in org
			const existingRole = await db.getUserRole(existingUser.id, org.id);
			if (existingRole) {
				return json({ error: 'User is already a member of this organization' }, { status: 409 });
			}
		}

		// Create invitation
		const invitation = await db.createInvitation(org.id, email, role, user.id);

		// TODO: Send email with invitation link
		// For now, just return the token
		console.log(`Invitation token for ${email}: ${invitation.token}`);

		return json({
			invitation: {
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				created_at: invitation.created_at,
				expires_at: invitation.expires_at
			}
		}, { status: 201 });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error creating invitation:', error);
		return json({ error: 'Failed to create invitation' }, { status: 500 });
	}
}

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		// Get user's org
		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'User not associated with an organization' }, { status: 400 });
		}

		// Check user has admin/owner role
		const userRole = await db.getUserRole(user.id, org.id);
		if (userRole !== 'owner' && userRole !== 'admin') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}

		const invitations = await db.getInvitationsByOrgId(org.id);

		return json({ invitations });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error fetching invitations:', error);
		return json({ error: 'Failed to fetch invitations' }, { status: 500 });
	}
}
