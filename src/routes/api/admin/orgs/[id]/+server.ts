import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

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

		const members = await db.getOrgMembersByOrgId(id);
		return json({ org, members });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error fetching org:', error);
		return json({ error: 'Failed to fetch organization' }, { status: 500 });
	}
}

export async function PATCH(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const { id } = event.params;
		if (!id) return json({ error: 'Organization ID is required' }, { status: 400 });
		const body = (await event.request.json()) as UpdateOrgBody;
		const { name, slug, action, userId, role } = body;

		const db = new DbHelper(event.platform!.env.DB);

		// Handle member management actions
		if (action) {
			if (action === 'updateRole') {
				if (!userId || !role) {
					return json({ error: 'userId and role are required for updateRole' }, { status: 400 });
				}
				await db.updateOrgMemberRole(userId, id, role);
				return json({ success: true });
			} else if (action === 'removeMember') {
				if (!userId) {
					return json({ error: 'userId is required for removeMember' }, { status: 400 });
				}
				await db.removeOrgMember(userId, id);
				return json({ success: true });
			} else {
				return json({ error: 'Invalid action' }, { status: 400 });
			}
		}

		// Handle org property updates
		const updates: { name?: string; slug?: string } = {};
		if (name && typeof name === 'string') updates.name = name.trim();
		if (slug && typeof slug === 'string') updates.slug = slug.trim();

		if (Object.keys(updates).length === 0) {
			return json({ error: 'No valid updates provided' }, { status: 400 });
		}

		await db.updateOrganization(id, updates);

		const org = await db.getOrganizationById(id);
		return json({ org });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error updating org:', error);
		return json({ error: 'Failed to update organization' }, { status: 500 });
	}
}
