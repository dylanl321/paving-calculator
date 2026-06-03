import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbRoadSection } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { recordAudit } from '$lib/server/audit';

export async function PATCH(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const sectionId = event.params.sectionId!;

		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Check section exists and belongs to this job site
		const section = await event.platform!.env.DB.prepare(
			'SELECT * FROM road_sections WHERE id = ? AND job_site_id = ?'
		)
			.bind(sectionId, jobSiteId)
			.first<DbRoadSection>();

		if (!section) {
			return json({ error: 'Section not found' }, { status: 404 });
		}

		const body: Partial<CreateSectionRequest> = await event.request.json();

		// Build update query dynamically
		const updates: string[] = [];
		const values: (string | number | null)[] = [];

		if (body.name !== undefined) {
			updates.push('name = ?');
			values.push(body.name);
		}
		if (body.lane !== undefined) {
			updates.push('lane = ?');
			values.push(body.lane);
		}
		if (body.station_start !== undefined) {
			updates.push('station_start = ?');
			values.push(body.station_start);
		}
		if (body.station_end !== undefined) {
			updates.push('station_end = ?');
			values.push(body.station_end);
		}
		if (body.status !== undefined) {
			if (!['active', 'completed', 'skipped'].includes(body.status)) {
				return json({ error: 'Invalid status' }, { status: 400 });
			}
			updates.push('status = ?');
			values.push(body.status);
		}
		if (body.geometry_geojson !== undefined) {
			updates.push('geometry_geojson = ?');
			values.push(body.geometry_geojson);
		}
		if (body.notes !== undefined) {
			updates.push('notes = ?');
			values.push(body.notes);
		}
		if (body.sort_order !== undefined) {
			updates.push('sort_order = ?');
			values.push(body.sort_order);
		}

		if (updates.length === 0) {
			return json(section);
		}

		const now = Math.floor(Date.now() / 1000);
		updates.push('updated_at = ?');
		values.push(now);

		const query = `UPDATE road_sections SET ${updates.join(', ')} WHERE id = ?`;
		values.push(sectionId);

		await event.platform!.env.DB.prepare(query).bind(...values).run();

		// Fetch updated section
		const updatedSection = await event.platform!.env.DB.prepare(
			'SELECT * FROM road_sections WHERE id = ?'
		)
			.bind(sectionId)
			.first<DbRoadSection>();

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'section',
			resourceId: sectionId,
			action: 'update',
			oldValue: section,
			newValue: updatedSection,
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json(updatedSection);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Update road section error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const sectionId = event.params.sectionId!;

		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		// Check section exists and belongs to this job site
		const section = await event.platform!.env.DB.prepare(
			'SELECT * FROM road_sections WHERE id = ? AND job_site_id = ?'
		)
			.bind(sectionId, jobSiteId)
			.first<DbRoadSection>();

		if (!section) {
			return json({ error: 'Section not found' }, { status: 404 });
		}

		await event.platform!.env.DB.prepare('DELETE FROM road_sections WHERE id = ?')
			.bind(sectionId)
			.run();

		await recordAudit(event.platform!.env.DB, {
			actorUserId: user.id,
			actorName: user.name,
			orgId: org.id,
			resourceType: 'section',
			resourceId: sectionId,
			action: 'delete',
			oldValue: section,
			ipAddress:
				event.request.headers.get('cf-connecting-ip') ||
				event.request.headers.get('x-forwarded-for') ||
				undefined,
			userAgent: event.request.headers.get('user-agent') || undefined
		});

		return json({ ok: true });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Delete road section error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface CreateSectionRequest {
	name?: string;
	lane?: string;
	station_start?: number | null;
	station_end?: number | null;
	status?: 'active' | 'completed' | 'skipped';
	geometry_geojson?: string | null;
	notes?: string | null;
	sort_order?: number;
}
