import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbMixPresetsHelper } from '$lib/server/db-mix-presets';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

// Validation constants
const NAME_MAX = 100;
const THICKNESS_MIN = 0.5;
const THICKNESS_MAX = 10;
const SPREAD_RATE_MIN = 50;
const SPREAD_RATE_MAX = 250;
const TACK_RATE_MIN = 0.01;
const TACK_RATE_MAX = 0.20;

function validatePresetInput(body: Record<string, unknown>): string | null {
	const { name, target_thickness_in, target_spread_rate, target_tack_rate } = body;

	if (name !== undefined) {
		if (typeof name !== 'string' || name.trim().length === 0) {
			return 'name is required';
		}
		if (name.trim().length > NAME_MAX) {
			return `name must be ${NAME_MAX} characters or fewer`;
		}
	}

	if (target_thickness_in !== null && target_thickness_in !== undefined) {
		const v = Number(target_thickness_in);
		if (isNaN(v) || v < THICKNESS_MIN || v > THICKNESS_MAX) {
			return `target_thickness_in must be between ${THICKNESS_MIN} and ${THICKNESS_MAX}`;
		}
	}

	if (target_spread_rate !== null && target_spread_rate !== undefined) {
		const v = Number(target_spread_rate);
		if (isNaN(v) || v < SPREAD_RATE_MIN || v > SPREAD_RATE_MAX) {
			return `target_spread_rate must be between ${SPREAD_RATE_MIN} and ${SPREAD_RATE_MAX} lbs/SY`;
		}
	}

	if (target_tack_rate !== null && target_tack_rate !== undefined) {
		const v = Number(target_tack_rate);
		if (isNaN(v) || v < TACK_RATE_MIN || v > TACK_RATE_MAX) {
			return `target_tack_rate must be between ${TACK_RATE_MIN} and ${TACK_RATE_MAX} gal/SY`;
		}
	}

	return null;
}

// GET /api/org/mix-presets — list all presets for user's org
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const presetsDb = new DbMixPresetsHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const presets = await presetsDb.getOrgMixPresets(org.id);
		return json({ presets });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get mix presets error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// POST /api/org/mix-presets — create new preset
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

		const body = (await event.request.json()) as Record<string, unknown>;

		// name is required on create
		if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
			return json({ error: 'name is required' }, { status: 400 });
		}

		const validationError = validatePresetInput(body);
		if (validationError) {
			return json({ error: validationError }, { status: 400 });
		}

		// Check uniqueness within org
		const existing = await presetsDb.getMixPresetByName(org.id, String(body.name).trim());
		if (existing) {
			return json({ error: 'A preset with that name already exists in this organization' }, { status: 409 });
		}

		const preset = await presetsDb.createOrgMixPreset(org.id, {
			name: String(body.name).trim(),
			mix_type: body.mix_type != null ? String(body.mix_type) : null,
			target_thickness_in: body.target_thickness_in != null ? Number(body.target_thickness_in) : null,
			target_spread_rate: body.target_spread_rate != null ? Number(body.target_spread_rate) : null,
			tack_type: body.tack_type != null ? String(body.tack_type) : null,
			target_tack_rate: body.target_tack_rate != null ? Number(body.target_tack_rate) : null,
			plant_supplier: body.plant_supplier != null ? String(body.plant_supplier) : null,
			notes: body.notes != null ? String(body.notes) : null,
			is_default: Boolean(body.is_default),
			sort_order: body.sort_order != null ? Number(body.sort_order) : 0
		});

		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'mix_preset',
			resourceId: preset.id,
			action: 'created',
			newValue: { name: preset.name },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ preset }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create mix preset error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
