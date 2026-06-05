import type { PageLoad } from './$types';

interface JobSite {
	id: string;
	name: string;
	location_description: string | null;
	status: string;
}

interface JobSiteConfig {
	lane_width_ft: number | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	tack_type: string | null;
	mix_type: string | null;
	total_length_ft: number | null;
	total_tonnage: number | null;
}

interface ProductionMix {
	id: string;
	mix_name: string;
	mix_type: string | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	tack_type: string | null;
	target_tack_rate: number | null;
	takeoff_tonnage: number | null;
	bid_quantity: number | null;
	is_active: number;
}

function courseTypeFromMix(value: string | null | undefined): string | null {
	if (!value) return null;
	const mix = value.toUpperCase();
	if (/\bBASE\b|GAB/.test(mix)) return 'TOLERANCE.BASE';
	if (/OGFC|OGI|OPEN GRADED/.test(mix)) return 'TOLERANCE.OGFC';
	if (/PEM/.test(mix)) return 'TOLERANCE.PEM';
	return 'TOLERANCE.INTERMEDIATE_WEARING';
}

// The workspace (/app) remains usable without auth. When a job_site_id is present,
// hydrate the calculator from that real project if the current session can access it.
export const load: PageLoad = async ({ url, fetch }) => {
	const jobSiteId = url.searchParams.get('job_site_id');
	if (!jobSiteId) return { jobContext: null };

	const [siteRes, configRes, mixesRes] = await Promise.all([
		fetch(`/api/job-sites/${jobSiteId}`, { credentials: 'include' }),
		fetch(`/api/job-sites/${jobSiteId}/config`, { credentials: 'include' }),
		fetch(`/api/job-sites/${jobSiteId}/mixes`, { credentials: 'include' })
	]);

	if (!siteRes.ok) {
		return {
			jobContext: {
				error: siteRes.status === 401 ? 'auth-required' : 'unavailable',
				jobSiteId
			}
		};
	}

	const jobSite = (await siteRes.json()) as JobSite;
	const configData = (configRes.ok ? await configRes.json() : { config: null }) as {
		config: JobSiteConfig | null;
	};
	const mixesData = (mixesRes.ok ? await mixesRes.json() : { mixes: [] }) as {
		mixes: ProductionMix[];
	};

	const mixes = mixesData.mixes ?? [];
	const activeMix = mixes.find((mix) => mix.is_active === 1) ?? mixes[0] ?? null;
	const config = configData.config;
	const calculatorConfig = config
		? {
				...config,
				target_thickness_in: activeMix?.target_thickness_in ?? config.target_thickness_in,
				target_spread_rate: activeMix?.target_spread_rate ?? config.target_spread_rate,
				tack_type: activeMix?.tack_type ?? config.tack_type,
				mix_type: activeMix?.mix_type ?? activeMix?.mix_name ?? config.mix_type,
				total_tonnage:
					mixes.reduce((sum, mix) => sum + (mix.takeoff_tonnage ?? 0), 0) ||
					config.total_tonnage
			}
		: null;

	return {
		jobContext: {
			jobSite,
			config: calculatorConfig,
			activeMix,
			courseType: courseTypeFromMix(
				activeMix?.mix_type ?? activeMix?.mix_name ?? calculatorConfig?.mix_type
			)
		}
	};
};
