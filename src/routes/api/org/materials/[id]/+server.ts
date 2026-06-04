import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbMaterialsHelper } from '$lib/server/db-materials';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';
import { materials as builtinMaterials } from '$lib/config';

const VALID_CATEGORIES = ['aggregate', 'asphalt', 'soil', 'concrete', 'other'] as const;
type Category = (typeof VALID_CATEGORIES)[number];

const NAME_MAX = 100;
const DENSITY_MIN = 0.1;
const DENSITY_MAX = 5.0;

function isValidCategory(v: unknown): v is Category {
	return typeof v === 'string' && VALID_CATEGORIES.includes(v as Category);
}

function validateMaterialInput(body: Record<string, unknown>): string | null {
	const { name, category, density_tons_per_yd3 } = body;

	if (name !== undefined) {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			return 'name is required';
		}
		if (name.trim().length > NAME_MAX) {
			return `name must be ${NAME_MAX} characters or fewer`;
		}
	}

	if (category !== undefined && !isValidCategory(category)) {
		return `category must be one of: ${VALID_CATEGORIES.join(', ')}`;
	}

	if (density_tons_per_yd3 !== null && density_tons_per_yd3 !== undefined) {
		const v = Number(density_tons_per_yd3);
		if (isNaN(v) || v < DENSITY_MIN || v > DENSITY_MAX) {
			return `density_tons_per_yd3 must be between ${DENSITY_MIN} and ${DENSITY_MAX}`;
		}
	}

	return null;
}

function getBuiltinById(id: string) {
	return (builtinMaterials ?? []).find((m) => m.id === id) ?? null;
}

// PUT /api/org/materials/[id]
// Works for both custom and built-in overrides.
// For built-in: if org has override row -> update it; else create one.
// For custom: update fields in place.
export async function PUT(event: RequestEvent) {
	const { id } = event.params as { id: string };

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

		const validationError = validateMaterialInput(body);
		if (validationError) {
			return json({ error: validationError }, { status: 400 });
		}

		// Check if this is a built-in material ID (e.g. "MAT.GAB")
		const builtin = getBuiltinById(id);

		let material;
		let source: 'override' | 'custom';

		if (builtin) {
			// This is a PUT to a built-in ID -> upsert override row
			const input: Parameters<DbMaterialsHelper['upsertBuiltinOverride']>[2] = {};
			if (body.name !== undefined) input.name = String(body.name).trim();
			if (body.category !== undefined) input.category = String(body.category);
			if (body.density_tons_per_yd3 !== undefined)
				input.density_tons_per_yd3 =
					body.density_tons_per_yd3 != null ? Number(body.density_tons_per_yd3) : null;
			if (body.supplier !== undefined)
				input.supplier = body.supplier != null ? String(body.supplier) : null;
			if (body.notes !== undefined)
				input.notes = body.notes != null ? String(body.notes) : null;
			if (body.sort_order !== undefined) input.sort_order = Number(body.sort_order);

			// For upsert, if creating new, we need name + category
			if (!input.name) input.name = builtin.label;
			if (!input.category) input.category = 'aggregate';

			material = await materialsDb.upsertBuiltinOverride(org.id, id, input);
			source = 'override';
		} else {
			// Custom material: find by DB uuid
			const existing = await materialsDb.getMaterialById(id, org.id);
			if (!existing) {
				return json({ error: 'Material not found' }, { status: 404 });
			}

			const input: Parameters<DbMaterialsHelper['updateOrgMaterial']>[2] = {};
			if (body.name !== undefined) input.name = String(body.name).trim();
			if (body.category !== undefined) input.category = String(body.category);
			if (body.density_tons_per_yd3 !== undefined)
				input.density_tons_per_yd3 =
					body.density_tons_per_yd3 != null ? Number(body.density_tons_per_yd3) : null;
			if (body.supplier !== undefined)
				input.supplier = body.supplier != null ? String(body.supplier) : null;
			if (body.notes !== undefined)
				input.notes = body.notes != null ? String(body.notes) : null;
			if (body.sort_order !== undefined) input.sort_order = Number(body.sort_order);

			material = await materialsDb.updateOrgMaterial(id, org.id, input);
			if (!material) {
				return json({ error: 'Material not found' }, { status: 404 });
			}
			source = 'custom';
		}

		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'org_material',
			resourceId: material.id,
			action: 'updated',
			newValue: { name: material.name },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ material, source });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Update org material error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// DELETE /api/org/materials/[id]
// Custom materials: soft-delete (is_active = 0)
// Built-in overrides: clear the override (is_active = 0), restoring the built-in
// Built-in IDs (MAT.*): treated as "clear override" — cannot hard-delete built-ins
export async function DELETE(event: RequestEvent) {
	const { id } = event.params as { id: string };

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

		// Check if this is a built-in material ID (MAT.*)
		const builtin = getBuiltinById(id);

		if (builtin) {
			// Try to clear the override row if one exists
			const override = await materialsDb.getMaterialByBaseMaterialId(org.id, id);
			if (!override) {
				// No override exists — nothing to do, built-in stands
				return json({
					message: 'No override exists for this built-in material',
					cleared: false
				});
			}
			await materialsDb.clearBuiltinOverride(override.id, org.id);
			recordAudit(event.platform!.env.DB, {
				actorUserId: user.id,
				actorName: user.name,
				orgId: org.id,
				resourceType: 'org_material',
				resourceId: override.id,
				action: 'deleted',
				newValue: { cleared_override: id },
				ipAddress:
					event.request.headers.get('cf-connecting-ip') ||
					event.request.headers.get('x-forwarded-for') ||
					event.getClientAddress(),
				userAgent: event.request.headers.get('user-agent') || undefined
			});
			return json({ message: 'Override cleared; built-in material restored', cleared: true });
		}

		// Custom material or override row by DB uuid
		const existing = await materialsDb.getMaterialById(id, org.id);
		if (!existing) {
			return json({ error: 'Material not found' }, { status: 404 });
		}

		if (existing.base_material_id !== null) {
			// This is an override row being deleted by its DB uuid
			const cleared = await materialsDb.clearBuiltinOverride(id, org.id);
			if (!cleared) {
				return json({ error: 'Failed to clear override' }, { status: 500 });
			}
			recordAudit(event.platform!.env.DB, {
				actorUserId: user.id,
				actorName: user.name,
				orgId: org.id,
				resourceType: 'org_material',
				resourceId: id,
				action: 'deleted',
				newValue: { cleared_override: existing.base_material_id },
				ipAddress:
					event.request.headers.get('cf-connecting-ip') ||
					event.request.headers.get('x-forwarded-for') ||
					event.getClientAddress(),
				userAgent: event.request.headers.get('user-agent') || undefined
			});
			return json({ message: 'Override cleared; built-in material restored', cleared: true });
		}

		// Fully custom material
		const deleted = await materialsDb.deleteOrgMaterial(id, org.id);
		if (!deleted) {
			return json({ error: 'Failed to delete material' }, { status: 500 });
		}

		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'org_material',
			resourceId: id,
			action: 'deleted',
			newValue: { name: existing.name },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ message: 'Material deleted', deleted: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete org material error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
