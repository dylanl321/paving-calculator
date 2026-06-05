import { json, type RequestEvent } from '@sveltejs/kit';
import { fetchCountyBoundary } from '$lib/server/gdot-geometry';

export async function GET(event: RequestEvent) {
	const county = event.url.searchParams.get('county');
	if (!county?.trim()) {
		return json({ error: 'Missing county parameter' }, { status: 400 });
	}

	const boundary = await fetchCountyBoundary(county);
	if (!boundary) {
		return json({ error: 'County boundary not found' }, { status: 404 });
	}

	return json(boundary);
}
