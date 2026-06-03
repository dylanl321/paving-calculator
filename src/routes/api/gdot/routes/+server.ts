import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

interface GdotRouteResult {
	routeId: string | null;
	roadName: string | null;
	county: string | null;
	district: string | null;
	functionalClass: number | null;
}

export async function GET(event: RequestEvent) {
	if (!event.platform?.env?.DB) {
		return json({ error: 'Database not available' }, { status: 503 });
	}

	const url = new URL(event.request.url);
	const q = url.searchParams.get('q');

	try {
		let results: GdotRouteResult[];

		if (!q || q.trim() === '') {
			// No search query - return top 20 by road_name
			const rows = await event.platform.env.DB
				.prepare(
					`SELECT DISTINCT route_id, road_name, county_code, district_code, functional_class
					 FROM dot_road_segments
					 WHERE state_dot = "GA" AND road_name IS NOT NULL
					 ORDER BY road_name
					 LIMIT 20`
				)
				.all<{
					route_id: string | null;
					road_name: string | null;
					county_code: string | null;
					district_code: string | null;
					functional_class: number | null;
				}>()
				.then((r) => r.results);

			results = rows.map((r) => ({
				routeId: r.route_id,
				roadName: r.road_name,
				county: r.county_code,
				district: r.district_code,
				functionalClass: r.functional_class
			}));
		} else {
			// Search by road_name or route_id (case-insensitive LIKE)
			const searchPattern = `%${q}%`;
			const rows = await event.platform.env.DB
				.prepare(
					`SELECT DISTINCT route_id, road_name, county_code, district_code, functional_class
					 FROM dot_road_segments
					 WHERE state_dot = "GA"
					   AND (road_name LIKE ? COLLATE NOCASE OR route_id LIKE ? COLLATE NOCASE)
					 ORDER BY road_name
					 LIMIT 20`
				)
				.bind(searchPattern, searchPattern)
				.all<{
					route_id: string | null;
					road_name: string | null;
					county_code: string | null;
					district_code: string | null;
					functional_class: number | null;
				}>()
				.then((r) => r.results);

			results = rows.map((r) => ({
				routeId: r.route_id,
				roadName: r.road_name,
				county: r.county_code,
				district: r.district_code,
				functionalClass: r.functional_class
			}));
		}

		return json(results);
	} catch (err) {
		console.error('Error searching GDOT routes:', err);
		return json({ error: 'Failed to search routes' }, { status: 500 });
	}
}
