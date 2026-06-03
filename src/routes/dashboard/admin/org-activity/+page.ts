export const load = async ({ fetch }) => {
	const res = await fetch('/api/audit?limit=50', { credentials: 'include' });
	if (!res.ok) return { entries: [], nextCursor: null };
	const data = await res.json();
	return { entries: data.entries, nextCursor: data.next_cursor };
};
