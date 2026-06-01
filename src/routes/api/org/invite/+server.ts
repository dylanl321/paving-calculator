import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth, hashPassword } from '$lib/server/auth';

interface InviteRequest {
	email: string;
	name: string;
	role: 'admin' | 'member';
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const userRole = await db.getUserRole(user.id, org.id);
		if (userRole !== 'owner' && userRole !== 'admin') {
			return json({ error: 'Insufficient permissions' }, { status: 403 });
		}

		const body: InviteRequest = await event.request.json();

		if (!body.email || !body.name || !body.role) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		if (!['admin', 'member'].includes(body.role)) {
			return json({ error: 'Invalid role' }, { status: 400 });
		}

		let invitedUser = await db.getUserByEmail(body.email);

		if (!invitedUser) {
			const tempPassword = crypto.randomUUID();
			const passwordHash = await hashPassword(tempPassword);
			invitedUser = await db.createUser(body.email, passwordHash, body.name);
		}

		const existingMember = await db.getUserRole(invitedUser.id, org.id);
		if (existingMember) {
			return json({ error: 'User already in organization' }, { status: 409 });
		}

		await db.addOrgMember(invitedUser.id, org.id, body.role);

		return json({
			user: {
				id: invitedUser.id,
				email: invitedUser.email,
				name: invitedUser.name,
				role: body.role
			}
		});
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Invite user error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
