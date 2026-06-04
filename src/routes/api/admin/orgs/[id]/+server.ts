import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';

type OrgRole =
	| 'owner'
	| 'admin'
	| 'member'
	| 'foreman'
	| 'operator'
	| 'inspector'
	| 'office'
	| 'laborer'
	| 'screed_man';

interface UpdateOrgBody {
	name?: string;
	slug?: string;
	action?: string;
	userId?: string;
	role?: OrgRole;
	archived?: boolean;
}

function getClientMeta(event: RequestEvent) {
	return {
		ipAddress:
			event.request.headers.get('cf-connecting-ip') ||
			event.request.headers.get('x-forwarded-for') ||
			undefined,
		userAgent: event.request.headers.get('user-agent') || undefined
	};
}

export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const { id } = event.params;
		if (!id) return json({ error: 'Organization ID is required' }, { status: 400 });
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrganizationById(id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const [members, invitations, jobSiteCount, jobSites] = await Promise.all([
			db.getOrgMembersByOrgId(id),
			db.getInvitationsByOrgId(id),
			db.getJobSiteCountByOrgId(id),
			db.getJobSitesByOrgId(id)
		]);
		return json({ org, members, invitations, jobSiteCount, jobSites });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error fetching org:', error);
		return json({ error: 'Failed to fetch organization' }, { status: 500 });
	}
}

export async function PATCH(event: RequestEvent) {
	try {
		const admin = await requireGlobalAdmin(event);
		const { id } = event.params;
		if (!id) return json({ error: 'Organization ID is required' }, { status: 400 });
		const body = (await event.request.json()) as UpdateOrgBody;
		const { name, slug, action, userId, role, archived } = body;

		const db = new DbHelper(event.platform!.env.DB);
		const meta = getClientMeta(event);

		// Handle member management actions
		if (action) {
			if (action === 'updateRole') {
				if (!userId || !role) {
					return json({ error: 'userId and role are required for updateRole' }, { status: 400 });
				}
				const prev = await db.getUserRole(userId, id);
				await db.updateOrgMemberRole(userId, id, role);
				await recordAudit(event.platform!.env.DB, {
					actorUserId: admin.id,
					actorName: admin.name,
					orgId: id,
					resourceType: 'org_member',
					resourceId: userId,
					action: 'role_changed',
					oldValue: { role: prev },
					newValue: { role },
					...meta
				});
				return json({ success: true });
			} else if (action === 'removeMember') {
				if (!userId) {
					return json({ error: 'userId is required for removeMember' }, { status: 400 });
				}
				const prev = await db.getUserRole(userId, id);
				await db.removeOrgMember(userId, id);
				await recordAudit(event.platform!.env.DB, {
					actorUserId: admin.id,
					actorName: admin.name,
					orgId: id,
					resourceType: 'org_member',
					resourceId: userId,
					action: 'removed',
					oldValue: { role: prev },
					...meta
				});
				return json({ success: true });
			} else if (action === 'archive' || action === 'unarchive') {
				const wantArchived = action === 'archive';
				await db.setOrganizationArchived(id, wantArchived);
				await recordAudit(event.platform!.env.DB, {
					actorUserId: admin.id,
					actorName: admin.name,
					orgId: id,
					resourceType: 'organization',
					resourceId: id,
					action: wantArchived ? 'archived' : 'unarchived',
					...meta
				});
				const org = await db.getOrganizationById(id);
				return json({ org });
			} else {
				return json({ error: 'Invalid action' }, { status: 400 });
			}
		}

		// Direct archive toggle via `archived` flag (alternative to action form)
		if (typeof archived === 'boolean') {
			await db.setOrganizationArchived(id, archived);
			await recordAudit(event.platform!.env.DB, {
				actorUserId: admin.id,
				actorName: admin.name,
				orgId: id,
				resourceType: 'organization',
				resourceId: id,
				action: archived ? 'archived' : 'unarchived',
				...meta
			});
			const org = await db.getOrganizationById(id);
			return json({ org });
		}

		// Handle org property updates
		const updates: { name?: string; slug?: string } = {};
		if (name && typeof name === 'string') updates.name = name.trim();
		if (slug && typeof slug === 'string') updates.slug = slug.trim();

		if (Object.keys(updates).length === 0) {
			return json({ error: 'No valid updates provided' }, { status: 400 });
		}

		const before = await db.getOrganizationById(id);
		await db.updateOrganization(id, updates);

		const org = await db.getOrganizationById(id);
		await recordAudit(event.platform!.env.DB, {
			actorUserId: admin.id,
			actorName: admin.name,
			orgId: id,
			resourceType: 'organization',
			resourceId: id,
			action: 'updated',
			oldValue: before ? { name: before.name, slug: before.slug } : undefined,
			newValue: updates,
			...meta
		});
		return json({ org });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error updating org:', error);
		return json({ error: 'Failed to update organization' }, { status: 500 });
	}
}
