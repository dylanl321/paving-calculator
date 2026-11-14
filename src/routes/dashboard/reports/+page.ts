import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { loadEnrichedProjects } from '$lib/loaders/project-summaries';
import type { ReportLog } from '$lib/reports';

export const load: PageLoad = async ({ fetch }) => {
	const authRes = await fetch('/api/auth/me', { credentials: 'include' });
	if (!authRes.ok) {
		throw redirect(302, '/login');
	}
	const authData = (await authRes.json()) as { org: { role?: string | null } | null };

	const projects = await loadEnrichedProjects(fetch, { includeCalcCounts: false }).catch(() => []);
	// Recent logs for jobs that are active or were paved recently. Best effort:
	// a job whose logs fail to load is just left out of the list.
	const jobs = projects
		.filter((p) => (p.status ?? '').toLowerCase() !== 'archived')
		.map((p) => ({ id: p.id, name: p.name }));

	const entries = await Promise.all(
		jobs.map(async (job) => {
			try {
				const res = await fetch(`/api/job-sites/${job.id}/logs?limit=14`, { credentials: 'include' });
				if (!res.ok) return [job.id, []] as const;
				const body = (await res.json()) as { logs?: ReportLog[] };
				return [job.id, body.logs ?? []] as const;
			} catch {
				return [job.id, []] as const;
			}
		})
	);

	return {
		role: authData.org?.role ?? '',
		jobs,
		logsByJob: Object.fromEntries(entries) as Record<string, ReportLog[]>
	};
};
