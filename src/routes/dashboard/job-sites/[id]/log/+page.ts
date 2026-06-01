import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch, parent }) => {
	await parent();

	const today = new Date().toISOString().split('T')[0];

	const [logsRes, summaryRes] = await Promise.all([
		fetch(`/api/job-sites/${params.id}/logs`),
		fetch(`/api/job-sites/${params.id}/logs/summary`)
	]);

	if (!logsRes.ok) {
		throw error(logsRes.status, 'Failed to load logs');
	}
	if (!summaryRes.ok) {
		throw error(summaryRes.status, 'Failed to load summary');
	}

	const { logs } = await logsRes.json();
	const { summary } = await summaryRes.json();

	const todayLog = logs.find((l: any) => l.log_date === today);

	return {
		logs,
		summary,
		todayLog,
		today
	};
};
