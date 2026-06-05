import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { requireAuth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

interface Suggestion {
	pct: number;
	name: string;
	description: string;
	target_tons: number;
	est_date: string | null;
}

interface SuggestionsResponse {
	suggestions: Suggestion[];
	avg_daily_tons: number;
	data_source: 'history' | 'default';
	active_days: number;
}

const DEFAULT_TONS_PER_DAY = 500;

const MILESTONES = [
	{ pct: 25, name: '25% Complete' },
	{ pct: 50, name: 'Halfway Point' },
	{ pct: 75, name: '75% Complete' },
	{ pct: 100, name: 'Project Complete' }
];

export const GET: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const user = await requireAuth({ locals, platform });
	const db = new DbHelper(platform!.env.DB);

	// Get job site and verify ownership
	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	// Get job site config
	const config = await db.getJobSiteConfig(params.id);
	const totalTonnage = config?.total_tonnage ?? null;
	const estStartDate = jobSite.est_start_date;

	// Calculate org's average daily production from history
	let avgDailyTons = DEFAULT_TONS_PER_DAY;
	let dataSource: 'history' | 'default' = 'default';
	let activeDays = 0;

	try {
		const productionHistory = await platform!.env.DB.prepare(
			`SELECT dl.log_date, SUM(le.tons_placed) as daily_tons
			FROM log_entries le
			JOIN daily_logs dl ON dl.id = le.daily_log_id
			JOIN job_sites js ON js.id = dl.job_site_id
			WHERE js.org_id = ? AND le.tons_placed IS NOT NULL AND le.tons_placed > 0
			GROUP BY dl.log_date`
		)
			.bind(org.id)
			.all<{ log_date: string; daily_tons: number }>();

		if (productionHistory.results && productionHistory.results.length > 0) {
			const totalTons = productionHistory.results.reduce((sum, day) => sum + day.daily_tons, 0);
			activeDays = productionHistory.results.length;
			avgDailyTons = totalTons / activeDays;
			dataSource = 'history';
		}
	} catch (err) {
		console.error('Error calculating production history:', err);
		// Fall back to default
	}

	// Generate milestone suggestions
	const suggestions: Suggestion[] = MILESTONES.map((m) => {
		const targetTons = totalTonnage ? (totalTonnage * m.pct) / 100 : 0;
		let estDate: string | null = null;

		if (totalTonnage && estStartDate && avgDailyTons > 0) {
			const daysToMilestone = Math.ceil(targetTons / avgDailyTons);
			const startDate = new Date(estStartDate);
			startDate.setDate(startDate.getDate() + daysToMilestone);
			estDate = startDate.toISOString().split('T')[0];
		}

		return {
			pct: m.pct,
			name: m.name,
			description: `Estimated ${m.pct}% completion milestone`,
			target_tons: Math.round(targetTons),
			est_date: estDate
		};
	});

	const response: SuggestionsResponse = {
		suggestions,
		avg_daily_tons: Math.round(avgDailyTons),
		data_source: dataSource,
		active_days: activeDays
	};

	return json(response);
};
