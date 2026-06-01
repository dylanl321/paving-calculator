import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { slugify } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const db = new DbHelper(event.platform!.env.DB);
		const orgs = await db.getAllOrganizations();
		return json({ orgs });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error fetching orgs:', error);
		return json({ error: 'Failed to fetch organizations' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent) {
	try {
		await requireGlobalAdmin(event);
		const body = await event.request.json();
		const { name } = body;

		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return json({ error: 'Organization name is required' }, { status: 400 });
		}

		const slug = slugify(name);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.createOrganization(name.trim(), slug);
		return json({ org }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Error creating org:', error);
		return json({ error: 'Failed to create organization' }, { status: 500 });
	}
}
