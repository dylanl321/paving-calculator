import { json, type RequestEvent } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import { buildImportRoutePreview } from '$lib/server/gdot-geometry';

interface ImportRoutePreviewRequest {
	route_designation?: string | null;
	county?: string | null;
	location_description?: string | null;
	begin_terminus?: string | null;
	end_terminus?: string | null;
	total_length_ft?: number | null;
	roadway_log_events?: Array<{
		milepost: number;
		station: number;
		event_type?: string;
		is_reference?: boolean;
	}>;
}

function str(v: unknown): string | null {
	if (v == null) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
}

export async function POST(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		const db = new DbHelper(event.platform!.env.DB);
		const org = await db.getOrgByUserId(user.id);
		if (!org) {
			return json({ error: 'Organization not found' }, { status: 404 });
		}

		const body = (await event.request.json()) as ImportRoutePreviewRequest;
		const preview = await buildImportRoutePreview({
			routeDesignation: str(body.route_designation),
			county: str(body.county),
			locationDescription: str(body.location_description),
			totalLengthFt: typeof body.total_length_ft === 'number' ? body.total_length_ft : null,
			beginTerminus: str(body.begin_terminus),
			endTerminus: str(body.end_terminus),
			roadwayLogEvents: Array.isArray(body.roadway_log_events) ? body.roadway_log_events : []
		});

		return json({ route_preview: preview });
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Import route preview error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
