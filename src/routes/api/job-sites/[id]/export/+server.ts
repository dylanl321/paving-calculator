import { json, type RequestEvent } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth';
import { DbHelper } from '$lib/server/db';

function csvCell(value: string | number | null | undefined): string {
	const text = value == null ? '' : String(value);
	if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
	return text;
}

/**
 * CSV of loads and daily paving entries for this project.
 * Access is enforced by the job-site hook before this handler runs.
 */
export async function GET(event: RequestEvent) {
	try {
		const user = await requireAuth(event);
		if (!event.platform?.env?.DB) {
			return json({ error: 'Database not available' }, { status: 503 });
		}
		const db = new DbHelper(event.platform.env.DB);
		const jobSiteId = event.params.id;
		if (!jobSiteId) return json({ error: 'Job site ID is required' }, { status: 400 });
		const jobSite = await db.getJobSiteById(jobSiteId);
		const org = await db.getOrgByUserId(user.id);
		if (!jobSite || !org || jobSite.org_id !== org.id) {
			return json({ error: 'Job site not found' }, { status: 404 });
		}

		const loads = await event.platform.env.DB
			.prepare(
				`SELECT ticket_number, tons, timestamp, notes
				 FROM loads WHERE job_site_id = ? ORDER BY timestamp ASC`
			)
			.bind(jobSiteId)
			.all<{ ticket_number: string | null; tons: number; timestamp: number; notes: string | null }>()
			.then((r) => r.results);

		const entries = await event.platform.env.DB
			.prepare(
				`SELECT dl.log_date, le.entry_type, le.timestamp, le.tons_placed, le.notes
				 FROM log_entries le
				 JOIN daily_logs dl ON dl.id = le.daily_log_id
				 WHERE dl.job_site_id = ?
				 ORDER BY dl.log_date ASC, le.timestamp ASC`
			)
			.bind(jobSiteId)
			.all<{
				log_date: string;
				entry_type: string;
				timestamp: string;
				tons_placed: number | null;
				notes: string | null;
			}>()
			.then((r) => r.results);

		const lines = ['kind,date,time,ticket,tons,notes'];
		for (const load of loads) {
			const when = new Date(load.timestamp * 1000);
			const date = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
			const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
			lines.push(
				['load', date, time, load.ticket_number, load.tons, load.notes].map(csvCell).join(',')
			);
		}
		for (const entry of entries) {
			lines.push(
				['daily_log', entry.log_date, entry.timestamp, entry.entry_type, entry.tons_placed, entry.notes]
					.map(csvCell)
					.join(',')
			);
		}

		const filename = `${jobSite.name.replace(/[^\w.-]+/g, '_') || 'project'}-production.csv`;
		return new Response(lines.join('\n') + '\n', {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (error) {
		if (error instanceof Response) return error;
		console.error('Project export error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
