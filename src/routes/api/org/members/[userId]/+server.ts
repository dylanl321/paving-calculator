import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const { userId } = event.params;
		const body = await event.request.json();
		const { role } = body;

		if (!role || !['owner', 'admin', 'member', 'foreman', 'operator', 'inspector', 'office', 'laborer'].includes(role)) {
			return json({ error: 'Valid role is required' }, { status: 400 });
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

		// Prevent owner from changing their own role
		if (userId === user.id && userRole === 'owner') {
			return json({ error: 'Owner cannot change their own role' }, { status: 403 });
		}

		const oldRole = await db.getUserRole(userId, org.id);

		// Update member role
		await db.updateOrgMemberRole(userId, org.id, role);

		const targetUser = await db.getUserById(userId);
		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name || user.email,
			orgId: org.id,
			resourceType: 'member',
			resourceId: userId,
			action: 'role_changed',
			oldValue: { role: oldRole },
			newValue: { role },
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent')
		});

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error updating member role:', error);
		return json({ error: 'Failed to update member role' }, { status: 500 });
	}
}

export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const { userId } = event.params;

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

		// Prevent owner from removing themselves
		if (userId === user.id && userRole === 'owner') {
			return json({ error: 'Owner cannot remove themselves from the organization' }, { status: 403 });
		}

		// Don't allow removing self (for non-owners)
		if (userId === user.id) {
			return json({ error: 'Cannot remove yourself from the organization' }, { status: 400 });
		}

		const targetUser = await db.getUserById(userId);

		// Remove member
		await db.removeOrgMember(userId, org.id);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name || user.email,
			orgId: org.id,
			resourceType: 'member',
			resourceId: userId,
			action: 'removed',
			oldValue: { name: targetUser?.name, email: targetUser?.email },
			ipAddress: event.request.headers.get('cf-connecting-ip') || event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent')
		});

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error removing member:', error);
		return json({ error: 'Failed to remove member' }, { status: 500 });
	}
}
