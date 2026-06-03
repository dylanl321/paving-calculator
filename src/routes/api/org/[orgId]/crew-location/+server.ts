import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import type { DbCrewLocation } from '$lib/server/db';

// PUT /api/org/[orgId]/crew-location - Update my location
export async function PUT(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const { orgId } = event.params;
		const db = event.platform!.env.DB;

		const body = (await event.request.json()) as {
			job_site_id?: number | null;
			lat: number;
			lng: number;
			accuracy?: number | null;
			heading?: number | null;
			speed?: number | null;
			status?: 'active' | 'idle' | 'offline';
			display_name: string;
			role: string;
		};
		const {
			job_site_id = null,
			lat,
			lng,
			accuracy = null,
			heading = null,
			speed = null,
			status = 'active',
			display_name,
			role
		} = body;

		if (
			typeof lat !== 'number' ||
			typeof lng !== 'number' ||
			!display_name ||
			!role
		) {
			return json({ error: 'Missing required fields: lat, lng, display_name, role' }, { status: 400 });
		}

		const now = Math.floor(Date.now() / 1000);

		// Upsert by org_id + user_id (enforced by unique index)
		await db
			.prepare(
				`INSERT INTO crew_locations (
          org_id, job_site_id, user_id, display_name, role,
          lat, lng, accuracy, heading, speed, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(org_id, user_id) DO UPDATE SET
          job_site_id = excluded.job_site_id,
          display_name = excluded.display_name,
          role = excluded.role,
          lat = excluded.lat,
          lng = excluded.lng,
          accuracy = excluded.accuracy,
          heading = excluded.heading,
          speed = excluded.speed,
          status = excluded.status,
          updated_at = excluded.updated_at`
			)
			.bind(
				orgId,
				job_site_id,
				user.id,
				display_name,
				role,
				lat,
				lng,
				accuracy,
				heading,
				speed,
				status,
				now
			)
			.run();

		return json({ ok: true });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Update crew location error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

// DELETE /api/org/[orgId]/crew-location - Remove my location (go offline)
export async function DELETE(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const { orgId } = event.params;
		const db = event.platform!.env.DB;

		await db
			.prepare('DELETE FROM crew_locations WHERE org_id = ? AND user_id = ?')
			.bind(orgId, user.id)
			.run();

		return json({ ok: true });
	} catch (error) {
		if (error instanceof Response) throw error;
		console.error('Delete crew location error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
