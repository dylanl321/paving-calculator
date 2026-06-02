import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/audit?limit=50', {
		credentials: 'include'
	});

	if (!res.ok) {
		throw new Error('Failed to load audit log');
	}

	const data = await res.json();

	return {
		entries: data.entries,
		nextCursor: data.next_cursor
	};
};
