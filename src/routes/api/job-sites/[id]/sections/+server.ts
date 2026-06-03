import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper, type DbRoadSection } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';

export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const sections = await event.platform!.env.DB.prepare(
			'SELECT * FROM road_sections WHERE job_site_id = ? ORDER BY sort_order ASC, created_at ASC'
		)
			.bind(jobSiteId)
			.all<DbRoadSection>();

		return json({
			sections: sections.results || []
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Get road sections error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

interface CreateSectionRequest {
	name: string;
	lane?: string;
	station_start?: number | null;
	station_end?: number | null;
	status?: 'active' | 'completed' | 'skipped';
	geometry_geojson?: string | null;
	notes?: string | null;
	sort_order?: number;
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);

		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const jobSiteId = event.params.id!;
		const jobSite = await db.getJobSiteById(jobSiteId);

		if (!jobSite) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		if (jobSite.org_id !== org.id) {
			return json({ error: 'Unauthorized' }, { status: 403 });
		}

		const body: CreateSectionRequest = await event.request.json();

		if (!body.name) {
			return json({ error: 'Section name is required' }, { status: 400 });
		}

		// Generate ID with sec_ prefix
		const id = 'sec_' + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
		const now = Math.floor(Date.now() / 1000);

		const section: DbRoadSection = {
			id,
			job_site_id: jobSiteId,
			name: body.name,
			lane: body.lane || '1',
			station_start: body.station_start ?? null,
			station_end: body.station_end ?? null,
			status: body.status || 'active',
			geometry_geojson: body.geometry_geojson || null,
			notes: body.notes || null,
			sort_order: body.sort_order ?? 0,
			created_at: now,
			updated_at: now
		};

		await event.platform!.env.DB.prepare(
			`INSERT INTO road_sections
			(id, job_site_id, name, lane, station_start, station_end, status, geometry_geojson, notes, sort_order, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
			.bind(
				section.id,
				section.job_site_id,
				section.name,
				section.lane,
				section.station_start,
				section.station_end,
				section.status,
				section.geometry_geojson,
				section.notes,
				section.sort_order,
				section.created_at,
				section.updated_at
			)
			.run();

		return json(section);
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Create road section error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
