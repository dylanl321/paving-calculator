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

interface CreateWorkZoneRequest {
	name: string;
	zone_type: 'paving' | 'milling' | 'tack' | 'base' | 'other';
	status?: 'pending' | 'active' | 'complete' | 'hold';
	geometry_geojson?: string;
	color?: string;
	notes?: string;
}

export async function GET(event: RequestEvent): Promise<Response> {
	try {
		const user = await requireAuth(event);
		const { orgId, siteId } = event.params;

		if (!orgId || !siteId) {
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

		// Get all work zones for the job site
		const zones = await db
			.prepare(
				'SELECT * FROM work_zones WHERE org_id = ? AND job_site_id = ? ORDER BY created_at DESC'
			)
			.bind(orgId, siteId)
			.all<WorkZone>();

		return json({ work_zones: zones.results || [] });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get work zones error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function POST(event: RequestEvent): Promise<Response> {
	try {
		const user = await requireAuth(event);
		const { orgId, siteId } = event.params;

		if (!orgId || !siteId) {
			return json({ error: 'Invalid parameters' }, { status: 400 });
		}

		const body: CreateWorkZoneRequest = await event.request.json();

		if (!body.name || !body.zone_type) {
			return json({ error: 'Name and zone_type are required' }, { status: 400 });
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

		// Verify job site exists and belongs to org
		const jobSite = await db
			.prepare('SELECT id FROM job_sites WHERE id = ? AND org_id = ?')
			.bind(siteId, orgId)
			.first();

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		// Insert work zone
		const now = Math.floor(Date.now() / 1000);
		const result = await db
			.prepare(
				`INSERT INTO work_zones (org_id, job_site_id, name, zone_type, status, geometry_geojson, color, notes, created_at, updated_at, created_by)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				RETURNING *`
			)
			.bind(
				orgId,
				siteId,
				body.name,
				body.zone_type,
				body.status || 'pending',
				body.geometry_geojson || null,
				body.color || null,
				body.notes || null,
				now,
				now,
				user.id
			)
			.first<WorkZone>();

		return json({ work_zone: result }, { status: 201 });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create work zone error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
