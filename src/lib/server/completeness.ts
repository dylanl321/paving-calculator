/**
 * Job completeness scoring — pure helper, no DB access.
 *
 * Design doc: docs/job-completeness-design.md
 *
 * Score breakdown:
 *   Required fields  (10) × 8 pts each = 80 pts max
 *   Optional checks  (10) × 2 pts each = 20 pts max
 *   Total                               = 100 pts max
 *
 * Status thresholds:
 *   >= 90  → complete
 *   >= 60  → needs-attention
 *   <  60  → incomplete
 */

// ── Constants ───────────────────────────────────────────────────────────────

export const REQUIRED_FIELDS = [
	'name',
	'status',
	'road_type',
	'num_lanes',
	'lane_width_ft',
	'total_length_ft',
	'scope_of_work',
	'mix_type',
	'target_thickness_in',
	'target_spread_rate'
] as const;

export const OPTIONAL_FIELDS = [
	'tack_type',
	'target_tack_rate',
	'num_lifts',
	'total_tonnage',
	'coordinates',
	'est_start_date',
	'completion_date',
	'customer_name',
	'project_manager',
	'has_daily_log'
] as const;

// Points per field
const REQUIRED_POINTS = 8;
const OPTIONAL_POINTS = 2;

// Status thresholds
const THRESHOLD_COMPLETE = 90;
const THRESHOLD_NEEDS_ATTENTION = 60;

// ── Types ───────────────────────────────────────────────────────────────────

/** Flat row returned by the SQL join in the completeness endpoint. */
export interface JobSiteCompletenessRow {
	// job_sites
	id: string;
	name: string | null;
	status: string | null;
	latitude: number | null;
	longitude: number | null;
	est_start_date: string | null;
	completion_date: string | null;
	customer_name: string | null;
	project_manager: string | null;
	job_number: string | null;

	// job_site_config (LEFT JOIN — may all be null)
	road_type: string | null;
	num_lanes: number | null;
	lane_width_ft: number | null;
	total_length_ft: number | null;
	scope_of_work: string | null;
	mix_type: string | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	tack_type: string | null;
	target_tack_rate: number | null;
	num_lifts: number | null;
	total_tonnage: number | null;

	// aggregate counts
	daily_log_count: number;
	bid_item_count: number;
	mix_count: number;
	document_count: number;
	milestone_count: number;
}

export interface SiteCompleteness {
	score: number;
	status: 'complete' | 'needs-attention' | 'incomplete';
	required: {
		filled: number;
		total: number;
		missing: string[];
	};
	optional: {
		satisfied: number;
		total: number;
		missing: string[];
	};
	contract_summary: {
		has_job_number: boolean;
		bid_item_count: number;
		mix_count: number;
		document_count: number;
		milestone_count: number;
	};
}

// ── Scoring helper ───────────────────────────────────────────────────────────

/**
 * Pure scoring function — no DB access, safe in unit tests and edge workers.
 */
export function scoreJobSite(row: JobSiteCompletenessRow): SiteCompleteness {
	// ── Required fields ──────────────────────────────────────────────────
	const requiredChecks: Record<(typeof REQUIRED_FIELDS)[number], boolean> = {
		name: Boolean(row.name?.trim()),
		status: Boolean(row.status?.trim()),
		road_type: Boolean(row.road_type),
		num_lanes: row.num_lanes != null && row.num_lanes > 0,
		lane_width_ft: row.lane_width_ft != null && row.lane_width_ft > 0,
		total_length_ft: row.total_length_ft != null && row.total_length_ft > 0,
		scope_of_work: Boolean(row.scope_of_work),
		mix_type: Boolean(row.mix_type?.trim()),
		target_thickness_in: row.target_thickness_in != null && row.target_thickness_in > 0,
		target_spread_rate: row.target_spread_rate != null && row.target_spread_rate > 0
	};

	const requiredMissing = (Object.keys(requiredChecks) as (typeof REQUIRED_FIELDS)[number][]).filter(
		(k) => !requiredChecks[k]
	);
	const filledRequired = REQUIRED_FIELDS.length - requiredMissing.length;

	// ── Optional checks ──────────────────────────────────────────────────
	const optionalChecks: Record<(typeof OPTIONAL_FIELDS)[number], boolean> = {
		tack_type: Boolean(row.tack_type),
		target_tack_rate: row.target_tack_rate != null && row.target_tack_rate > 0,
		num_lifts: row.num_lifts != null && row.num_lifts > 0,
		total_tonnage: row.total_tonnage != null && row.total_tonnage > 0,
		coordinates: row.latitude != null && row.longitude != null,
		est_start_date: Boolean(row.est_start_date?.trim()),
		completion_date: Boolean(row.completion_date?.trim()),
		customer_name: Boolean(row.customer_name?.trim()),
		project_manager: Boolean(row.project_manager?.trim()),
		has_daily_log: row.daily_log_count > 0
	};

	const optionalMissing = (
		Object.keys(optionalChecks) as (typeof OPTIONAL_FIELDS)[number][]
	).filter((k) => !optionalChecks[k]);
	const satisfiedOptional = OPTIONAL_FIELDS.length - optionalMissing.length;

	// ── Score & status ───────────────────────────────────────────────────
	const requiredScore = (filledRequired / REQUIRED_FIELDS.length) * (REQUIRED_POINTS * REQUIRED_FIELDS.length);
	const optionalScore = (satisfiedOptional / OPTIONAL_FIELDS.length) * (OPTIONAL_POINTS * OPTIONAL_FIELDS.length);
	const score = Math.round(requiredScore + optionalScore);

	let status: SiteCompleteness['status'];
	if (score >= THRESHOLD_COMPLETE) {
		status = 'complete';
	} else if (score >= THRESHOLD_NEEDS_ATTENTION) {
		status = 'needs-attention';
	} else {
		status = 'incomplete';
	}

	return {
		score,
		status,
		required: {
			filled: filledRequired,
			total: REQUIRED_FIELDS.length,
			missing: requiredMissing
		},
		optional: {
			satisfied: satisfiedOptional,
			total: OPTIONAL_FIELDS.length,
			missing: optionalMissing
		},
		contract_summary: {
			has_job_number: Boolean(row.job_number?.trim()),
			bid_item_count: row.bid_item_count,
			mix_count: row.mix_count,
			document_count: row.document_count,
			milestone_count: row.milestone_count
		}
	};
}
