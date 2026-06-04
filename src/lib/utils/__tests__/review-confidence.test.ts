import { describe, it, expect } from 'vitest';
import {
	PROJECT_FIELDS,
	LOCATION_FIELDS,
	CUSTOMER_FIELDS,
	ALL_REVIEW_FIELDS,
	countLowConfidence,
	countNeedsAttention,
	displayedConfidence,
	fieldState,
	isEmptyValue,
	type FieldConfidenceMap
} from '../review-confidence.js';

describe('review field lists', () => {
	it('includes route_designation as an editable Location field', () => {
		expect(LOCATION_FIELDS.map((f) => f.key)).toContain('route_designation');
	});

	it('ALL_REVIEW_FIELDS is the union of the three sections (no dupes)', () => {
		const keys = ALL_REVIEW_FIELDS.map((f) => f.key);
		const expectedLen = PROJECT_FIELDS.length + LOCATION_FIELDS.length + CUSTOMER_FIELDS.length;
		expect(keys.length).toBe(expectedLen);
		expect(new Set(keys).size).toBe(expectedLen);
	});
});

describe('displayedConfidence', () => {
	it('defaults to medium for fields the server did not score', () => {
		expect(displayedConfidence('name', {}, new Set())).toBe('medium');
	});

	it('reads the server confidence when present', () => {
		const conf: FieldConfidenceMap = { route_designation: 'low' };
		expect(displayedConfidence('route_designation', conf, new Set())).toBe('low');
	});

	it('treats a corrected field as high regardless of server confidence', () => {
		const conf: FieldConfidenceMap = { route_designation: 'low' };
		expect(displayedConfidence('route_designation', conf, new Set(['route_designation']))).toBe(
			'high'
		);
	});
});

describe('countLowConfidence reconciliation', () => {
	it('counts ONLY rendered fields, ignoring scored fields that are not shown', () => {
		// owner_address is scored low by the server but is NOT a rendered review
		// field — it must not inflate the banner count (the original bug).
		const conf: FieldConfidenceMap = {
			owner_address: 'low',
			customer_address: 'low',
			total_length_ft: 'low'
		};
		expect(countLowConfidence(conf, new Set())).toBe(0);
	});

	it('counts each rendered low-confidence field exactly once', () => {
		const conf: FieldConfidenceMap = {
			route_designation: 'low',
			begin_terminus: 'low',
			county: 'medium',
			name: 'high'
		};
		// route_designation + begin_terminus are rendered + low => 2
		expect(countLowConfidence(conf, new Set())).toBe(2);
	});

	it('matches the number of fields that would render a low badge', () => {
		const conf: FieldConfidenceMap = {
			route_designation: 'low',
			begin_terminus: 'low',
			end_terminus: 'low'
		};
		const marked = ALL_REVIEW_FIELDS.filter(
			(f) => displayedConfidence(f.key, conf, new Set()) === 'low'
		).length;
		expect(countLowConfidence(conf, new Set())).toBe(marked);
	});

	it('drops a field from the count once the user corrects it', () => {
		const conf: FieldConfidenceMap = { route_designation: 'low', begin_terminus: 'low' };
		expect(countLowConfidence(conf, new Set(['route_designation']))).toBe(1);
	});
});

describe('isEmptyValue', () => {
	it('treats null/undefined/blank as empty', () => {
		expect(isEmptyValue(null)).toBe(true);
		expect(isEmptyValue(undefined)).toBe(true);
		expect(isEmptyValue('')).toBe(true);
		expect(isEmptyValue('   ')).toBe(true);
	});

	it('treats a real value as non-empty', () => {
		expect(isEmptyValue('SR 11')).toBe(false);
		expect(isEmptyValue(0)).toBe(false);
	});
});

describe('fieldState — filled vs empty low-confidence fields', () => {
	const conf: FieldConfidenceMap = { route_designation: 'low' };

	it('low + empty => needs-input (red)', () => {
		expect(fieldState('route_designation', null, conf, new Set(), new Set())).toBe('needs-input');
		expect(fieldState('route_designation', '', conf, new Set(), new Set())).toBe('needs-input');
	});

	it('low + filled => verify (amber), NOT needs-input', () => {
		expect(fieldState('route_designation', 'SR 11', conf, new Set(), new Set())).toBe('verify');
	});

	it('medium/high => ok regardless of value', () => {
		expect(fieldState('county', null, { county: 'medium' }, new Set(), new Set())).toBe('ok');
		expect(fieldState('name', 'X', { name: 'high' }, new Set(), new Set())).toBe('ok');
	});

	it('a confirmed filled field becomes ok WITHOUT changing its value', () => {
		// value is unchanged; only the confirmed set flips it to ok.
		expect(
			fieldState('route_designation', 'SR 11', conf, new Set(), new Set(['route_designation']))
		).toBe('ok');
	});

	it('a corrected field becomes ok', () => {
		expect(
			fieldState('route_designation', 'SR 99', conf, new Set(['route_designation']), new Set())
		).toBe('ok');
	});
});

describe('countNeedsAttention', () => {
	it('counts empty-low (needs-input) AND filled-low (verify) as actionable', () => {
		const conf: FieldConfidenceMap = { route_designation: 'low', begin_terminus: 'low' };
		const values = { route_designation: 'SR 11', begin_terminus: null };
		// route_designation = verify, begin_terminus = needs-input => 2
		expect(countNeedsAttention(conf, values, new Set(), new Set())).toBe(2);
	});

	it('drops to zero once filled-low fields are confirmed (value unchanged)', () => {
		const conf: FieldConfidenceMap = { route_designation: 'low', begin_terminus: 'low' };
		const values = { route_designation: 'SR 11', begin_terminus: 'FLORIDA STATE LINE' };
		expect(countNeedsAttention(conf, values, new Set(), new Set())).toBe(2);
		const confirmed = new Set(['route_designation', 'begin_terminus']);
		expect(countNeedsAttention(conf, values, new Set(), confirmed)).toBe(0);
	});

	it('ignores scored-but-unrendered fields (does not inflate the count)', () => {
		const conf: FieldConfidenceMap = { owner_address: 'low' };
		expect(countNeedsAttention(conf, { owner_address: null }, new Set(), new Set())).toBe(0);
	});

	it('a filled medium/high field never needs attention', () => {
		const conf: FieldConfidenceMap = { county: 'medium', name: 'high' };
		expect(countNeedsAttention(conf, { county: 'Hall', name: 'Proj' }, new Set(), new Set())).toBe(
			0
		);
	});
});
