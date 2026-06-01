import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const { id } = event.params;
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
		const body = await event.request.json();
		const { name, slug } = body;

		const updates: { name?: string; slug?: string } = {};
		if (name && typeof name === 'string') updates.name = name.trim();
		if (slug && typeof slug === 'string') updates.slug = slug.trim();

		if (Object.keys(updates).length === 0) {
			return json({ error: 'No valid updates provided' }, { status: 400 });
		}

		const db = new DbHelper(event.platform!.env.DB);
		await db.updateOrganization(id, updates);

		const org = await db.getOrganizationById(id);
		return json({ org });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error updating org:', error);
		return json({ error: 'Failed to update organization' }, { status: 500 });
	}
}
