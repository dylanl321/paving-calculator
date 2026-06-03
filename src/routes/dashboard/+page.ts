import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { DbJobSite } from '$lib/server/db';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const authRes = await fetch('/api/auth/me', { credentials: 'include' });
		if (!authRes.ok) {
			throw redirect(302, '/login');
		}

		const authData = (await authRes.json()) as {
			user: unknown;
			org: unknown;
		};

		const jobSitesRes = await fetch('/api/job-sites', { credentials: 'include' });
		if (!jobSitesRes.ok) {
			throw new Error('Failed to fetch job sites');
		}

		const jobSitesData: { job_sites: DbJobSite[] } = await jobSitesRes.json();

		// Get calculation counts for each job site
		const jobSitesWithCounts = await Promise.all(
			jobSitesData.job_sites.map(async (site) => {
				const calcRes = await fetch(`/api/calculations?job_site_id=${site.id}`, {
					credentials: 'include'
				});
				const calcData = (await calcRes.json()) as { calculations?: unknown[] };
				return {
					...site,
					calculation_count: calcData.calculations?.length || 0
				};
			})
		);

		return {
			user: authData.user,
			org: authData.org,
			jobSites: jobSitesWithCounts
		};
	} catch (err) {
		if (err instanceof Response) throw err;
		throw redirect(302, '/login');
	}
};
