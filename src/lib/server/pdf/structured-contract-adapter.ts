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
 * Merge policy (plan Phase 5): AI-PRIMARY. The structurer is the authoritative
 * source — whenever the contract has a value it OVERWRITES the deterministic V2
 * field. The deterministic regex parse only FILLS fields the AI genuinely left
 * absent (null/empty). Bid items / production mixes are adopted from the AI only
 * when the deterministic parse found none (the regex tables stay authoritative
 * when present, as they are structurally reliable). Pure (no I/O) so it is
 * unit-testable without the AI binding.
 */

import { field, type ParsedField } from './confidence.js';
import type { ParsedGdotJobV2, ParsedBidItemV2, ParsedProductionMixV2 } from './parse-gdot.js';
import type { StructuredContract, ContractSegment } from './structured-contract.js';

const SRC = 'llm-structurer';

/**
 * Fill a V2 string field from a structured ParsedField. AI-PRIMARY: when the
 * contract has a value it OVERWRITES the V2 field (the AI is authoritative); the
 * regex value is only kept when the AI is absent.
 */
function fillString(
	v2: ParsedGdotJobV2,
	key: keyof ParsedGdotJobV2,
	incoming: ParsedField<string> | null | undefined
): void {
	const value = incoming?.value;
	if (incoming == null || value == null || value === '') return;
	v2[key] = (incoming.confidence === 'high'
		? field.high(value, SRC)
		: field.medium(value, SRC)) as never;
}

/**
 * Fill a V2 number field from a structured ParsedField. AI-PRIMARY: the contract
 * value OVERWRITES the V2 field when present; regex only kept when AI is absent.
 */
function fillNumber(
	v2: ParsedGdotJobV2,
	key: keyof ParsedGdotJobV2,
	incoming: ParsedField<number> | null | undefined
): void {
	const value = incoming?.value;
	if (incoming == null || value == null || !Number.isFinite(value)) return;
	v2[key] = (incoming.confidence === 'high'
		? field.high(value, SRC)
		: field.medium(value, SRC)) as never;
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
		// AI-primary: the segment name overwrites the location description when present.
		if (rep.name?.value) {
			v2.location_description = field.medium(rep.name.value, SRC);
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
