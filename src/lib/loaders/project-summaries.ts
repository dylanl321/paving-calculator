import type { ProjectSummary } from '$lib/server/db-jobsites';

/**
 * A {@link ProjectSummary} enriched with the best-effort live/derived fields the
 * dashboard surfaces (today's tons/loads, live log status, crew, completeness,
 * last activity, calc count, and the optional config-sourced contract value).
 *
 * All enrichment fields are nullable: the underlying endpoints are owner/admin
 * only or otherwise best-effort, so a missing value degrades gracefully.
 */
export interface EnrichedProject extends ProjectSummary {
	calculation_count: number;
	today_tons: number | null;
	today_loads: number | null;
	today_log_open: boolean;
	crew_name: string | null;
	crew_color: string | null;
	completeness_score: number | null;
	completeness_status: string | null;
	last_activity: number | null;
	/** Optional config-sourced contract value (not on DbJobSite). */
	total_contract_value: number | null;
}

interface LiveSite {
	id: string;
	today_tons: number;
	today_loads: number;
	today_log_open: boolean;
	crew_name: string | null;
	crew_color: string | null;
}

interface CompletenessSite {
	id: string;
	completeness: { score: number; status: string } | null;
}

type Fetch = typeof fetch;

/**
 * Fetch `/api/job-sites` (typed as {@link ProjectSummary}) and layer in the same
 * best-effort enrichment the dashboard has always done: `/api/org/map-sites`
 * (today's tons/loads/live status/crew), `/api/org/completeness`,
 * `/api/org/last-activity`, and a per-site `/api/calculations` count.
 *
 * Shared by the Projects index (`/dashboard/projects`) and the Home overview
 * (`/dashboard`). `includeCalcCounts` lets Home skip the N per-site calc
 * fetches it does not need.
 */
export async function loadEnrichedProjects(
	fetchFn: Fetch,
	options: { includeCalcCounts?: boolean } = {}
): Promise<EnrichedProject[]> {
	const { includeCalcCounts = true } = options;

	const jobSitesRes = await fetchFn('/api/job-sites', { credentials: 'include' });
	if (!jobSitesRes.ok) {
		throw new Error('Failed to fetch job sites');
	}
	const jobSitesData = (await jobSitesRes.json()) as { job_sites: ProjectSummary[] };

	// Best-effort live status enrichment (crew, today's tons/loads, live status).
	// map-sites is owner/admin-only and only covers sites with coordinates.
	let liveSites: LiveSite[] = [];
	try {
		const mapRes = await fetchFn('/api/org/map-sites', { credentials: 'include' });
		if (mapRes.ok) {
			const mapData = (await mapRes.json()) as { sites?: LiveSite[] };
			liveSites = mapData.sites ?? [];
		}
	} catch {
		liveSites = [];
	}
	const liveById = new Map(liveSites.map((s) => [s.id, s]));

	// Best-effort completeness fetch. Shape: { sites: [{ id, completeness: { score, status } }] }.
	let completenessSites: CompletenessSite[] = [];
	try {
		const completenessRes = await fetchFn('/api/org/completeness', { credentials: 'include' });
		if (completenessRes.ok) {
			const completenessData = (await completenessRes.json()) as { sites?: CompletenessSite[] };
			completenessSites = completenessData.sites ?? [];
		}
	} catch {
		completenessSites = [];
	}
	const completenessById = new Map(completenessSites.map((s) => [s.id, s.completeness]));

	// Best-effort last-activity fetch (latest daily_logs.created_at per site).
	let lastActivitySites: Array<{ id: string; last_activity: number | null }> = [];
	try {
		const lastActivityRes = await fetchFn('/api/org/last-activity', { credentials: 'include' });
		if (lastActivityRes.ok) {
			const lastActivityData = (await lastActivityRes.json()) as {
				sites?: Array<{ id: string; last_activity: number | null }>;
			};
			lastActivitySites = lastActivityData.sites ?? [];
		}
	} catch {
		lastActivitySites = [];
	}
	const lastActivityById = new Map(lastActivitySites.map((s) => [s.id, s.last_activity]));

	const enrich = (site: ProjectSummary, calculationCount: number): EnrichedProject => {
		const live = liveById.get(site.id);
		const completeness = completenessById.get(site.id);
		return {
			...site,
			calculation_count: calculationCount,
			today_tons: live?.today_tons ?? null,
			today_loads: live?.today_loads ?? null,
			today_log_open: live?.today_log_open ?? false,
			crew_name: live?.crew_name ?? null,
			crew_color: live?.crew_color ?? null,
			completeness_score: completeness?.score ?? null,
			completeness_status: completeness?.status ?? null,
			last_activity: lastActivityById.get(site.id) ?? null,
			total_contract_value: null
		};
	};

	if (!includeCalcCounts) {
		return jobSitesData.job_sites.map((site) => enrich(site, 0));
	}

	return Promise.all(
		jobSitesData.job_sites.map(async (site) => {
			const calcRes = await fetchFn(`/api/calculations?job_site_id=${site.id}`, {
				credentials: 'include'
			});
			const calcData = (await calcRes.json()) as { calculations?: unknown[] };
			return enrich(site, calcData.calculations?.length ?? 0);
		})
	);
}
