import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbCrewHelper } from '$lib/server/db-crews';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

export async function PATCH(event: RequestEvent) {
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

		const body = (await event.request.json()) as { name?: string; color?: string };

		if (!body.name && !body.color) {
			return json({ error: 'At least one field (name or color) is required' }, { status: 400 });
		}

		const updates: { name?: string; color?: string } = {};

		if (body.name !== undefined) {
			if (typeof body.name !== 'string' || body.name.trim().length === 0) {
				return json({ error: 'Name must be a non-empty string' }, { status: 400 });
			}
			updates.name = body.name.trim();
		}

		if (body.color !== undefined) {
			const validColors = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];
			if (!validColors.includes(body.color)) {
				return json({ error: 'Invalid color' }, { status: 400 });
			}
			updates.color = body.color;
		}

		await crewDb.updateCrew(crewId, org.id, updates);

		// Record audit log
		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'crew',
			resourceId: crewId,
			action: 'updated',
			newValue: updates,
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Update crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

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
			.prepare('SELECT id, name, color FROM crews WHERE id = ?')
			.bind(crewId)
			.first<{ id: string; name: string; color: string }>();

		await crewDb.deleteCrew(crewId);

		// Record audit log
		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'crew',
			resourceId: crewId,
			action: 'deleted',
			oldValue: crew || undefined,
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete crew error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
