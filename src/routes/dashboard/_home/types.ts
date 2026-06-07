// Shared types for the role-aware dashboard home modules. Mirrors the JSON
// shape returned by `GET /api/org/portfolio` so the loader and every role
// module stay strictly typed (no untyped `res.json()`).

export interface PortfolioSetupGap {
	id: string;
	name: string;
	missing: string[];
}

export interface PortfolioJob {
	id: string;
	name: string;
	status: string;
	contract_value: number;
	tonnage_awarded: number;
	tonnage_target: number;
	tonnage_placed: number;
	progress_pct: number;
}

export interface PortfolioCounts {
	active_projects: number;
	total_projects: number;
	logging_today: number;
	tons_today: number;
}

export interface Portfolio {
	contract_value_total: number;
	tonnage_awarded_total: number;
	tonnage_target_total: number;
	tonnage_placed_total: number;
	counts: PortfolioCounts;
	setup_gaps: PortfolioSetupGap[];
	per_job: PortfolioJob[];
}

/** Human labels for the raw completeness field keys returned in `missing[]`. */
const GAP_LABELS: Record<string, string> = {
	name: 'Name',
	status: 'Status',
	road_type: 'Road type',
	num_lanes: 'Lane count',
	lane_width_ft: 'Lane width',
	total_length_ft: 'Length',
	scope_of_work: 'Scope of work',
	mix_type: 'Mix type',
	target_thickness_in: 'Target thickness',
	target_spread_rate: 'Spread rate',
	tack_type: 'Tack type',
	target_tack_rate: 'Tack rate',
	num_lifts: 'Lifts',
	total_tonnage: 'Total tonnage',
	coordinates: 'Map location',
	est_start_date: 'Start date',
	completion_date: 'Completion date',
	customer_name: 'Customer',
	project_manager: 'Project manager',
	has_daily_log: 'First daily log'
};

/** Maps a raw completeness field key to a human-readable label. */
export function gapLabel(key: string): string {
	return GAP_LABELS[key] ?? key.replace(/_/g, ' ');
}

/** A safe, empty portfolio used when the endpoint is unavailable. */
export const EMPTY_PORTFOLIO: Portfolio = {
	contract_value_total: 0,
	tonnage_awarded_total: 0,
	tonnage_target_total: 0,
	tonnage_placed_total: 0,
	counts: { active_projects: 0, total_projects: 0, logging_today: 0, tons_today: 0 },
	setup_gaps: [],
	per_job: []
};

/** Compact currency for portfolio headlines: $1.2M / $940K / $3,200 / —. */
export function formatCurrencyCompact(value: number | null | undefined): string {
	if (value == null || value === 0) return '$0';
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
	if (abs >= 10_000) return `$${Math.round(value / 1000)}K`;
	return `$${Math.round(value).toLocaleString()}`;
}

/** Whole tons with thousands separators: "1,240". */
export function formatTonsWhole(value: number | null | undefined): string {
	if (value == null) return '0';
	return Math.round(value).toLocaleString();
}
