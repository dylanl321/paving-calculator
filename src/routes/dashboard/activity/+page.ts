import type { PageLoad } from './$types';

interface AuditEntry {
	id: string;
	actor_user_id: string | null;
	actor_name: string | null;
	action: string;
	resource_type: string;
	resource_id: string | null;
	ip_address: string | null;
	created_at: number;
}

interface AuditResponse {
	entries: AuditEntry[];
	next_cursor: number | null;
}

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/audit?limit=50', {
		credentials: 'include'
	});

	if (!res.ok) {
		throw new Error('Failed to load audit log');
	}

	const data = (await res.json()) as AuditResponse;

	return {
		entries: data.entries,
		nextCursor: data.next_cursor
	};
};
