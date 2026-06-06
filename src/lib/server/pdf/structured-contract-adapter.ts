/**
 * Adapter: StructuredContract -> the existing ParsedGdotJobV2 scalar fields.
 *
 * The LLM-primary pipeline produces a multi-segment {@link StructuredContract},
 * but the review UI, `toV1()`, `buildImportRoutePreview`, and
 * `/api/job-sites/from-import` all still consume the legacy flat
 * {@link ParsedGdotJobV2} shape. This adapter folds the structured contract back
 * into that flat shape so NOTHING downstream has to change yet (multi-segment
 * persistence is a separate, out-of-scope follow-up).
 *
 * Merge policy mirrors the existing AI-supplement rule: the structurer is a
 * medium-confidence source, so it only FILLS fields the deterministic regex
 * parse left null or low-confidence — it never overrides a medium/high
 * deterministic value. Bid items / production mixes are only adopted when the
 * deterministic parse found none. Pure (no I/O) so it is unit-testable without
 * the AI binding.
 */

import { field, mergeField, type ParsedField } from './confidence.js';
import type { ParsedGdotJobV2, ParsedBidItemV2, ParsedProductionMixV2 } from './parse-gdot.js';
import type { StructuredContract, ContractSegment } from './structured-contract.js';

const SRC = 'llm-structurer';

/** Fill a V2 string field from a structured ParsedField, low/null only. */
function fillString(
	v2: ParsedGdotJobV2,
	key: keyof ParsedGdotJobV2,
	incoming: ParsedField<string> | null | undefined
): void {
	const value = incoming?.value;
	if (value == null || value === '') return;
	const current = v2[key] as ParsedField<string>;
	const candidate =
		incoming.confidence === 'high' ? field.high(value, SRC) : field.medium(value, SRC);
	v2[key] = mergeField(current, candidate) as never;
}

/** Fill a V2 number field from a structured ParsedField, low/null only. */
function fillNumber(
	v2: ParsedGdotJobV2,
	key: keyof ParsedGdotJobV2,
	incoming: ParsedField<number> | null | undefined
): void {
	const value = incoming?.value;
	if (value == null || !Number.isFinite(value)) return;
	const current = v2[key] as ParsedField<number>;
	const candidate =
		incoming.confidence === 'high' ? field.high(value, SRC) : field.medium(value, SRC);
	v2[key] = mergeField(current, candidate) as never;
}

/**
 * Pick the segment that best represents the whole project for the flat preview:
 * the first segment with both termini, else the longest, else the first.
 */
function representativeSegment(contract: StructuredContract): ContractSegment | null {
	const segments = contract.segments ?? [];
	if (segments.length === 0) return null;
	const withTermini = segments.find(
		(s) => s.begin_terminus?.value && s.end_terminus?.value
	);
	if (withTermini) return withTermini;
	let best = segments[0];
	let bestLen = best.length_mi?.value ?? -Infinity;
	for (const s of segments) {
		const len = s.length_mi?.value ?? -Infinity;
		if (len > bestLen) {
			best = s;
			bestLen = len;
		}
	}
	return best;
}

/**
 * Merge a validated/cross-checked StructuredContract into the deterministic V2
 * result, filling only null/low scalar fields. Mutates and returns `v2`.
 */
export function mergeStructuredContractIntoV2(
	v2: ParsedGdotJobV2,
	contract: StructuredContract
): ParsedGdotJobV2 {
	// Route + county + gross length.
	fillString(v2, 'route_designation', contract.route?.designation ?? null);
	fillString(v2, 'county', contract.county?.name ?? null);
	fillString(v2, 'county_number', contract.county?.fips ?? null);
	fillNumber(v2, 'gross_length_mi', contract.gross_length_mi);

	// Mid-point (zone label is diagnostics-only; copied verbatim, never used for CRS).
	if (contract.midpoint) {
		fillNumber(v2, 'midpoint_easting', contract.midpoint.easting);
		fillNumber(v2, 'midpoint_northing', contract.midpoint.northing);
		fillString(v2, 'midpoint_zone_label', contract.midpoint.zone_label);
	}

	// Termini + location from the representative segment.
	const rep = representativeSegment(contract);
	if (rep) {
		fillString(v2, 'begin_terminus', rep.begin_terminus);
		fillString(v2, 'end_terminus', rep.end_terminus);
		if ((v2.location_description.value == null || v2.location_description.confidence === 'low') && rep.name?.value) {
			v2.location_description = mergeField(v2.location_description, field.medium(rep.name.value, SRC));
		}
	}

	// Bid items / production mixes: adopt only when the deterministic parse found none.
	if (v2.bid_items.length === 0 && contract.bid_items.length > 0) {
		v2.bid_items = contract.bid_items.map(
			(it): ParsedBidItemV2 => ({ ...it, confidence: 'medium' })
		);
	}
	if (v2.production_mixes.length === 0 && contract.production_mixes.length > 0) {
		v2.production_mixes = contract.production_mixes.map(
			(mix): ParsedProductionMixV2 => ({ ...mix, confidence: 'medium' })
		);
	}

	// Carry structured warnings through.
	for (const w of contract.warnings) {
		if (w && !v2.warnings.includes(w)) v2.warnings.push(w);
	}

	return v2;
}
