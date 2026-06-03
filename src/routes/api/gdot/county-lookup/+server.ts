import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export async function GET(event: RequestEvent) {
	if (!event.platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 503 });
	}

	const url = new URL(event.request.url);
	const latStr = url.searchParams.get('lat');
	const lngStr = url.searchParams.get('lng');

	if (!latStr || !lngStr) {
		return json({ error: 'Missing lat or lng parameter' }, { status: 400 });
	}

	const lat = parseFloat(latStr);
	const lng = parseFloat(lngStr);

	if (isNaN(lat) || isNaN(lng)) {
		return json({ error: 'Invalid lat or lng value' }, { status: 400 });
	}

	try {
		// Create a bounding box: lat +/- 0.1, lng +/- 0.1
		const minLat = lat - 0.1;
		const maxLat = lat + 0.1;
		const minLng = lng - 0.1;
		const maxLng = lng + 0.1;

		// Query for nearby segments with geometry
		// We'll parse geometry_geojson to find segments within the bounding box
		const segments = await event.platform.env.DB
			.prepare(
				`SELECT county_code, district_code, geometry_geojson
				 FROM dot_road_segments
				 WHERE state_dot = "GA"
				   AND county_code IS NOT NULL
				   AND district_code IS NOT NULL
				   AND geometry_geojson IS NOT NULL
				 LIMIT 1000`
			)
			.all<{
				county_code: string | null;
				district_code: string | null;
				geometry_geojson: string | null;
			}>()
			.then((r) => r.results);

		// Find a segment whose geometry intersects the bounding box
		for (const seg of segments) {
			if (!seg.geometry_geojson) continue;
			try {
				const geom = JSON.parse(seg.geometry_geojson);
				if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
					// Check if any coordinate is within the bounding box
					for (const coord of geom.coordinates as [number, number][]) {
						const [segLng, segLat] = coord;
						if (segLat >= minLat && segLat <= maxLat && segLng >= minLng && segLng <= maxLng) {
							return json({
								county: seg.county_code,
								district: seg.district_code
							});
						}
					}
				}
			} catch {
				// Invalid geometry JSON, skip
				continue;
			}
		}

		// No match found
		return json({ county: null, district: null });
	} catch (err) {
		console.error('Error looking up county/district:', err);
		return json({ error: 'Failed to lookup location' }, { status: 500 });
	}
}
