import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbMixPresetsHelper } from '$lib/server/db-mix-presets';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

// POST /api/org/mix-presets/[id]/duplicate — clone a preset with " (Copy)" suffix
export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const presetsDb = new DbMixPresetsHelper(event.platform!.env.DB);
		const presetId = event.params.id!;

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		// Role guard: owner/admin only
		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const preset = await presetsDb.duplicateOrgMixPreset(presetId, org.id);
		if (!preset) {
			return json({ error: 'Mix preset not found' }, { status: 404 });
		}

		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'mix_preset',
			resourceId: preset.id,
			action: 'created',
			newValue: { name: preset.name, cloned_from: presetId },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ preset }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Duplicate mix preset error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
