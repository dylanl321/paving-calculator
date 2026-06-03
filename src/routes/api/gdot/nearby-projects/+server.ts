import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

interface GdotProject {
	projectNumber: string | null;
	description: string | null;
	county: string | null;
	letDate: number | null;
	compDate: number | null;
}

export async function GET(event: RequestEvent) {
	const url = new URL(event.request.url);
	const latStr = url.searchParams.get('lat');
	const lngStr = url.searchParams.get('lng');
	const radiusStr = url.searchParams.get('radius') || '10';

	if (!latStr || !lngStr) {
		return json({ error: 'Missing lat or lng parameter' }, { status: 400 });
	}

	const lat = parseFloat(latStr);
	const lng = parseFloat(lngStr);
	const radiusMiles = parseFloat(radiusStr);

	if (isNaN(lat) || isNaN(lng) || isNaN(radiusMiles)) {
		return json({ error: 'Invalid lat, lng, or radius value' }, { status: 400 });
	}

	try {
		// Build GDOT GeoPI ArcGIS query
		const arcgisUrl = new URL(
			'https://gis.dot.ga.gov/maps/rest/services/GEOPI_APP/MapServer/0/query'
		);
		arcgisUrl.searchParams.set('where', '1=1');
		arcgisUrl.searchParams.set('geometry', JSON.stringify({ x: lng, y: lat }));
		arcgisUrl.searchParams.set('geometryType', 'esriGeometryPoint');
		arcgisUrl.searchParams.set('inSR', '4326');
		arcgisUrl.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
		arcgisUrl.searchParams.set('distance', String(radiusMiles * 5280)); // miles to feet
		arcgisUrl.searchParams.set('units', 'esriSRUnit_Foot');
		arcgisUrl.searchParams.set(
			'outFields',
			'PROJECT_NUMBER,DESCRIPTION,COUNTY,LET_DATE,COMP_DATE'
		);
		arcgisUrl.searchParams.set('outSR', '4326');
		arcgisUrl.searchParams.set('f', 'json');

		const response = await fetch(arcgisUrl.toString());

		if (!response.ok) {
			console.error('GDOT GeoPI fetch failed:', response.status, response.statusText);
			return json([]);
		}

		const data = (await response.json()) as {
			features?: Array<{
				attributes?: {
					PROJECT_NUMBER?: string;
					DESCRIPTION?: string;
					COUNTY?: string;
					LET_DATE?: number;
					COMP_DATE?: number;
				};
			}>;
		};

		if (!data.features || data.features.length === 0) {
			return json([]);
		}

		const projects: GdotProject[] = data.features.slice(0, 10).map((f) => ({
			projectNumber: f.attributes?.PROJECT_NUMBER || null,
			description: f.attributes?.DESCRIPTION || null,
			county: f.attributes?.COUNTY || null,
			letDate: f.attributes?.LET_DATE || null,
			compDate: f.attributes?.COMP_DATE || null
		}));

		return json(projects);
	} catch (err) {
		console.error('Error fetching nearby GDOT projects:', err);
		return json([]);
	}
}
