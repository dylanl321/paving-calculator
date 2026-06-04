import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';
import { sendInvitationEmailTemplated } from '$lib/server/email-template-senders';

export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const inviteId = event.params.id;

		if (!inviteId) {
			return json({ error: 'Invitation ID is required' }, { status: 400 });
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

		// Get invitation to verify it belongs to this org
		const invitation = await db.getInvitationById(inviteId);
		if (!invitation) {
			return json({ error: 'Invitation not found' }, { status: 404 });
		}

		if (invitation.org_id !== org.id) {
			return json({ error: 'Invitation not found' }, { status: 404 });
		}

		// Delete the invitation
		await db.deleteInvitation(inviteId);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'org_member',
			resourceId: inviteId,
			action: 'revoked',
			oldValue: { email: invitation.email, role: invitation.role },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error revoking invitation:', error);
		return json({ error: 'Failed to revoke invitation' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const inviteId = event.params.id;

		if (!inviteId) {
			return json({ error: 'Invitation ID is required' }, { status: 400 });
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

		// Get the existing invitation to verify it exists and is pending
		const oldInvitation = await db.getInvitationById(inviteId);
		if (!oldInvitation) {
			return json({ error: 'Invitation not found' }, { status: 404 });
		}

		if (oldInvitation.org_id !== org.id) {
			return json({ error: 'Invitation not found' }, { status: 404 });
		}

		if (oldInvitation.accepted_at !== null) {
			return json({ error: 'Invitation has already been accepted' }, { status: 409 });
		}

		// Delete the old invitation
		await db.deleteInvitation(inviteId);

		// Create a new invitation with the same email and role
		const newInvitation = await db.createInvitation(
			org.id,
			oldInvitation.email,
			oldInvitation.role,
			user.id
		);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'org_member',
			resourceId: newInvitation.id,
			action: 'reinvited',
			newValue: { email: newInvitation.email, role: newInvitation.role },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		// Send re-invitation email via template system
		const baseUrl = new URL(event.request.url).origin;
		sendInvitationEmailTemplated(
			event.platform!.env.DB,
			event.platform!.env.RESEND_API_KEY,
			newInvitation.email,
			user.name,
			org.id,
			newInvitation.token,
			baseUrl,
			{ logger: db, orgId: org.id, userId: user.id }
		).catch((err) => {
			console.error('Failed to send re-invitation email:', err);
		});

		return json({
			invitation: {
				id: newInvitation.id,
				email: newInvitation.email,
				role: newInvitation.role,
				created_at: newInvitation.created_at,
				expires_at: newInvitation.expires_at
			}
		}, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error resending invitation:', error);
		return json({ error: 'Failed to resend invitation' }, { status: 500 });
	}
}
