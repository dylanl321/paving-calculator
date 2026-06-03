import { json, type RequestEvent } from '@sveltejs/kit';
import { requireGlobalAdmin } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';
import { recordAudit } from '$lib/server/audit';

export async function POST(event: RequestEvent) {
	try {
		const admin = await requireGlobalAdmin(event);
		const { id } = event.params;
		if (!id) return json({ error: 'User ID is required' }, { status: 400 });

		const db = new DbHelper(event.platform!.env.DB);
		const user = await db.getUserById(id);
		if (!user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		await db.deleteSessionsByUserId(id);

		const org = await db.getOrgByUserId(id);
		await recordAudit(event.platform!.env.DB, {
			actorUserId: admin.id,
			actorName: admin.name,
			orgId: org?.id ?? 'global',
			resourceType: 'user',
			resourceId: id,
			action: 'sessions_revoked',
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ ok: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Error revoking sessions:', error);
		return json({ error: 'Failed to revoke sessions' }, { status: 500 });
	}
}
