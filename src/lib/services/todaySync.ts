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
	const data = (await res.json()) as { job_sites?: JobSiteOption[] };
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
	const { log } = (await logRes.json()) as { log: { id: string } };
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
			const { entry: created } = (await res.json()) as { entry: { id: string } };
			today.updateEntry(entry.id, { remote_id: created.id });
			pushed++;
		}
	}

	return { pushed, logId };
}

/**
 * Pull today's entries from the cloud daily log into the local Today store.
 * Only pulls entries that don't already exist locally (based on remote_id).
 * Returns the count of new entries pulled.
 */
export async function pullFromCloud(jobSiteId: string): Promise<number> {
	// 1. Fetch today's log list to find today's log ID
	const logsRes = await fetch(`/api/job-sites/${jobSiteId}/logs`, {
		credentials: 'include'
	});
	if (!logsRes.ok) throw new Error('Could not fetch logs');

	const logsData = (await logsRes.json()) as { logs?: { id: string; log_date: string }[] };
	const todayDate = new Date().toISOString().split('T')[0];
	const todayLog = logsData.logs?.find((log: any) => log.log_date === todayDate);

	if (!todayLog) {
		// No log for today in the cloud
		return 0;
	}

	// 2. Fetch full log details with entries
	const logRes = await fetch(`/api/job-sites/${jobSiteId}/logs/${todayLog.id}`, {
		credentials: 'include'
	});
	if (!logRes.ok) throw new Error('Could not fetch log details');

	const logData = (await logRes.json()) as { entries?: any[] };
	const cloudEntries = logData.entries || [];

	// 3. Find entries that don't exist locally
	const existingRemoteIds = new Set(
		today.entries.filter(e => e.remote_id).map(e => e.remote_id)
	);

	let pulled = 0;
	for (const cloudEntry of cloudEntries) {
		if (existingRemoteIds.has(cloudEntry.id)) continue;

		// Add the cloud entry to local today store, then update it with remote_id
		const entry = today.addEntry({
			entry_type: cloudEntry.entry_type,
			timestamp: cloudEntry.timestamp,
			station_start: cloudEntry.station_start,
			station_end: cloudEntry.station_end,
			distance_ft: cloudEntry.distance_ft,
			tons_placed: cloudEntry.tons_placed,
			loads_count: cloudEntry.loads_count,
			truck_tickets: cloudEntry.truck_tickets,
			spread_rate_actual: cloudEntry.spread_rate_actual,
			tack_gallons: cloudEntry.tack_gallons,
			lane: cloudEntry.lane,
			notes: cloudEntry.notes
		});
		today.updateEntry(entry.id, { remote_id: cloudEntry.id });
		pulled++;
	}

	return pulled;
}
