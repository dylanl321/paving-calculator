import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { DbDailyLog, LogSummary } from '$lib/server/db-logs';

export const load: PageLoad = async ({ params, fetch, parent }) => {
	await parent();

	const res = await fetch(`/api/job-sites/${params.id}/logs`);

	if (!res.ok) {
		throw error(res.status, 'Failed to load log history');
	}

	const { logs }: { logs: DbDailyLog[] } = await res.json();

	const logsWithSummaries = await Promise.all(
		logs.map(async (log) => {
			const detailRes = await fetch(`/api/job-sites/${params.id}/logs/${log.id}`);
			if (detailRes.ok) {
				const { summary }: { summary: LogSummary } = await detailRes.json();
				return { ...log, summary };
			}
			return log;
		})
	);

	return {
		logs: logsWithSummaries
	};
};
