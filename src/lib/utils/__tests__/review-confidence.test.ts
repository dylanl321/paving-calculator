import { describe, it, expect } from 'vitest';
import {
	PROJECT_FIELDS,
	LOCATION_FIELDS,
	CUSTOMER_FIELDS,
	ALL_REVIEW_FIELDS,
	countLowConfidence,
	displayedConfidence,
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
