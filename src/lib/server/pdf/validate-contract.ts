/**
 * Deterministic, side-effect-free validation for a {@link StructuredContract}.
 *
 * This is the validate stage of the LLM-primary PDF pipeline: after the model
 * structures the contract, these pure functions run structural sanity checks
 * and a regex-vs-LLM cross-check. The governing principle is FLAG, NEVER DROP:
 * every problem becomes a human-readable string pushed into `contract.warnings`
 * (deduped); no value is ever reordered, removed, or nulled out. The functions
 * never throw and guard all nulls.
 */

import type { StructuredContract } from './structured-contract.js';
import type { ParsedField } from './confidence.js';
import type { ParsedGdotJobV2 } from './parse-gdot.js';
import { valuesAgree, cleanNumber } from './ai-project-extractor.js';

// --------------------------------------------------------------------------
// Validation heuristics — NOT GDOT spec values, so inline consts are correct
// (per project convention spec rates/constants live in paverate.yaml; these are
// plausibility bands for catching garbage extractions, not engineering values).
// --------------------------------------------------------------------------

/** A real paving segment/project is longer than this many miles to be plausible. */
const MIN_PLAUSIBLE_LENGTH_MI = 0;

/**
 * Upper plausibility band for a single segment or gross project length. A single
 * contiguous resurfacing segment running past ~60 mi almost certainly indicates a
 * units/parsing error (e.g. feet read as miles).
 */
const MAX_PLAUSIBLE_LENGTH_MI = 60;

/**
 * Tolerance (in miles) for comparing a segment's declared `length_mi` against the
 * span implied by its project_start/project_end measures.
 */
const LENGTH_SPAN_TOLERANCE_MI = 0.1;

/**
 * Relative tolerance (fraction) for the same start/end-span vs `length_mi` check.
 * The effective tolerance is the larger of the absolute and relative bands.
 */
const LENGTH_SPAN_TOLERANCE_FRAC = 0.1;

// --------------------------------------------------------------------------
// Small null-safe helpers
// --------------------------------------------------------------------------

/** Read the numeric value of a ParsedField, or null when absent/non-finite. */
function numOf(f: ParsedField<number> | null | undefined): number | null {
	if (f == null) return null;
	return cleanNumber(f.value);
}

/** Push a warning string only if it is not already present (dedup). */
function pushWarning(contract: StructuredContract, message: string): void {
	if (!contract.warnings.includes(message)) contract.warnings.push(message);
}

/** Human-friendly segment label for warnings. */
function segmentLabel(name: string | null | undefined, index: number): string {
	const n = typeof name === 'string' ? name.trim() : '';
	return n ? `"${n}"` : `#${index + 1}`;
}

// --------------------------------------------------------------------------
// Structural validation
// --------------------------------------------------------------------------

/**
 * Run deterministic structural validation over a structured contract, appending
 * human-readable notes to `contract.warnings`. The input is shallow-copied (the
 * `warnings` array is cloned) so the caller's object is not mutated; the same
 * (copied) contract is returned for chaining.
 *
 * Checks performed:
 *  - measure monotonicity for project_mile segments (flag out-of-order, no reorder);
 *  - plausible length bands for each `segment.length_mi` and `gross_length_mi`;
 *  - segment length vs project_start→project_end span consistency;
 *  - axis/kind coherence (local_street should be axis 'none'; project_mile axis
 *    with no numeric measures anywhere is suspect).
 */
export function validateContract(contract: StructuredContract): StructuredContract {
	const out: StructuredContract = { ...contract, warnings: [...(contract.warnings ?? [])] };
	const segments = Array.isArray(out.segments) ? out.segments : [];

	// gross_length_mi band
	const gross = numOf(out.gross_length_mi);
	if (gross != null && (gross <= MIN_PLAUSIBLE_LENGTH_MI || gross >= MAX_PLAUSIBLE_LENGTH_MI)) {
		pushWarning(
			out,
			`Gross length ${gross} mi is outside the plausible band (${MIN_PLAUSIBLE_LENGTH_MI}–${MAX_PLAUSIBLE_LENGTH_MI} mi); verify units.`
		);
	}

	segments.forEach((segment, index) => {
		if (segment == null) return;
		const label = segmentLabel(segment.name?.value, index);
		const axis = segment.measure_axis?.value ?? null;
		const kind = segment.kind?.value ?? null;
		const events = Array.isArray(segment.events) ? segment.events : [];

		// Length band for the segment
		const lengthMi = numOf(segment.length_mi);
		if (lengthMi != null && (lengthMi <= MIN_PLAUSIBLE_LENGTH_MI || lengthMi >= MAX_PLAUSIBLE_LENGTH_MI)) {
			pushWarning(
				out,
				`Segment ${label} length ${lengthMi} mi is outside the plausible band (${MIN_PLAUSIBLE_LENGTH_MI}–${MAX_PLAUSIBLE_LENGTH_MI} mi); verify units.`
			);
		}

		// Axis / kind coherence
		if (kind === 'local_street') {
			if (axis === 'project_mile') {
				pushWarning(
					out,
					`Segment ${label} is a local_street but uses a project_mile axis; local streets have no project-mile axis.`
				);
			}
			const hasMeasure = events.some((e) => numOf(e?.measure) != null);
			if (hasMeasure) {
				pushWarning(
					out,
					`Segment ${label} is a local_street but has project-mile event measures; local streets should have no milepost events.`
				);
			}
		}

		// Project_mile axis monotonicity + must have at least one numeric measure
		if (axis === 'project_mile') {
			let lastMeasure: number | null = null;
			let anyMeasure = false;
			events.forEach((event, eventIndex) => {
				const measure = numOf(event?.measure);
				if (measure == null) return;
				anyMeasure = true;
				if (lastMeasure != null && measure <= lastMeasure) {
					pushWarning(
						out,
						`Segment ${label} event ${eventIndex + 1} measure ${measure} mi is not greater than the prior measure ${lastMeasure} mi; project-mile measures should strictly increase in event order.`
					);
				}
				lastMeasure = measure;
			});
			if (!anyMeasure) {
				pushWarning(
					out,
					`Segment ${label} declares a project_mile axis but has no numeric event measures; the axis is suspect.`
				);
			}

			// Segment length vs start/end span consistency
			if (lengthMi != null && lengthMi > 0) {
				const startMeasure = firstEventMeasure(events, 'project_start');
				const endMeasure = firstEventMeasure(events, 'project_end');
				if (startMeasure != null && endMeasure != null) {
					const span = Math.abs(endMeasure - startMeasure);
					const tolerance = Math.max(LENGTH_SPAN_TOLERANCE_MI, lengthMi * LENGTH_SPAN_TOLERANCE_FRAC);
					if (Math.abs(span - lengthMi) > tolerance) {
						pushWarning(
							out,
							`Segment ${label} declared length ${lengthMi} mi disagrees with its project_start→project_end span ${span.toFixed(3)} mi (tolerance ${tolerance.toFixed(3)} mi).`
						);
					}
				}
			}
		}
	});

	return out;
}

/** First numeric `measure` among events of the given type, or null. */
function firstEventMeasure(
	events: StructuredContract['segments'][number]['events'],
	type: string
): number | null {
	for (const event of events) {
		if (event?.type?.value === type) {
			const measure = numOf(event.measure);
			if (measure != null) return measure;
		}
	}
	return null;
}

// --------------------------------------------------------------------------
// Regex-vs-LLM cross-check
// --------------------------------------------------------------------------

/**
 * Cross-check the LLM-structured contract against the deterministic regex parse
 * on route-critical scalar fields present in both (county, route designation,
 * gross length). FLAG, NEVER DROP — values are only ever swapped to the
 * deterministic value on disagreement, and a warning is always emitted.
 *
 * Rules (per the pipeline plan):
 *  - both present and AGREE  -> upgrade the contract field to 'high' confidence
 *    (value kept; source annotated "deterministic+llm").
 *  - both present and DISAGREE on a route-critical field -> prefer the
 *    deterministic (regex) value, keep confidence at most 'medium', and warn.
 *  - only one present -> leave as-is.
 *
 * The input is shallow-copied (sub-objects that get updated are cloned) so the
 * caller's object is not mutated; the copy is returned.
 */
export function crossCheckWithRegex(
	contract: StructuredContract,
	regex: ParsedGdotJobV2
): StructuredContract {
	const out: StructuredContract = {
		...contract,
		warnings: [...(contract.warnings ?? [])],
		county: contract.county ? { ...contract.county } : contract.county,
		route: contract.route ? { ...contract.route } : contract.route
	};

	// county: contract.county.name vs regex.county
	if (out.county) {
		out.county.name = reconcileField(
			out,
			'county',
			out.county.name,
			regex.county?.value ?? null
		);
	}

	// route designation: contract.route?.designation vs regex.route_designation
	if (out.route) {
		out.route.designation = reconcileField(
			out,
			'route designation',
			out.route.designation,
			regex.route_designation?.value ?? null
		);
	}

	// gross_length_mi: contract.gross_length_mi vs regex.gross_length_mi
	out.gross_length_mi = reconcileField(
		out,
		'gross length (mi)',
		out.gross_length_mi,
		regex.gross_length_mi?.value ?? null
	);

	return out;
}

/**
 * Reconcile one route-critical scalar field between the LLM contract value and
 * the deterministic regex value. Returns the (possibly updated) ParsedField.
 */
function reconcileField<T extends string | number>(
	contract: StructuredContract,
	fieldLabel: string,
	llmField: ParsedField<T> | null | undefined,
	regexValue: T | null
): ParsedField<T> {
	const fallback: ParsedField<T> =
		llmField ?? { value: null, confidence: 'low', source: 'unset' };
	const llmValue = fallback.value;

	// Only one (or neither) present -> leave as-is.
	if (llmValue == null || regexValue == null) return fallback;

	if (valuesAgree(llmValue, regexValue)) {
		// Agreement upgrades confidence; value is retained.
		return {
			...fallback,
			confidence: 'high',
			source: annotateSource(fallback.source, 'deterministic+llm')
		};
	}

	// Disagreement on a route-critical field: prefer the deterministic value, cap
	// confidence at 'medium', and warn (value retained note kept human-readable).
	pushWarning(
		contract,
		`${fieldLabel} differs between deterministic parser (${String(regexValue)}) and LLM (${String(
			llmValue
		)}); deterministic value retained.`
	);
	return {
		value: regexValue,
		confidence: fallback.confidence === 'high' ? 'medium' : fallback.confidence,
		source: annotateSource(fallback.source, 'deterministic-preferred'),
		raw: fallback.raw
	};
}

/** Append a note to a ParsedField source string without duplicating it. */
function annotateSource(source: string | undefined, note: string): string {
	const base = typeof source === 'string' && source.trim() && source !== 'unset' ? source : '';
	if (!base) return note;
	if (base.includes(note)) return base;
	return `${base} (${note})`;
}
