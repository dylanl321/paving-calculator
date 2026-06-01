import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth, hashPassword } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const body = await event.request.json();
		const { email, password, name, role, phone } = body;

		if (!email || !password || !name || !role) {
			return json({ error: 'Email, password, name, and role are required' }, { status: 400 });
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
		const existing = await db.getUserByEmail(email);
		if (existing) {
			return json({ error: 'User with this email already exists' }, { status: 409 });
		}

		// Create user
		const passwordHash = await hashPassword(password);
		const newUser = await db.createUser(email, passwordHash, name);

		// Update phone if provided
		if (phone) {
			await db.updateUser(newUser.id, { phone });
		}

		// Add to org
		await db.addOrgMember(newUser.id, org.id, role);

		const { password_hash, ...sanitized } = newUser;
		return json({ user: sanitized }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error creating user:', error);
		return json({ error: 'Failed to create user' }, { status: 500 });
	}
}
