import { error, redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { PlanStatus } from '$lib/plan-status';

export const load: PageLoad = async ({ params, fetch, url }) => {
	const auth = await fetch('/api/auth/me', { credentials: 'include' });
	if (!auth.ok) throw redirect(302, '/login');
	const siteRes = await fetch(`/api/job-sites/${params.id}`, { credentials: 'include' });
	if (siteRes.status === 404) throw error(404, 'Job site not found');
	if (!siteRes.ok) throw error(siteRes.status, 'Failed to load project');
	const site = await siteRes.json();
	const planRes = await fetch(`/api/job-sites/${params.id}/plan-status`, { credentials: 'include' });
	const planBody = planRes.ok ? ((await planRes.json()) as { status?: PlanStatus }) : {};
	const logsRes = await fetch(`/api/job-sites/${params.id}/logs?limit=14`, { credentials: 'include' });
	const logsBody = logsRes.ok ? ((await logsRes.json()) as { logs?: Array<Record<string, unknown>> }) : { logs: [] };
	const date = url.searchParams.get('date');
	return {
		site,
		status: planBody.status ?? null,
		logs: logsBody.logs ?? [],
		date
	};
};
