import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

export async function PATCH(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const { id } = event.params;
		if (!id) return json({ error: 'User ID is required' }, { status: 400 });
		const body = (await event.request.json()) as {
			name?: string;
			email?: string;
			phone?: string | null;
			is_global_admin?: boolean;
			disabled?: boolean;
		};
		const { name, email, phone, is_global_admin, disabled } = body;

		const updates: {
			name?: string;
			email?: string;
			phone?: string | null;
			is_global_admin?: boolean;
			disabled?: boolean;
		} = {};

		if (name !== undefined && typeof name === 'string') updates.name = name.trim();
		if (email !== undefined && typeof email === 'string') updates.email = email.trim();
		if (phone !== undefined) updates.phone = phone ? phone.trim() : null;
		if (is_global_admin !== undefined) updates.is_global_admin = !!is_global_admin;
		if (disabled !== undefined) updates.disabled = !!disabled;

		if (Object.keys(updates).length === 0) {
			return json({ error: 'No valid updates provided' }, { status: 400 });
		}

		const db = new DbHelper(event.platform!.env.DB);
		await db.updateUser(id, updates);

		// If user was disabled, purge all their sessions
		if (updates.disabled === true) {
			await db.deleteSessionsByUserId(id);
		}

		const user = await db.getUserById(id);
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const { password_hash, ...sanitized } = user;
		return json({ user: sanitized });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error updating user:', error);
		return json({ error: 'Failed to update user' }, { status: 500 });
	}
}
