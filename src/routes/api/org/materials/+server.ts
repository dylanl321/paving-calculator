import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbMaterialsHelper } from '$lib/server/db-materials';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { materials as builtinMaterials } from '$lib/config';

const VALID_CATEGORIES = ['aggregate', 'asphalt', 'soil', 'concrete', 'other'] as const;
type Category = (typeof VALID_CATEGORIES)[number];

const VALID_MATERIAL_TYPES = ['emulsion', 'cutback', 'trackless'] as const;
type MaterialType = (typeof VALID_MATERIAL_TYPES)[number];

const NAME_MAX = 100;
const DENSITY_MIN = 0.1;
const DENSITY_MAX = 5.0;
const RESIDUAL_RATE_MIN = 0.01;
const RESIDUAL_RATE_MAX = 0.25;

function isValidCategory(v: unknown): v is Category {
	return typeof v === 'string' && VALID_CATEGORIES.includes(v as Category);
}

function isValidMaterialType(v: unknown): v is MaterialType {
	return typeof v === 'string' && VALID_MATERIAL_TYPES.includes(v as MaterialType);
}

function validateMaterialInput(
	body: Record<string, unknown>,
	requireFields = false
): string | null {
	const { name, category, density_tons_per_yd3, material_type, residual_rate_gal_sy } = body;

	if (requireFields || name !== undefined) {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return 'name is required';
		}
		if (name.trim().length > NAME_MAX) {
			return `name must be ${NAME_MAX} characters or fewer`;
		}
	}

	if (requireFields || category !== undefined) {
		if (!isValidCategory(category)) {
			return `category must be one of: ${VALID_CATEGORIES.join(', ')}`;
		}
	}

	if (density_tons_per_yd3 !== null && density_tons_per_yd3 !== undefined) {
		const v = Number(density_tons_per_yd3);
		if (isNaN(v) || v < DENSITY_MIN || v > DENSITY_MAX) {
			return `density_tons_per_yd3 must be between ${DENSITY_MIN} and ${DENSITY_MAX}`;
		}
	}

	if (material_type !== null && material_type !== undefined) {
		if (!isValidMaterialType(material_type)) {
			return `material_type must be one of: ${VALID_MATERIAL_TYPES.join(', ')}, or null`;
		}
	}

	if (residual_rate_gal_sy !== null && residual_rate_gal_sy !== undefined) {
		const v = Number(residual_rate_gal_sy);
		if (isNaN(v) || v < RESIDUAL_RATE_MIN || v > RESIDUAL_RATE_MAX) {
			return `residual_rate_gal_sy must be between ${RESIDUAL_RATE_MIN} and ${RESIDUAL_RATE_MAX}`;
		}
	}

	return null;
}

// GET /api/org/materials
// Returns merged list: built-ins + org overrides + org custom materials
// source: "builtin" | "override" | "custom"
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const materialsDb = new DbMaterialsHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const orgRows = await materialsDb.getOrgMaterials(org.id);

		// Index org rows by base_material_id for quick override lookup
		const overrideByBuiltinId = new Map<string, (typeof orgRows)[0]>();
		const customRows: typeof orgRows = [];

		for (const row of orgRows) {
			if (row.base_material_id) {
				overrideByBuiltinId.set(row.base_material_id, row);
			} else {
				customRows.push(row);
			}
		}

		// Build unified list
		const result: Array<{
			id: string;
			name: string;
			category: string;
			density_tons_per_yd3: number | null;
			supplier: string | null;
			notes: string | null;
			base_material_id: string | null;
			material_type: string | null;
			residual_rate_gal_sy: number | null;
			sort_order: number;
			created_at: number | null;
			source: 'builtin' | 'override' | 'custom';
		}> = [];

		// 1. Merge built-ins with any org overrides
		for (const builtin of builtinMaterials ?? []) {
			const override = overrideByBuiltinId.get(builtin.id);
			if (override) {
				result.push({
					id: override.id,
					name: override.name,
					category: override.category,
					density_tons_per_yd3: override.density_tons_per_yd3,
					supplier: override.supplier,
					notes: override.notes,
					base_material_id: builtin.id,
					material_type: override.material_type,
					residual_rate_gal_sy: override.residual_rate_gal_sy,
					sort_order: override.sort_order,
					created_at: override.created_at,
					source: 'override'
				});
			} else {
				result.push({
					id: builtin.id,
					name: builtin.label,
					category: 'aggregate', // all built-ins are aggregate/subbase materials
					density_tons_per_yd3: builtin.densityTonsPerYd3,
					supplier: null,
					notes: null,
					base_material_id: null,
					material_type: null,
					residual_rate_gal_sy: null,
					sort_order: 0,
					created_at: null,
					source: 'builtin'
				});
			}
		}

		// 2. Append fully custom org materials
		for (const row of customRows) {
			result.push({
				id: row.id,
				name: row.name,
				category: row.category,
				density_tons_per_yd3: row.density_tons_per_yd3,
				supplier: row.supplier,
				notes: row.notes,
				base_material_id: null,
				material_type: row.material_type,
				residual_rate_gal_sy: row.residual_rate_gal_sy,
				sort_order: row.sort_order,
				created_at: row.created_at,
				source: 'custom'
			});
		}

		return json({ materials: result });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get org materials error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// POST /api/org/materials — create a custom material (owner/admin only)
export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const materialsDb = new DbMaterialsHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);
		if (role !== 'owner' && role !== 'admin') {
			return json({ error: 'Forbidden: admin or owner access required' }, { status: 403 });
		}

		const body = (await event.request.json()) as Record<string, unknown>;

		const validationError = validateMaterialInput(body, true);
		if (validationError) {
			return json({ error: validationError }, { status: 400 });
		}

		const material = await materialsDb.createOrgMaterial(org.id, {
			name: String(body.name).trim(),
			category: String(body.category),
			density_tons_per_yd3:
				body.density_tons_per_yd3 != null ? Number(body.density_tons_per_yd3) : null,
			supplier: body.supplier != null ? String(body.supplier) : null,
			notes: body.notes != null ? String(body.notes) : null,
			base_material_id: null, // POST always creates a fully custom material
			material_type: body.material_type != null ? String(body.material_type) : null,
			residual_rate_gal_sy:
				body.residual_rate_gal_sy != null ? Number(body.residual_rate_gal_sy) : null,
			sort_order: body.sort_order != null ? Number(body.sort_order) : 0
		});

		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'org_material',
			resourceId: material.id,
			action: 'created',
			newValue: { name: material.name, category: material.category },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ material, source: 'custom' }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create org material error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
