/**
 * Unit tests for src/lib/server/completeness.ts
 *
 * Score breakdown:
 *   10 required fields × 8 pts = 80 pts max
 *   10 optional checks × 2 pts = 20 pts max
 *   Total = 100 pts max
 *
 * Status thresholds: >=90 complete | >=60 needs-attention | <60 incomplete
 */
import { describe, it, expect } from 'vitest';
import {
	scoreJobSite,
	REQUIRED_FIELDS,
	OPTIONAL_FIELDS,
	type JobSiteCompletenessRow
} from '../completeness.js';

// ── Test fixtures ────────────────────────────────────────────────────────────

/** A row with every required + optional field populated. */
function fullRow(): JobSiteCompletenessRow {
	return {
		// identity
		id: 'site-1',
		job_number: 'JOB-001',
		// required fields
		name: 'Main Street Repave',
		status: 'active',
		road_type: 'arterial',
		num_lanes: 2,
		lane_width_ft: 12,
		total_length_ft: 5280,
		scope_of_work: 'Full depth reclamation',
		mix_type: 'SP-12.5',
		target_thickness_in: 2,
		target_spread_rate: 110,
		// optional fields
		tack_type: 'SS-1h',
		target_tack_rate: 0.1,
		num_lifts: 2,
		total_tonnage: 500,
		latitude: 33.749,
		longitude: -84.388,
		est_start_date: '2026-06-01',
		completion_date: '2026-07-01',
		customer_name: 'GDOT',
		project_manager: 'Alice Smith',
		// aggregates
		daily_log_count: 3,
		bid_item_count: 5,
		mix_count: 2,
		document_count: 4,
		milestone_count: 3
	};
}

/** A row with every field null / zero — the absolute minimum. */
function emptyRow(): JobSiteCompletenessRow {
	return {
		id: 'site-empty',
		job_number: null,
		name: null,
		status: null,
		road_type: null,
		num_lanes: null,
		lane_width_ft: null,
		total_length_ft: null,
		scope_of_work: null,
		mix_type: null,
		target_thickness_in: null,
		target_spread_rate: null,
		tack_type: null,
		target_tack_rate: null,
		num_lifts: null,
		total_tonnage: null,
		latitude: null,
		longitude: null,
		est_start_date: null,
		completion_date: null,
		customer_name: null,
		project_manager: null,
		daily_log_count: 0,
		bid_item_count: 0,
		mix_count: 0,
		document_count: 0,
		milestone_count: 0
	};
}

// ── Score math helpers ───────────────────────────────────────────────────────

/** Expected score given counts. */
function expectedScore(filledRequired: number, satisfiedOptional: number): number {
	const req = (filledRequired / 10) * 80;
	const opt = (satisfiedOptional / 10) * 20;
	return Math.round(req + opt);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('scoreJobSite — empty job site (0%)', () => {
	it('returns score 0 for a completely empty row', () => {
		const result = scoreJobSite(emptyRow());
		expect(result.score).toBe(0);
	});

	it('returns status "incomplete"', () => {
		expect(scoreJobSite(emptyRow()).status).toBe('incomplete');
	});

	it('lists all required fields as missing', () => {
		const { missing } = scoreJobSite(emptyRow()).required;
		expect(missing.sort()).toEqual([...REQUIRED_FIELDS].sort());
	});

	it('lists all optional fields as missing', () => {
		const { missing } = scoreJobSite(emptyRow()).optional;
		expect(missing.sort()).toEqual([...OPTIONAL_FIELDS].sort());
	});

	it('filled required count is 0', () => {
		expect(scoreJobSite(emptyRow()).required.filled).toBe(0);
	});

	it('satisfied optional count is 0', () => {
		expect(scoreJobSite(emptyRow()).optional.satisfied).toBe(0);
	});

	it('contract summary has_job_number is false', () => {
		expect(scoreJobSite(emptyRow()).contract_summary.has_job_number).toBe(false);
	});
});

describe('scoreJobSite — fully complete (100%)', () => {
	it('returns score 100 for a fully filled row', () => {
		expect(scoreJobSite(fullRow()).score).toBe(100);
	});

	it('returns status "complete"', () => {
		expect(scoreJobSite(fullRow()).status).toBe('complete');
	});

	it('no missing required fields', () => {
		expect(scoreJobSite(fullRow()).required.missing).toHaveLength(0);
	});

	it('no missing optional fields', () => {
		expect(scoreJobSite(fullRow()).optional.missing).toHaveLength(0);
	});

	it('required totals are correct', () => {
		const { filled, total } = scoreJobSite(fullRow()).required;
		expect(filled).toBe(10);
		expect(total).toBe(10);
	});

	it('optional totals are correct', () => {
		const { satisfied, total } = scoreJobSite(fullRow()).optional;
		expect(satisfied).toBe(10);
		expect(total).toBe(10);
	});

	it('contract_summary carries counts from the row', () => {
		const cs = scoreJobSite(fullRow()).contract_summary;
		expect(cs.has_job_number).toBe(true);
		expect(cs.bid_item_count).toBe(5);
		expect(cs.mix_count).toBe(2);
		expect(cs.document_count).toBe(4);
		expect(cs.milestone_count).toBe(3);
	});
});

describe('scoreJobSite — partial completion', () => {
	it('5 required filled (0 optional) => score 40, status incomplete', () => {
		const row = emptyRow();
		row.name = 'Test Site';
		row.status = 'active';
		row.road_type = 'local';
		row.num_lanes = 1;
		row.lane_width_ft = 10;
		const result = scoreJobSite(row);
		expect(result.score).toBe(expectedScore(5, 0));
		expect(result.score).toBe(40);
		expect(result.status).toBe('incomplete');
	});

	it('8 required filled (0 optional) => score 64, status needs-attention', () => {
		const row = emptyRow();
		row.name = 'Test';
		row.status = 'active';
		row.road_type = 'arterial';
		row.num_lanes = 2;
		row.lane_width_ft = 12;
		row.total_length_ft = 1000;
		row.scope_of_work = 'Mill and fill';
		row.mix_type = 'SP-9.5';
		const result = scoreJobSite(row);
		expect(result.score).toBe(expectedScore(8, 0));
		expect(result.score).toBe(64);
		expect(result.status).toBe('needs-attention');
	});

	it('10 required filled, 5 optional => score 90, status complete', () => {
		const row = fullRow();
		// Clear 5 optional fields
		row.tack_type = null;
		row.target_tack_rate = null;
		row.num_lifts = null;
		row.total_tonnage = null;
		row.latitude = null; // removes coordinates
		const result = scoreJobSite(row);
		expect(result.score).toBe(expectedScore(10, 5));
		expect(result.score).toBe(90);
		expect(result.status).toBe('complete');
	});

	it('missing fields appear in missing arrays', () => {
		const row = fullRow();
		row.mix_type = null;
		row.target_spread_rate = null;
		row.customer_name = null;
		const result = scoreJobSite(row);
		expect(result.required.missing).toContain('mix_type');
		expect(result.required.missing).toContain('target_spread_rate');
		expect(result.optional.missing).toContain('customer_name');
	});
});

describe('scoreJobSite — weighting of each required field (+8 pts each)', () => {
	const requiredFieldValues: Partial<JobSiteCompletenessRow> = {
		name: 'Site',
		status: 'active',
		road_type: 'local',
		num_lanes: 1,
		lane_width_ft: 12,
		total_length_ft: 500,
		scope_of_work: 'Crack seal',
		mix_type: 'SP-12.5',
		target_thickness_in: 1.5,
		target_spread_rate: 90
	};

	REQUIRED_FIELDS.forEach((field) => {
		it(`filling only "${field}" adds 8 points to score 0`, () => {
			const row = emptyRow();
			(row as unknown as Record<string, unknown>)[field] = requiredFieldValues[field];
			const result = scoreJobSite(row);
			expect(result.score).toBe(8);
			expect(result.required.filled).toBe(1);
		});
	});
});

describe('scoreJobSite — weighting of each optional field (+2 pts each)', () => {
	// Start with all required filled (80 pts base), add one optional at a time.
	const optionalFieldValues: Partial<JobSiteCompletenessRow> = {
		tack_type: 'SS-1h',
		target_tack_rate: 0.1,
		num_lifts: 2,
		total_tonnage: 400,
		latitude: 33.7,        // coordinates requires both lat AND lon
		est_start_date: '2026-06-01',
		completion_date: '2026-07-01',
		customer_name: 'GDOT',
		project_manager: 'Bob'
		// has_daily_log is derived from daily_log_count, not a real column
	};

	// Special case: coordinates needs lat+lon together.
	it('filling "coordinates" (lat+lon) adds 2 points', () => {
		const row = emptyRow();
		// fill all required
		Object.assign(row, {
			name: 'Site', status: 'active', road_type: 'local', num_lanes: 1,
			lane_width_ft: 12, total_length_ft: 500, scope_of_work: 'Repave',
			mix_type: 'SP-9.5', target_thickness_in: 2, target_spread_rate: 100
		});
		row.latitude = 33.7;
		row.longitude = -84.4;
		const result = scoreJobSite(row);
		expect(result.score).toBe(82);
		expect(result.optional.satisfied).toBe(1);
	});

	// Special case: has_daily_log checks daily_log_count > 0.
	it('filling "has_daily_log" (daily_log_count>0) adds 2 points', () => {
		const row = emptyRow();
		Object.assign(row, {
			name: 'Site', status: 'active', road_type: 'local', num_lanes: 1,
			lane_width_ft: 12, total_length_ft: 500, scope_of_work: 'Repave',
			mix_type: 'SP-9.5', target_thickness_in: 2, target_spread_rate: 100
		});
		row.daily_log_count = 1;
		const result = scoreJobSite(row);
		expect(result.score).toBe(82);
		expect(result.optional.satisfied).toBe(1);
	});

	const nonCoordOptional = OPTIONAL_FIELDS.filter(
		(f) => f !== 'coordinates' && f !== 'has_daily_log'
	);

	nonCoordOptional.forEach((field) => {
		it(`filling only required + "${field}" => score 82`, () => {
			const row = emptyRow();
			// fill all required
			Object.assign(row, {
				name: 'Site', status: 'active', road_type: 'local', num_lanes: 1,
				lane_width_ft: 12, total_length_ft: 500, scope_of_work: 'Repave',
				mix_type: 'SP-9.5', target_thickness_in: 2, target_spread_rate: 100
			});
			(row as unknown as Record<string, unknown>)[field] = optionalFieldValues[field];
			const result = scoreJobSite(row);
			expect(result.score).toBe(82);
			expect(result.optional.satisfied).toBe(1);
		});
	});
});

describe('scoreJobSite — edge cases: null / empty fields', () => {
	it('whitespace-only name is treated as missing', () => {
		const row = emptyRow();
		row.name = '   ';
		const result = scoreJobSite(row);
		expect(result.required.missing).toContain('name');
		expect(result.score).toBe(0);
	});

	it('whitespace-only status is treated as missing', () => {
		const row = emptyRow();
		row.status = '\t';
		const result = scoreJobSite(row);
		expect(result.required.missing).toContain('status');
	});

	it('whitespace-only mix_type is treated as missing', () => {
		const row = emptyRow();
		row.mix_type = '  ';
		const result = scoreJobSite(row);
		expect(result.required.missing).toContain('mix_type');
	});

	it('num_lanes = 0 is treated as missing', () => {
		const row = emptyRow();
		row.num_lanes = 0;
		const result = scoreJobSite(row);
		expect(result.required.missing).toContain('num_lanes');
	});

	it('negative num_lanes is treated as missing', () => {
		const row = emptyRow();
		row.num_lanes = -1;
		const result = scoreJobSite(row);
		expect(result.required.missing).toContain('num_lanes');
	});

	it('lane_width_ft = 0 is treated as missing', () => {
		const row = emptyRow();
		row.lane_width_ft = 0;
		expect(scoreJobSite(row).required.missing).toContain('lane_width_ft');
	});

	it('total_length_ft = 0 is treated as missing', () => {
		const row = emptyRow();
		row.total_length_ft = 0;
		expect(scoreJobSite(row).required.missing).toContain('total_length_ft');
	});

	it('target_thickness_in = 0 is treated as missing', () => {
		const row = emptyRow();
		row.target_thickness_in = 0;
		expect(scoreJobSite(row).required.missing).toContain('target_thickness_in');
	});

	it('target_spread_rate = 0 is treated as missing', () => {
		const row = emptyRow();
		row.target_spread_rate = 0;
		expect(scoreJobSite(row).required.missing).toContain('target_spread_rate');
	});

	it('only lat provided (no lon) does not satisfy coordinates', () => {
		const row = fullRow();
		row.longitude = null;
		const result = scoreJobSite(row);
		expect(result.optional.missing).toContain('coordinates');
	});

	it('only lon provided (no lat) does not satisfy coordinates', () => {
		const row = fullRow();
		row.latitude = null;
		const result = scoreJobSite(row);
		expect(result.optional.missing).toContain('coordinates');
	});

	it('whitespace-only customer_name is treated as missing optional', () => {
		const row = fullRow();
		row.customer_name = '  ';
		const result = scoreJobSite(row);
		expect(result.optional.missing).toContain('customer_name');
	});

	it('whitespace-only project_manager is treated as missing optional', () => {
		const row = fullRow();
		row.project_manager = '  ';
		const result = scoreJobSite(row);
		expect(result.optional.missing).toContain('project_manager');
	});

	it('daily_log_count = 0 does not satisfy has_daily_log', () => {
		const row = fullRow();
		row.daily_log_count = 0;
		const result = scoreJobSite(row);
		expect(result.optional.missing).toContain('has_daily_log');
	});

	it('target_tack_rate = 0 is treated as missing optional', () => {
		const row = fullRow();
		row.target_tack_rate = 0;
		const result = scoreJobSite(row);
		expect(result.optional.missing).toContain('target_tack_rate');
	});

	it('num_lifts = 0 is treated as missing optional', () => {
		const row = fullRow();
		row.num_lifts = 0;
		const result = scoreJobSite(row);
		expect(result.optional.missing).toContain('num_lifts');
	});

	it('total_tonnage = 0 is treated as missing optional', () => {
		const row = fullRow();
		row.total_tonnage = 0;
		const result = scoreJobSite(row);
		expect(result.optional.missing).toContain('total_tonnage');
	});
});

describe('scoreJobSite — status thresholds', () => {
	it('score < 60 => status "incomplete"', () => {
		// 7 required = 56 pts, 0 optional
		const row = emptyRow();
		row.name = 'Site'; row.status = 'active'; row.road_type = 'local';
		row.num_lanes = 1; row.lane_width_ft = 12; row.total_length_ft = 500;
		row.scope_of_work = 'Pave';
		const result = scoreJobSite(row);
		expect(result.score).toBe(56);
		expect(result.status).toBe('incomplete');
	});

	it('score == 60 => status "needs-attention"', () => {
		// 7 required (56) + 2 optional (4) = 60
		const row = emptyRow();
		row.name = 'Site'; row.status = 'active'; row.road_type = 'local';
		row.num_lanes = 1; row.lane_width_ft = 12; row.total_length_ft = 500;
		row.scope_of_work = 'Pave';
		row.customer_name = 'GDOT';
		row.project_manager = 'Alice';
		const result = scoreJobSite(row);
		expect(result.score).toBe(60);
		expect(result.status).toBe('needs-attention');
	});

	it('score == 90 => status "complete"', () => {
		// 10 required (80) + 5 optional (10) = 90
		const row = fullRow();
		row.tack_type = null;
		row.target_tack_rate = null;
		row.num_lifts = null;
		row.total_tonnage = null;
		row.latitude = null;
		const result = scoreJobSite(row);
		expect(result.score).toBe(90);
		expect(result.status).toBe('complete');
	});

	it('score > 90 (full) => status "complete"', () => {
		expect(scoreJobSite(fullRow()).status).toBe('complete');
	});
});

describe('scoreJobSite — returned shape invariants', () => {
	it('required.total is always 10', () => {
		expect(scoreJobSite(emptyRow()).required.total).toBe(10);
		expect(scoreJobSite(fullRow()).required.total).toBe(10);
	});

	it('optional.total is always 10', () => {
		expect(scoreJobSite(emptyRow()).optional.total).toBe(10);
		expect(scoreJobSite(fullRow()).optional.total).toBe(10);
	});

	it('score is always an integer (Math.round applied)', () => {
		// 3 required (24) + 1 optional (2) = 26 — no fractional
		const row = emptyRow();
		row.name = 'S'; row.status = 'active'; row.road_type = 'local';
		row.customer_name = 'GDOT';
		const result = scoreJobSite(row);
		expect(Number.isInteger(result.score)).toBe(true);
	});

	it('score is between 0 and 100 inclusive', () => {
		expect(scoreJobSite(emptyRow()).score).toBeGreaterThanOrEqual(0);
		expect(scoreJobSite(emptyRow()).score).toBeLessThanOrEqual(100);
		expect(scoreJobSite(fullRow()).score).toBeGreaterThanOrEqual(0);
		expect(scoreJobSite(fullRow()).score).toBeLessThanOrEqual(100);
	});

	it('required.filled + required.missing.length == required.total', () => {
		const r = scoreJobSite(emptyRow()).required;
		expect(r.filled + r.missing.length).toBe(r.total);
	});

	it('optional.satisfied + optional.missing.length == optional.total', () => {
		const r = scoreJobSite(emptyRow()).optional;
		expect(r.satisfied + r.missing.length).toBe(r.total);
	});
});
