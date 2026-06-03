import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { DbDailyLog, LogSummary } from '$lib/server/db-logs';

export const load: PageLoad = async ({ params, fetch, parent, url }) => {
	await parent();

	const today = new Date().toISOString().split('T')[0];
	const viewDateId = url.searchParams.get('date');

	const [logsRes, summaryRes, configRes, roleRes] = await Promise.all([
		fetch(`/api/job-sites/${params.id}/logs`),
		fetch(`/api/job-sites/${params.id}/logs/summary`),
		fetch(`/api/job-sites/${params.id}/config`),
		fetch(`/api/org/role`)
	]);

	if (!logsRes.ok) {
		throw error(logsRes.status, 'Failed to load logs');
	}
	if (!summaryRes.ok) {
		throw error(summaryRes.status, 'Failed to load summary');
	}

	const { logs }: { logs: DbDailyLog[] } = await logsRes.json();
	const { summary }: { summary: LogSummary } = await summaryRes.json();
	const siteConfig = configRes.ok ? await configRes.json() : null;
	const { role: userRole, isGlobalAdmin } = roleRes.ok
		? await roleRes.json()
		: { role: null, isGlobalAdmin: false };

	const todayLog = logs.find((l) => l.log_date === today);

	let activeLog = todayLog;
	let isHistoricalView = false;
	let prevLogId: string | null = null;
	let nextLogId: string | null = null;

	if (viewDateId) {
		const historicalLog = logs.find((l) => l.id === viewDateId);
		if (historicalLog) {
			activeLog = historicalLog;
			isHistoricalView = true;

			const sortedLogs = [...logs].sort(
				(a, b) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime()
			);
			const currentIndex = sortedLogs.findIndex((l) => l.id === viewDateId);
			if (currentIndex > 0) {
				prevLogId = sortedLogs[currentIndex - 1].id;
			}
			if (currentIndex < sortedLogs.length - 1) {
				nextLogId = sortedLogs[currentIndex + 1].id;
			}
		}
	}

	return {
		logs,
		summary,
		todayLog,
		today,
		siteConfig,
		activeLog,
		isHistoricalView,
		prevLogId,
		nextLogId,
		userRole,
		isGlobalAdmin
	};
};
