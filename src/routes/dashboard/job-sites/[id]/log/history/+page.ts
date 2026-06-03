import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { DbDailyLog, LogSummary } from '$lib/server/db-logs';

export type LogWithSummary = DbDailyLog & { summary?: LogSummary };

export const load: PageLoad = async ({ params, fetch, parent }) => {
	await parent();

	const res = await fetch(`/api/job-sites/${params.id}/logs`);

	if (!res.ok) {
		throw error(res.status, 'Failed to load log history');
	}

	const { logs } = (await res.json()) as { logs: DbDailyLog[] };

	const logsWithSummaries: LogWithSummary[] = await Promise.all(
		logs.map(async (log): Promise<LogWithSummary> => {
			const detailRes = await fetch(`/api/job-sites/${params.id}/logs/${log.id}`);
			if (detailRes.ok) {
				const { summary } = (await detailRes.json()) as { summary: LogSummary };
				return { ...log, summary };
			}
			return log;
		})
	);

	return {
		logs: logsWithSummaries
	};
};
