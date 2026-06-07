import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { loadEnrichedProjects } from '$lib/loaders/project-summaries';
import { getUxRole } from '$lib/uxRole';
import { EMPTY_PORTFOLIO, type Portfolio } from './_home/types';

export const load: PageLoad = async ({ fetch, url }) => {
	try {
		const authRes = await fetch('/api/auth/me', { credentials: 'include' });
		if (!authRes.ok) {
			throw redirect(302, '/login');
		}

		const authData = (await authRes.json()) as {
			user: unknown;
			org: { name?: string; role?: string | null } | null;
		};

		const role = authData.org?.role ?? '';
		const uxRole = getUxRole(role);

		// Field crew is redirected by the layout guard; if one still lands here we
		// only need a minimal card, so skip the (owner/admin-scoped) data fetches.
		if (uxRole === 'field_crew') {
			return {
				user: authData.user,
				org: authData.org,
				role,
				uxRole,
				projects: [],
				portfolio: EMPTY_PORTFOLIO,
				verified: url.searchParams.get('verified'),
				verifyError: url.searchParams.get('verify_error')
			};
		}

		// The overview needs live status (tons/logging/crew) and completeness, but
		// not the per-site calculation counts the full roster used — skip them.
		// Portfolio rollups + enriched projects are independent best-effort fetches.
		const [projects, portfolio] = await Promise.all([
			loadEnrichedProjects(fetch, { includeCalcCounts: false }).catch(() => []),
			fetchPortfolio(fetch)
		]);

		return {
			user: authData.user,
			org: authData.org,
			role,
			uxRole,
			projects,
			portfolio,
			verified: url.searchParams.get('verified'),
			verifyError: url.searchParams.get('verify_error')
		};
	} catch (err) {
		if (err instanceof Response) throw err;
		throw redirect(302, '/login');
	}
};

/** Best-effort typed fetch of the org portfolio rollup; degrades to empty. */
async function fetchPortfolio(fetchFn: typeof fetch): Promise<Portfolio> {
	try {
		const res = await fetchFn('/api/org/portfolio', { credentials: 'include' });
		if (!res.ok) return EMPTY_PORTFOLIO;
		const data = (await res.json()) as Portfolio;
		return data ?? EMPTY_PORTFOLIO;
	} catch {
		return EMPTY_PORTFOLIO;
	}
}
