// Pure helpers for the Reports page: one row per daily log across jobs, plus
// the one-line answer the page leads with ("2 days are still open").

export interface ReportLog {
	id: string;
	log_date: string; // YYYY-MM-DD
	closed_at: number | null;
	foreman_name: string | null;
}

export interface ReportJob {
	id: string;
	name: string;
}

export interface ReportRow {
	logId: string;
	jobId: string;
	jobName: string;
	date: string;
	closed: boolean;
	foremanName: string | null;
	/** Plain status shown on the row. */
	status: string;
}

/** Flattens per-job logs into rows, newest day first, then job name. */
export function buildReportRows(jobs: ReportJob[], logsByJob: Record<string, ReportLog[]>): ReportRow[] {
	const rows: ReportRow[] = [];
	for (const job of jobs) {
		for (const log of logsByJob[job.id] ?? []) {
			const closed = log.closed_at != null;
			rows.push({
				logId: log.id,
				jobId: job.id,
				jobName: job.name,
				date: log.log_date,
				closed,
				foremanName: log.foreman_name,
				status: closed
					? log.foreman_name
						? `Closed by ${log.foreman_name}`
						: 'Closed'
					: 'Open'
			});
		}
	}
	return rows.sort((a, b) => (a.date === b.date ? a.jobName.localeCompare(b.jobName) : a.date < b.date ? 1 : -1));
}

/**
 * The page headline. Days before `today` that are still open are the ones that
 * need someone; today's open log is normal while the crew is paving.
 */
export function reportsHeadline(rows: ReportRow[], today: string): { title: string; subtitle: string } {
	if (rows.length === 0) {
		return { title: 'No daily reports yet', subtitle: 'Reports appear here once a crew starts a daily log.' };
	}
	const stale = rows.filter((r) => !r.closed && r.date < today);
	const openToday = rows.filter((r) => !r.closed && r.date === today).length;
	if (stale.length > 0) {
		const jobs = new Set(stale.map((r) => r.jobName));
		return {
			title: `${stale.length} past ${stale.length === 1 ? 'day is' : 'days are'} still open`,
			subtitle: `Close ${stale.length === 1 ? 'it' : 'them'} so the report can go out: ${[...jobs].join(', ')}.`
		};
	}
	return {
		title: 'Every past day is closed',
		subtitle:
			openToday > 0
				? `${openToday} ${openToday === 1 ? 'job is' : 'jobs are'} logging today.`
				: 'No job is logging today.'
	};
}
