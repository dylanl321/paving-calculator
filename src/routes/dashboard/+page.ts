import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { DbJobSite } from '$lib/server/db';

interface LiveSite {
	id: string;
	today_tons: number;
	today_loads: number;
	today_log_open: boolean;
	crew_name: string | null;
	crew_color: string | null;
}

export const load: PageLoad = async ({ fetch, url }) => {
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

		// Best-effort live status enrichment (crew, today's tons/loads, live status).
		// map-sites is owner/admin-only and only covers sites with coordinates; degrade gracefully.
		let liveSites: LiveSite[] = [];
		try {
			const mapRes = await fetch('/api/org/map-sites', { credentials: 'include' });
			if (mapRes.ok) {
				const mapData = (await mapRes.json()) as { sites?: LiveSite[] };
				liveSites = mapData.sites ?? [];
			}
		} catch {
			liveSites = [];
		}
		const liveById = new Map(liveSites.map((s) => [s.id, s]));

		// Best-effort completeness fetch
		let completenessData: { sites?: Array<{ id: string; score: number; status: string }> } = {};
		try {
			const completenessRes = await fetch('/api/org/completeness', { credentials: 'include' });
			if (completenessRes.ok) {
				completenessData = await completenessRes.json();
			}
		} catch {
			// Graceful degradation
		}
		const completenessById = new Map((completenessData.sites ?? []).map((s) => [s.id, s]));

		// Get calculation counts for each job site
		const jobSitesWithCounts = await Promise.all(
			jobSitesData.job_sites.map(async (site) => {
				const calcRes = await fetch(`/api/calculations?job_site_id=${site.id}`, {
					credentials: 'include'
				});
				const calcData = (await calcRes.json()) as { calculations?: unknown[] };
				const live = liveById.get(site.id);
				const completeness = completenessById.get(site.id);
				return {
					...site,
					calculation_count: calcData.calculations?.length || 0,
					today_tons: live?.today_tons ?? null,
					today_loads: live?.today_loads ?? null,
					today_log_open: live?.today_log_open ?? false,
					crew_name: live?.crew_name ?? null,
					crew_color: live?.crew_color ?? null,
					completeness_score: completeness?.score ?? null,
					completeness_status: completeness?.status ?? null
				};
			})
		);

		return {
			user: authData.user,
			org: authData.org,
			jobSites: jobSitesWithCounts,
			verified: url.searchParams.get('verified'),
			verifyError: url.searchParams.get('verify_error')
		};
	} catch (err) {
		if (err instanceof Response) throw err;
		throw redirect(302, '/login');
	}
};
