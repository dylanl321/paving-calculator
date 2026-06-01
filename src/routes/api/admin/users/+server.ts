import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin, hashPassword } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const db = new DbHelper(event.platform!.env.DB);
		const users = await db.getAllUsers();

		// Remove password_hash from response
		const sanitized = users.map(({ password_hash, ...user }) => user);
		return json({ users: sanitized });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error fetching users:', error);
		return json({ error: 'Failed to fetch users' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const body = await event.request.json();
		const { email, password, name, org_id, role, phone, is_global_admin } = body;

		if (!email || !password || !name) {
			return json({ error: 'Email, password, and name are required' }, { status: 400 });
		}

		if (org_id && !role) {
			return json({ error: 'Role is required when assigning to an organization' }, { status: 400 });
		}

		const db = new DbHelper(event.platform!.env.DB);

		// Check if user already exists
		const existing = await db.getUserByEmail(email);
		if (existing) {
			return json({ error: 'User with this email already exists' }, { status: 409 });
		}

		// Create user
		const passwordHash = await hashPassword(password);
		const user = await db.createUser(email, passwordHash, name);

		// Update additional fields if provided
		if (phone || is_global_admin) {
			await db.updateUser(user.id, {
				phone: phone || null,
				is_global_admin: !!is_global_admin
			});
		}

		// Add to org if specified
		if (org_id && role) {
			await db.addOrgMember(user.id, org_id, role);
		}

		const { password_hash, ...sanitized } = user;
		return json({ user: sanitized }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error creating user:', error);
		return json({ error: 'Failed to create user' }, { status: 500 });
	}
}
