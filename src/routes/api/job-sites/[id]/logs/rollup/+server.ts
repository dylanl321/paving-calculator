import { json, error } from '@sveltejs/kit';
import { DbHelper } from '$lib/server/db';
import { DbLogHelper } from '$lib/server/db-logs';
import type { RequestHandler } from './$types';

function getWeekBounds(dateStr: string): { start: string; end: string } {
	const date = new Date(dateStr + 'T00:00:00');
	const day = date.getDay();
	const diff = date.getDate() - day;
	const sunday = new Date(date);
	sunday.setDate(diff);
	const saturday = new Date(sunday);
	saturday.setDate(sunday.getDate() + 6);

	return {
		start: sunday.toISOString().split('T')[0],
		end: saturday.toISOString().split('T')[0]
	};
}

function getMonthBounds(dateStr: string): { start: string; end: string } {
	const date = new Date(dateStr + 'T00:00:00');
	const year = date.getFullYear();
	const month = date.getMonth();
	const start = new Date(year, month, 1);
	const end = new Date(year, month + 1, 0);

	return {
		start: start.toISOString().split('T')[0],
		end: end.toISOString().split('T')[0]
	};
}

function getPrevWeekBounds(dateStr: string): { start: string; end: string } {
	const date = new Date(dateStr + 'T00:00:00');
	date.setDate(date.getDate() - 7);
	return getWeekBounds(date.toISOString().split('T')[0]);
}

function getPrevMonthBounds(dateStr: string): { start: string; end: string } {
	const date = new Date(dateStr + 'T00:00:00');
	const year = date.getFullYear();
	const month = date.getMonth() - 1;
	const prevMonth = new Date(year, month, 1);
	return getMonthBounds(prevMonth.toISOString().split('T')[0]);
}

export const GET: RequestHandler = async ({ params, locals, platform, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = new DbHelper(platform!.env.DB);
	const logDb = new DbLogHelper(platform!.env.DB);

	const jobSite = await db.getJobSiteById(params.id);
	if (!jobSite) {
		throw error(404, 'Job site not found');
	}

	const org = await db.getOrgByUserId(locals.user.id);
	if (!org || org.id !== jobSite.org_id) {
		throw error(403, 'Access denied');
	}

	const period = url.searchParams.get('period') || 'week';
	const dateParam = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	if (period !== 'week' && period !== 'month') {
		throw error(400, 'period must be "week" or "month"');
	}

	const bounds = period === 'week' ? getWeekBounds(dateParam) : getMonthBounds(dateParam);
	const prevBounds = period === 'week' ? getPrevWeekBounds(dateParam) : getPrevMonthBounds(dateParam);

	// Fetch all logs for the period (with high limit to get all in range)
	const allLogs = await logDb.listDailyLogs(params.id, 1000, 0);

	// Filter logs for the current period
	const logs = allLogs.filter(log => log.log_date >= bounds.start && log.log_date <= bounds.end);

	// Filter logs for the previous period
	const prevLogs = allLogs.filter(log => log.log_date >= prevBounds.start && log.log_date <= prevBounds.end);

	// Fetch summaries for current period logs
	const days = await Promise.all(
		logs.map(async (log) => {
			const summary = await logDb.getLogSummary(log.id);
			return {
				date: log.log_date,
				tons: summary?.total_tons || 0,
				loads: summary?.total_loads || 0,
				distance_ft: summary?.total_distance_ft || 0,
				hours: summary?.hours_worked || 0
			};
		})
	);

	// Calculate totals
	const totals = {
		tons: days.reduce((sum, d) => sum + d.tons, 0),
		loads: days.reduce((sum, d) => sum + d.loads, 0),
		distance_ft: days.reduce((sum, d) => sum + d.distance_ft, 0),
		days_worked: days.filter(d => d.tons > 0 || d.loads > 0).length,
		avg_tons_per_day: 0
	};

	if (totals.days_worked > 0) {
		totals.avg_tons_per_day = totals.tons / totals.days_worked;
	}

	// Calculate previous period tons
	const prevSummaries = await Promise.all(
		prevLogs.map(log => logDb.getLogSummary(log.id))
	);
	const prev_period_tons = prevSummaries.reduce((sum, summary) => {
		return sum + (summary?.total_tons || 0);
	}, 0);

	// Format period label
	let periodLabel = '';
	if (period === 'week') {
		const startDate = new Date(bounds.start + 'T00:00:00');
		periodLabel = `Week of ${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
	} else {
		const startDate = new Date(bounds.start + 'T00:00:00');
		periodLabel = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	}

	return json({
		period: periodLabel,
		bounds,
		days: days.sort((a, b) => a.date.localeCompare(b.date)),
		totals,
		prev_period_tons
	});
};
