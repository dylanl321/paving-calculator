import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { DbDailyLog, LogSummary } from '$lib/server/db-logs';

interface ConfigResponse {
	config: unknown;
}
interface RoleResponse {
	role: string | null;
	isGlobalAdmin: boolean;
}

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
	const siteConfig = configRes.ok ? ((await configRes.json()) as ConfigResponse) : null;
	const { role: userRole, isGlobalAdmin } = (
		roleRes.ok ? await roleRes.json() : { role: null, isGlobalAdmin: false }
	) as RoleResponse;

	const todayLog = logs.find((l) => l.log_date === today);

	let activeLog = todayLog;
	let isHistoricalView = false;
	let prevLogId: string | null = null;
	let nextLogId: string | null = null;
	let prevLabel = 'Prev';
	let nextLabel = 'Next';

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
				const prevLog = sortedLogs[currentIndex - 1];
				const currentDate = new Date(historicalLog.log_date);
				const prevDate = new Date(prevLog.log_date);
				const diffDays = Math.round((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
				if (diffDays === 1) {
					prevLabel = 'Yesterday';
				}
			}
			if (currentIndex < sortedLogs.length - 1) {
				nextLogId = sortedLogs[currentIndex + 1].id;
				const nextLog = sortedLogs[currentIndex + 1];
				const currentDate = new Date(historicalLog.log_date);
				const nextDate = new Date(nextLog.log_date);
				const diffDays = Math.round((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
				if (diffDays === 1) {
					nextLabel = 'Tomorrow';
				}
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
		prevLabel,
		nextLabel,
		userRole,
		isGlobalAdmin
	};
};
