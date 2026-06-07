/**
 * Phase 0 seam tests — the standardized extraction contract additions.
 *
 * Fully offline (no AI binding, no network). Validates the two behavioural
 * additions Phase 0 introduces, which downstream phases build against:
 *  1. Per-field CITATIONS flow from the model's parallel `citations` map through
 *     `wrapFlatContract` into each `ParsedField`'s source_page/source_file/
 *     evidence_type — and are absent (undefined) when the model omits them
 *     (backward compatible).
 *  2. The `paving-contract-v1` profile assembles top-level `field_meta` from
 *     those citation envelopes, and its flag-only `validate` runs the existing
 *     validateContract + crossCheckWithRegex without dropping values.
 */

import { describe, it, expect } from 'vitest';
import { extractFlatContract, wrapFlatContract } from '../structure-contract.js';
import type { FlatStructuredContract } from '../structured-contract.js';
import {
	pavingContractV1,
	fieldMetaFromParsedField
} from '../../extraction/profiles/paving-contract-v1.js';
import { parseGdotDocumentsV2 } from '../parse-gdot.js';
import { field } from '../confidence.js';

function flatWithCitations(): FlatStructuredContract {
	return {
		route: { designation: 'SR 7 ALT', kind: 'SR', number: '7' },
		county: { name: 'Lowndes', fips: '185' },
		midpoint: null,
		gross_length_mi: 2.86,
		segments: [
			{
				name: 'NB/SB UNDIVIDED COMMON SECTION',
				kind: 'mainline',
				group: 'GDOT',
				treatment: 'resurfacing',
				length_mi: 2.86,
				begin_terminus: 'BEGIN PROJECT',
				end_terminus: 'END PROJECT',
				measure_axis: 'project_mile',
				events: []
			}
		],
		bid_items: [],
		production_mixes: [],
		warnings: [],
		citations: {
			'county.name': { source_page: 3, source_file: 'contract.pdf', evidence_type: 'text' },
			'route.designation': { source_page: 3, evidence_type: 'text' },
			'gross_length_mi': { source_page: 5, evidence_type: 'text' },
			'segments[0].length_mi': { source_page: 7, evidence_type: 'vision' }
		}
	};
}

describe('citations flow from the model citations map into ParsedField', () => {
	it('stamps source_page/source_file/evidence_type per cited field', () => {
		const c = wrapFlatContract(flatWithCitations());
		expect(c.county.name.source_page).toBe(3);
		expect(c.county.name.source_file).toBe('contract.pdf');
		expect(c.county.name.evidence_type).toBe('text');
		expect(c.route!.designation.source_page).toBe(3);
		expect(c.route!.designation.evidence_type).toBe('text');
		expect(c.gross_length_mi.source_page).toBe(5);
		expect(c.segments[0].length_mi.source_page).toBe(7);
		expect(c.segments[0].length_mi.evidence_type).toBe('vision');
	});

	it('leaves uncited fields without a citation (undefined), backward compatible', () => {
		const c = wrapFlatContract(flatWithCitations());
		// county.fips was not cited.
		expect(c.county.fips.source_page).toBeUndefined();
		expect(c.county.fips.source_file).toBeUndefined();
		expect(c.county.fips.evidence_type).toBeUndefined();
		// segment name was not cited.
		expect(c.segments[0].name.source_page).toBeUndefined();
	});

	it('produces identical fields (no citation keys) when the model omits the citations map', () => {
		const flat = flatWithCitations();
		delete flat.citations;
		const c = wrapFlatContract(flat);
		expect(c.county.name.value).toBe('Lowndes');
		expect(c.county.name.source_page).toBeUndefined();
		expect(c.gross_length_mi.source_page).toBeUndefined();
	});

	it('drops a citation with no usable provenance and ignores an out-of-range evidence_type', () => {
		const flat = flatWithCitations();
		flat.citations = {
			'county.name': { source_page: null, source_file: null, evidence_type: null },
			'gross_length_mi': { source_page: 9, evidence_type: 'not-a-real-type' }
		};
		const c = wrapFlatContract(flat);
		expect(c.county.name.source_page).toBeUndefined();
		expect(c.gross_length_mi.source_page).toBe(9);
		// Unmappable evidence type is dropped (no evidence_type key is stamped).
		expect(c.gross_length_mi.evidence_type).toBeUndefined();
	});

	it('still parses a real Bedrock-shaped JSON string with citations through extractFlatContract', () => {
		const raw = JSON.stringify(flatWithCitations());
		const flat = extractFlatContract(raw);
		expect(flat).not.toBeNull();
		const c = wrapFlatContract(flat!);
		expect(c.county.name.source_page).toBe(3);
	});
});

describe('paving-contract-v1 profile field_meta + flag-only validate', () => {
	it('exposes the stable profile id and the structured-contract schema', () => {
		expect(pavingContractV1.id).toBe('paving-contract-v1');
		expect(pavingContractV1.schema).toBeTypeOf('object');
	});

	it('builds field_meta from the citation envelopes during validate', () => {
		const c = wrapFlatContract(flatWithCitations());
		const v2 = parseGdotDocumentsV2(['']);
		const out = pavingContractV1.validate(c, { job_id: 'j1', pages: [], validatorInput: v2 });
		expect(out.field_meta).toBeDefined();
		const meta = out.field_meta!;
		expect(meta['county.name'].confidence).toBe('medium');
		expect(meta['county.name'].source_pages).toEqual([3]);
		expect(meta['county.name'].source_file).toBe('contract.pdf');
		expect(meta['county.name'].evidence_type).toBe('text');
		expect(meta['gross_length_mi'].source_pages).toEqual([5]);
		expect(meta['segments[0].length_mi'].source_pages).toEqual([7]);
		// An uncited field still gets meta, with no source pages.
		expect(meta['county.fips'].source_pages).toEqual([]);
	});

	it('validate is flag-only: it never drops segments and returns the cross-checked result', () => {
		const c = wrapFlatContract(flatWithCitations());
		const v2 = parseGdotDocumentsV2(['']);
		const out = pavingContractV1.validate(c, { job_id: 'j1', pages: [], validatorInput: v2 });
		expect(out.result.segments).toHaveLength(1);
		expect(Array.isArray(out.warnings)).toBe(true);
		expect(Array.isArray(out.conflicts)).toBe(true);
	});

	it('fieldMetaFromParsedField maps a single ParsedField to FieldMeta', () => {
		const f = field.high('X', 'src', undefined, {
			source_page: 11,
			source_file: 'f.pdf',
			evidence_type: 'ocr'
		});
		const meta = fieldMetaFromParsedField(f);
		expect(meta).toEqual({
			confidence: 'high',
			source_pages: [11],
			source_file: 'f.pdf',
			evidence_type: 'ocr'
		});
	});
});

// --------------------------------------------------------------------------
// Phase 3: first-class segment-level pavement[] (real SR 7 ALT typical-section)
// --------------------------------------------------------------------------

/**
 * The real 25186 SR 7 ALT typical sections: "THIS TYPICAL SECTION APPLIES FROM
 * LOG 0.000 TO 2.850 ... RESURFACE FULL WIDTH WITH 165 LBS PER SQUARE YARD ...
 * 12.5 mm SUPERPAVE GP 2 ... MILL VARIABLE DEPTH (1.5 IN TYPICAL)". Modeled as
 * one pavement[] entry on the mainline + a second on the ramp (0.000–0.060),
 * each with a per-field citation to its Typical Section page.
 */
function flatWithPavement(): FlatStructuredContract {
	return {
		route: { designation: 'SR 7 ALT', kind: 'SR', number: '7' },
		county: { name: 'Lowndes', fips: '185' },
		midpoint: null,
		gross_length_mi: 2.86,
		segments: [
			{
				name: 'NB/SB UNDIVIDED COMMON SECTION',
				kind: 'mainline',
				group: 'GDOT',
				treatment: 'resurfacing',
				length_mi: 2.86,
				begin_terminus: 'BEGIN PROJECT',
				end_terminus: 'END PROJECT',
				measure_axis: 'project_mile',
				events: [],
				pavement: [
					{
						lift_thickness_in: 1.5,
						mill_depth_in: 1.5,
						spread_rate_lbs_sy: 165,
						mix: '12.5 mm SUPERPAVE GP 2',
						roadway_width_ft: { min: 48, max: 60 },
						applies_from_mi: 0.0,
						applies_to_mi: 2.85
					}
				]
			}
		],
		bid_items: [],
		production_mixes: [],
		warnings: [],
		citations: {
			'segments[0].pavement[0].spread_rate_lbs_sy': { source_page: 10, evidence_type: 'vision' },
			'segments[0].pavement[0].mill_depth_in': { source_page: 10, evidence_type: 'vision' },
			'segments[0].pavement[0].mix': { source_page: 10, evidence_type: 'text' }
		}
	};
}

describe('Phase 3 segment-level pavement[] wraps with citations', () => {
	it('wraps the real SR 7 ALT typical-section values into ParsedField envelopes', () => {
		const c = wrapFlatContract(flatWithPavement());
		const pv = c.segments[0].pavement[0];
		expect(pv.spread_rate_lbs_sy.value).toBe(165);
		expect(pv.mill_depth_in.value).toBe(1.5);
		expect(pv.lift_thickness_in.value).toBe(1.5);
		expect(pv.mix.value).toBe('12.5 mm SUPERPAVE GP 2');
		expect(pv.roadway_width_ft.min.value).toBe(48);
		expect(pv.roadway_width_ft.max.value).toBe(60);
		expect(pv.applies_from_mi.value).toBe(0.0);
		expect(pv.applies_to_mi.value).toBe(2.85);
	});

	it('carries per-field citations onto pavement fields and into field_meta', () => {
		const c = wrapFlatContract(flatWithPavement());
		const pv = c.segments[0].pavement[0];
		expect(pv.spread_rate_lbs_sy.source_page).toBe(10);
		expect(pv.spread_rate_lbs_sy.evidence_type).toBe('vision');
		const v2 = parseGdotDocumentsV2(['']);
		const out = pavingContractV1.validate(c, { job_id: 'j1', pages: [], validatorInput: v2 });
		const meta = out.field_meta!;
		expect(meta['segments[0].pavement[0].spread_rate_lbs_sy'].source_pages).toEqual([10]);
		expect(meta['segments[0].pavement[0].spread_rate_lbs_sy'].evidence_type).toBe('vision');
		expect(meta['segments[0].pavement[0].mix'].evidence_type).toBe('text');
	});

	it('produces an empty pavement[] when the model omits it (backward compatible)', () => {
		const flat = flatWithPavement();
		delete flat.segments![0].pavement;
		const c = wrapFlatContract(flat);
		expect(c.segments[0].pavement).toEqual([]);
	});
});

// --------------------------------------------------------------------------
// Phase 5: AI-primary cross-check emits structured conflicts (validator flags)
// --------------------------------------------------------------------------

describe('Phase 5 AI-primary validate emits structured conflicts', () => {
	it('keeps the AI value and raises a needs_review conflict on disagreement', () => {
		const c = wrapFlatContract(flatWithCitations()); // county.name = "Lowndes"
		const v2 = parseGdotDocumentsV2(['']);
		// Patch the regex county to disagree.
		(v2 as unknown as Record<string, unknown>).county = field.high('Echols', 'deterministic');
		const out = pavingContractV1.validate(c, { job_id: 'j1', pages: [], validatorInput: v2 });
		// AI value retained.
		expect(out.result.county.name.value).toBe('Lowndes');
		// Structured conflict raised.
		const conflict = out.conflicts.find((cf) => cf.field_path === 'county.name');
		expect(conflict).toBeDefined();
		expect(conflict!.ai_value).toBe('Lowndes');
		expect(conflict!.validator_value).toBe('Echols');
		expect(conflict!.resolution).toBe('needs_review');
	});
});
