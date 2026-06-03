import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

export async function DELETE(event: RequestEvent) {
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

		const { crewId } = event.params;
		if (!crewId) return json({ error: 'Crew ID is required' }, { status: 400 });

		// Fetch crew info before deletion for audit
		const crew = await event.platform!.env.DB
			.prepare('SELECT * FROM crews WHERE id = ?')
			.bind(crewId)
			.first();

		await crewDb.deleteCrew(crewId);

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'crew',
			resourceId: crewId,
			action: 'delete',
			oldValue: crew || undefined,
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
