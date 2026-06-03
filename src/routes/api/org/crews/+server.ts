import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const crewDb = new DbCrewHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const crews = await crewDb.listCrews(org.id);

		// Fetch member counts and member details for each crew
		const crewsWithMembers = await Promise.all(
			crews.map(async (crew) => {
				const members = await crewDb.getCrewMembers(crew.id);
				return {
					id: crew.id,
					name: crew.name,
					color: crew.color,
					member_count: members.length,
					members
				};
			})
		);

		return json({ crews: crewsWithMembers });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get crews error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const crewDb = new DbCrewHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		// Check if user is admin or owner
		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const body = (await event.request.json()) as { name?: string; color?: string };
		const { name, color = 'slate' } = body;

		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return json({ error: 'Crew name is required' }, { status: 400 });
		}

		const validColors = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];
		if (!validColors.includes(color)) {
			return json({ error: 'Invalid color' }, { status: 400 });
		}

		const crew = await crewDb.createCrew(org.id, name.trim(), color, user.id);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'crew',
			resourceId: crew.id,
			action: 'create',
			newValue: crew,
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ crew }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
