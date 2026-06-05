import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbOrgHelper, type EquipmentTemplate } from '$lib/server/db-org';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

// GET /api/org/equipment-templates
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const orgDb = new DbOrgHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const templates = await orgDb.getEquipmentTemplates(org.id);
		return json({ templates });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get equipment templates error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// POST /api/org/equipment-templates — create a new template
export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const orgDb = new DbOrgHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);
		if (!role) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		const body = (await event.request.json()) as Record<string, unknown>;

		if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
			return json({ error: 'Template name is required' }, { status: 400 });
		}

		if (!Array.isArray(body.items) || body.items.length === 0) {
			return json({ error: 'Template must include at least one item' }, { status: 400 });
		}

		const existingTemplates = await orgDb.getEquipmentTemplates(org.id);

		const newTemplate: EquipmentTemplate = {
			id: crypto.randomUUID(),
			name: String(body.name).trim(),
			items: body.items.map((item: any) => ({
				equipment_type: String(item.equipment_type),
				name: String(item.name),
				capacity: item.capacity != null ? String(item.capacity) : null,
				notes: item.notes != null ? String(item.notes) : null
			})),
			created_at: Math.floor(Date.now() / 1000)
		};

		const updatedTemplates = [...existingTemplates, newTemplate];
		await orgDb.upsertEquipmentTemplates(org.id, updatedTemplates);

		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'equipment_template',
			resourceId: newTemplate.id,
			action: 'created',
			newValue: { name: newTemplate.name, item_count: newTemplate.items.length },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ template: newTemplate }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create equipment template error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// DELETE /api/org/equipment-templates?id=<uuid>
export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const orgDb = new DbOrgHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const role = await db.getUserRole(user.id, org.id);
		if (!role) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		const templateId = event.url.searchParams.get('id');
		if (!templateId) {
			return json({ error: 'Template id is required' }, { status: 400 });
		}

		const existingTemplates = await orgDb.getEquipmentTemplates(org.id);
		const templateToDelete = existingTemplates.find((t) => t.id === templateId);

		if (!templateToDelete) {
			return json({ error: 'Template not found' }, { status: 404 });
		}

		const updatedTemplates = existingTemplates.filter((t) => t.id !== templateId);
		await orgDb.upsertEquipmentTemplates(org.id, updatedTemplates);

		recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'equipment_template',
			resourceId: templateId,
			action: 'deleted',
			oldValue: { name: templateToDelete.name },
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete equipment template error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
