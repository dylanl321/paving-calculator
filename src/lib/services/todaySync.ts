// Best-effort cloud sync for the local-first Today session.
//
// When the foreman is signed in and has linked the day to a job site, this maps
// the local Today session onto the existing cloud daily-log endpoints. The
// local entry shape mirrors DbLogEntry, so the push is a field-for-field map.
// Sync is additive and never gates offline use: if anything fails, the local
// day is untouched and remains the source of truth.
import { today } from '$lib/stores/today.svelte';

export interface JobSiteOption {
	id: string;
	name: string;
	location_description: string | null;
	status: string;
}

export async function fetchJobSites(): Promise<JobSiteOption[]> {
	const res = await fetch('/api/job-sites', { credentials: 'include' });
	if (!res.ok) throw new Error('Could not load job sites');
	const data = await res.json();
	return data.job_sites ?? [];
}

export interface SyncResult {
	pushed: number;
	logId: string;
}

/**
 * Push the current Today session to the selected job site's cloud daily log.
 * Ensures today's log exists, updates the day header, and POSTs any local
 * entries that have not yet been synced (tracked via entry.remote_id).
 */
export async function pushTodayToCloud(jobSiteId: string): Promise<SyncResult> {
	// 1. Ensure today's daily log exists (POST is idempotent — returns existing).
	const logRes = await fetch(`/api/job-sites/${jobSiteId}/logs`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include'
	});
	if (!logRes.ok) throw new Error('Could not start cloud day');
	const { log } = await logRes.json();
	const logId: string = log.id;

	today.jobSiteId = jobSiteId;
	today.remoteLogId = logId;

	// 2. Update the day header (conditions / crew / times / notes).
	await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify(today.toServerLogHeader())
	}).catch(() => {});

	// 3. Push entries that have not yet synced.
	let pushed = 0;
	for (const entry of today.entries) {
		if (entry.remote_id) continue;
		const res = await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}/entries`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(today.toServerEntry(entry))
		});
		if (res.ok) {
			const { entry: created } = await res.json();
			today.updateEntry(entry.id, { remote_id: created.id });
			pushed++;
		}
	}

	return { pushed, logId };
}
