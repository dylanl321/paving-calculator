import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';

interface WorkZone {
	id: number;
	org_id: string;
	job_site_id: string;
	name: string;
	zone_type: 'paving' | 'milling' | 'tack' | 'base' | 'other';
	status: 'pending' | 'active' | 'complete' | 'hold';
	geometry_geojson: string | null;
	color: string | null;
	notes: string | null;
	created_at: number;
	updated_at: number;
	created_by: string | null;
}

interface UpdateWorkZoneRequest {
	name?: string;
	zone_type?: 'paving' | 'milling' | 'tack' | 'base' | 'other';
	status?: 'pending' | 'active' | 'complete' | 'hold';
	geometry_geojson?: string;
	color?: string;
	notes?: string;
}

export async function PATCH(event: RequestEvent): Promise<Response> {
	try {
		const user = await requireAuth(event);
		const { orgId, siteId, zoneId } = event.params;

		if (!orgId || !siteId || !zoneId) {
			return json({ error: 'Invalid parameters' }, { status: 400 });
		}

		const body: UpdateWorkZoneRequest = await event.request.json();
		const db = event.platform!.env.DB;

		// Verify org membership
		const membership = await db
			.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?')
			.bind(orgId, user.id)
			.first<{ role: string }>();

		if (!membership) {
			return json({ error: 'Not a member of this organization' }, { status: 403 });
		}

		// Verify zone exists and belongs to org
		const existingZone = await db
			.prepare('SELECT * FROM work_zones WHERE id = ? AND org_id = ? AND job_site_id = ?')
			.bind(parseInt(zoneId), orgId, siteId)
			.first<WorkZone>();

		if (!existingZone) {
			return json({ error: 'Work zone not found' }, { status: 404 });
		}

		// Build update query
		const updates: string[] = [];
		const values: (string | number)[] = [];

		if (body.name !== undefined) {
			updates.push('name = ?');
			values.push(body.name);
		}
		if (body.zone_type !== undefined) {
			updates.push('zone_type = ?');
			values.push(body.zone_type);
		}
		if (body.status !== undefined) {
			updates.push('status = ?');
			values.push(body.status);
		}
		if (body.geometry_geojson !== undefined) {
			updates.push('geometry_geojson = ?');
			values.push(body.geometry_geojson);
		}
		if (body.color !== undefined) {
			updates.push('color = ?');
			values.push(body.color);
		}
		if (body.notes !== undefined) {
			updates.push('notes = ?');
			values.push(body.notes);
		}

		if (updates.length === 0) {
			return json({ work_zone: existingZone });
		}

		updates.push('updated_at = ?');
		values.push(Math.floor(Date.now() / 1000));

		values.push(parseInt(zoneId));

		await db
			.prepare(`UPDATE work_zones SET ${updates.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();

		// Fetch updated zone
		const updatedZone = await db
			.prepare('SELECT * FROM work_zones WHERE id = ?')
			.bind(parseInt(zoneId))
			.first<WorkZone>();

		return json({ work_zone: updatedZone });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Update work zone error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE(event: RequestEvent): Promise<Response> {
	try {
		const user = await requireAuth(event);
		const { orgId, siteId, zoneId } = event.params;

		if (!orgId || !siteId || !zoneId) {
			return json({ error: 'Invalid parameters' }, { status: 400 });
		}

		const db = event.platform!.env.DB;

		// Verify org membership
		const membership = await db
			.prepare('SELECT role FROM org_members WHERE org_id = ? AND user_id = ?')
			.bind(orgId, user.id)
			.first<{ role: string }>();

		if (!membership) {
			return json({ error: 'Not a member of this organization' }, { status: 403 });
		}

		// Verify zone exists and belongs to org
		const existingZone = await db
			.prepare('SELECT id FROM work_zones WHERE id = ? AND org_id = ? AND job_site_id = ?')
			.bind(parseInt(zoneId), orgId, siteId)
			.first();

		if (!existingZone) {
			return json({ error: 'Work zone not found' }, { status: 404 });
		}

		// Delete zone
		await db.prepare('DELETE FROM work_zones WHERE id = ?').bind(parseInt(zoneId)).run();

		return json({ success: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete work zone error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
