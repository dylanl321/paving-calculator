/**
 * Notification helpers — EOD summary data generation.
 *
 * generateEodSummary queries today's production data for an org and returns
 * a structured object suitable for rendering the eod_summary email template.
 */

import type { D1Database } from '../../cloudflare';
import { DbLogHelper, type LogSummary } from './db-logs';
import { DbHelper } from './db';
import { DbJobSiteConfigHelper } from './db-jobsite-config';

/** A site whose actual spread rate deviated >5% from the target. */
export interface SpreadRateFlag {
	site_name: string;
	actual_lbs_sy: number; // lbs/SY actual
	target_lbs_sy: number; // lbs/SY target from job_site_config
	deviation_pct: number; // signed percentage, e.g. +7.3 or -6.1
}

export interface SiteSummary {
	site_id: string;
	site_name: string;
	log_id: string;
	total_tons: number;
	total_loads: number;
	total_distance_ft: number;
	hours_worked: number;
	mix_type: string | null;
	spec_violations: number;
	/** Non-null when this site's spread rate deviated >5% from target. */
	spread_rate_flag: SpreadRateFlag | null;
}

export interface EodSummaryData {
	org_id: string;
	org_name: string;
	date: string; // YYYY-MM-DD
	total_tons: number;
	total_sqyd: number;
	total_loads: number;
	active_sites: number;
	spec_violations: number;
	sites: SiteSummary[];
	mix_breakdown: string;
	crew_notes: string;
	/** Sites whose spread rate deviated >5% from configured target. */
	spread_rate_flags: SpreadRateFlag[];
}

function toSqYd(distanceFt: number, widthFt = 12): number {
	return Math.round((distanceFt * widthFt) / 9);
}

function fmtTons(n: number): string {
	return n % 1 === 0 ? n.toString() : n.toFixed(1);
}

/**
 * Query today's production for orgId and compile into EodSummaryData.
 * "Today" is determined by the caller passing in the date string (YYYY-MM-DD)
 * so the cron handler can convert from the schedule timezone.
 */
/**
 * Compute actual spread rate (lbs/SY) for a daily log using its paving entries.
 *
 * Formula: (total_tons * 2000 lbs) / (total_distance_ft * lane_width_ft / 9 sq-yd)
 * Returns null when inputs are insufficient (no tonnage, no distance).
 */
function computeActualSpreadRate(
	totalTons: number,
	totalDistanceFt: number,
	laneWidthFt: number
): number | null {
	if (totalTons <= 0 || totalDistanceFt <= 0 || laneWidthFt <= 0) return null;
	const totalLbs = totalTons * 2000;
	const areaSqYd = (totalDistanceFt * laneWidthFt) / 9;
	return totalLbs / areaSqYd;
}

export async function generateEodSummary(
	db: D1Database,
	orgId: string,
	dateStr: string
): Promise<EodSummaryData> {
	const dbHelper = new DbHelper(db);
	const logHelper = new DbLogHelper(db);
	const configHelper = new DbJobSiteConfigHelper(db);

	// Fetch org name
	const org = await dbHelper.getOrganizationById(orgId);
	const orgName = org?.name ?? 'Your Organization';

	// Fetch all job sites for the org
	const jobSites = await dbHelper.getJobSitesByOrgId(orgId);

	const sites: SiteSummary[] = [];
	let grandTotalTons = 0;
	let grandTotalLoads = 0;
	let grandTotalDistanceFt = 0;
	let grandSpecViolations = 0;
	const mixCounts: Record<string, number> = {};
	const crewNotesList: string[] = [];
	const spreadRateFlags: SpreadRateFlag[] = [];

	for (const site of jobSites) {
		// Get the daily log for this site on the given date
		const log = await logHelper.getDailyLog(site.id, dateStr);
		if (!log) continue;

		const summary: LogSummary = await logHelper.getLogSummary(log.id);

		// Only include sites that had any paving activity today
		if (summary.total_tons === 0 && summary.total_loads === 0 && summary.paving_entries === 0) {
			continue;
		}

		// Count spec violations: density readings where compaction_pct < 92%
		const densityReadings = await logHelper.getDensityReadings(log.id);
		const specViolations = densityReadings.filter(
			(r) => r.compaction_pct !== null && r.compaction_pct < 92
		).length;

		// ── Spread rate compliance check ──────────────────────────────────────
		// Fetch job site config for target_spread_rate and lane_width_ft.
		// If target is set, compute actual vs target; flag if deviation > 5%.
		let spreadRateFlag: SpreadRateFlag | null = null;
		const siteConfig = await configHelper.getJobSiteConfig(site.id);
		if (siteConfig?.target_spread_rate && siteConfig.target_spread_rate > 0) {
			const laneWidth = siteConfig.lane_width_ft ?? 12;
			const actualRate = computeActualSpreadRate(
				summary.total_tons,
				summary.total_distance_ft,
				laneWidth
			);
			if (actualRate !== null) {
				const deviationPct =
					((actualRate - siteConfig.target_spread_rate) / siteConfig.target_spread_rate) * 100;
				if (Math.abs(deviationPct) > 5) {
					spreadRateFlag = {
						site_name: site.name,
						actual_lbs_sy: Math.round(actualRate * 10) / 10,
						target_lbs_sy: siteConfig.target_spread_rate,
						deviation_pct: Math.round(deviationPct * 10) / 10
					};
					spreadRateFlags.push(spreadRateFlag);
				}
			}
		}

		sites.push({
			site_id: site.id,
			site_name: site.name,
			log_id: log.id,
			total_tons: summary.total_tons,
			total_loads: summary.total_loads,
			total_distance_ft: summary.total_distance_ft,
			hours_worked: summary.hours_worked,
			mix_type: log.mix_type,
			spec_violations: specViolations,
			spread_rate_flag: spreadRateFlag
		});

		grandTotalTons += summary.total_tons;
		grandTotalLoads += summary.total_loads;
		grandTotalDistanceFt += summary.total_distance_ft;
		grandSpecViolations += specViolations;

		if (log.mix_type) {
			mixCounts[log.mix_type] = (mixCounts[log.mix_type] ?? 0) + 1;
		}

		if (log.notes) {
			crewNotesList.push(`${site.name}: ${log.notes}`);
		}
	}

	// Build mix breakdown text
	const mixLines = Object.entries(mixCounts).map(
		([mix, count]) => `${mix} — ${count} site${count !== 1 ? 's' : ''}`
	);
	if (sites.length > 0 && mixLines.length === 0) {
		mixLines.push('No mix type recorded');
	}
	const mixBreakdown = mixLines.join('\n') || 'No mix data';

	const crewNotes =
		crewNotesList.length > 0 ? crewNotesList.join('\n') : 'No notes recorded for today.';

	// Rough sq yards: sum each site's area (distance * assumed 12ft lane / 9)
	const totalSqYd = toSqYd(grandTotalDistanceFt);

	return {
		org_id: orgId,
		org_name: orgName,
		date: dateStr,
		total_tons: grandTotalTons,
		total_sqyd: totalSqYd,
		total_loads: grandTotalLoads,
		active_sites: sites.length,
		spec_violations: grandSpecViolations,
		sites,
		mix_breakdown: mixBreakdown,
		crew_notes: crewNotes,
		spread_rate_flags: spreadRateFlags
	};
}

/**
 * Convert EodSummaryData into the template variable map used by
 * renderTemplate / the eod_summary email template.
 */
export function eodSummaryToTemplateVars(
	data: EodSummaryData,
	opts: {
		logoUrl?: string | null;
		accentColor?: string | null;
		reportUrl?: string;
	} = {}
): Record<string, string> {
	const fmtDate = new Date(data.date + 'T12:00:00Z').toLocaleDateString('en-US', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'UTC'
	});

	// Build spread rate compliance block (text and HTML variants).
	let spreadRateText = '';
	let spreadRateHtml = '';
	if (data.spread_rate_flags.length > 0) {
		const flagLines = data.spread_rate_flags.map((f) => {
			const dir = f.deviation_pct > 0 ? 'over' : 'under';
			const abs = Math.abs(f.deviation_pct);
			return `${f.site_name}: actual ${f.actual_lbs_sy} lbs/SY vs target ${f.target_lbs_sy} lbs/SY (${abs}% ${dir})`;
		});
		spreadRateText = flagLines.join('\n');
		spreadRateHtml = flagLines
			.map(
				(line) =>
					`<tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;color:#9a3412;">&#9888;&nbsp; ${line}</td></tr>`
			)
			.join('');
	} else {
		spreadRateText = 'All sites within 5% of target spread rate.';
		spreadRateHtml =
			'<tr><td style="padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;font-size:13px;color:#166534;">&#10003;&nbsp; All sites within 5% of target spread rate.</td></tr>';
	}

	return {
		org_name: data.org_name,
		date: fmtDate,
		total_tons: fmtTons(data.total_tons),
		total_sqyd: data.total_sqyd.toLocaleString(),
		total_loads: data.total_loads.toString(),
		active_sites: data.active_sites.toString(),
		spec_violations: data.spec_violations.toString(),
		mix_breakdown: data.mix_breakdown,
		crew_notes: data.crew_notes,
		spread_rate_compliance_count: data.spread_rate_flags.length.toString(),
		spread_rate_compliance_text: spreadRateText,
		spread_rate_compliance_html: spreadRateHtml,
		logo_url: opts.logoUrl ?? '',
		accent_color: opts.accentColor ?? '#f5a623',
		report_url: opts.reportUrl ?? 'https://paverate.com/dashboard'
	};
}
