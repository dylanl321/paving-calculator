import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbMixPresetsHelper } from '$lib/server/db-mix-presets';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

const GDOT_DEFAULTS = [
	{
		name: '9.5mm SP Surface',
		mix_type: 'surface',
		target_thickness_in: 1.5,
		target_spread_rate: 110,
		sort_order: 10,
		notes: 'GDOT Sec 828: Gmm 2.500, target density 96%, VTM 3-5%'
	},
	{
		name: '12.5mm SP Surface',
		mix_type: 'surface',
		target_thickness_in: 2.0,
		target_spread_rate: 135,
		sort_order: 20,
		notes: 'GDOT Sec 828: Gmm 2.480, target density 96%, VTM 3-5%'
	},
	{
		name: '19mm SP Binder',
		mix_type: 'binder',
		target_thickness_in: 2.5,
		target_spread_rate: 165,
		sort_order: 30,
		notes: 'GDOT Sec 828: Gmm 2.490, target density 96%, VTM 3-5%'
	},
	{
		name: '25mm SP Base',
		mix_type: 'base',
		target_thickness_in: 3.5,
		target_spread_rate: 220,
		sort_order: 40,
		notes: 'GDOT Sec 828: Gmm 2.480, target density 96%, VTM 3-5%'
	}
];

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const presetsDb = new DbMixPresetsHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		// Role guard: owner/admin only
		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden: Admin or owner access required' }, { status: 403 });
		}

		const body = (await event.request.json().catch(() => ({}))) as Record<string, unknown>;
		const force = body.force === true;

		// Check if org already has presets
		const existingPresets = await presetsDb.getOrgMixPresets(org.id);

		if (existingPresets.length > 0 && !force) {
			return json(
				{
					error: 'org_has_presets',
					count: existingPresets.length
				},
				{ status: 409 }
			);
		}

		// Seed the GDOT defaults
		let seededCount = 0;
		for (const preset of GDOT_DEFAULTS) {
			// Skip if preset with this name already exists (when force=true)
			if (force) {
				const existing = await presetsDb.getMixPresetByName(org.id, preset.name);
				if (existing) continue;
			}

			await presetsDb.createOrgMixPreset(org.id, {
				name: preset.name,
				mix_type: preset.mix_type,
				target_thickness_in: preset.target_thickness_in,
				target_spread_rate: preset.target_spread_rate,
				notes: preset.notes,
				is_default: false,
				sort_order: preset.sort_order
			});

			seededCount++;
		}

		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'mix_preset',
			resourceId: org.id,
			action: 'gdot_defaults_seeded',
			newValue: { count: seededCount },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ seeded: seededCount });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Seed GDOT defaults error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
