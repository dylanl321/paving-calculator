/**
 * Shared confidence/field logic for the PDF-import review page.
 *
 * Extracted so the "fields that need review" count and the fields that are
 * actually rendered/marked stay in lockstep — counting any field that is not
 * also shown is what produced the "N fields need review" banner with nothing
 * marked. Both the page and its unit tests import these so the reconciliation
 * is verifiable at the logic level.
 */

export type FieldConfidence = 'high' | 'medium' | 'low';

export type FieldConfidenceMap = Record<string, FieldConfidence>;

export interface ReviewField {
	key: string;
	label: string;
	type: 'text' | 'number';
}

/** Project identity / contract fields rendered in the first review section. */
export const PROJECT_FIELDS: ReviewField[] = [
	{ key: 'name', label: 'Name', type: 'text' },
	{ key: 'job_number', label: 'Job #', type: 'text' },
	{ key: 'project_number', label: 'Project #', type: 'text' },
	{ key: 'contract_id', label: 'Contract ID', type: 'text' },
	{ key: 'county', label: 'County', type: 'text' },
	{ key: 'work_type', label: 'Work Type', type: 'text' },
	{ key: 'contract_type', label: 'Contract Type', type: 'text' },
	{ key: 'contract_amount', label: 'Contract Amount', type: 'number' },
	{ key: 'est_start_date', label: 'Start Date', type: 'text' },
	{ key: 'completion_date', label: 'Completion Date', type: 'text' }
];

/** Location/route fields. route_designation drives the map/route lookup. */
export const LOCATION_FIELDS: ReviewField[] = [
	{ key: 'route_designation', label: 'Route Designation', type: 'text' },
	{ key: 'begin_terminus', label: 'Begin Terminus', type: 'text' },
	{ key: 'end_terminus', label: 'End Terminus', type: 'text' },
	{ key: 'location_description', label: 'Location / Description', type: 'text' }
];

/** Customer / owner / management fields. */
export const CUSTOMER_FIELDS: ReviewField[] = [
	{ key: 'customer_name', label: 'Customer', type: 'text' },
	{ key: 'customer_contact', label: 'Contact', type: 'text' },
	{ key: 'customer_phone', label: 'Phone', type: 'text' },
	{ key: 'customer_email', label: 'Email', type: 'text' },
	{ key: 'owner_name', label: 'Owner', type: 'text' },
	{ key: 'project_manager', label: 'Project Manager', type: 'text' },
	{ key: 'asphalt_supplier', label: 'Asphalt Supplier', type: 'text' }
];

/** Every field rendered as an editable review input, in display order. */
export const ALL_REVIEW_FIELDS: ReviewField[] = [
	...PROJECT_FIELDS,
	...LOCATION_FIELDS,
	...CUSTOMER_FIELDS
];

/**
 * Displayed confidence for a field. A corrected field reads 'high' (the user
 * fixed it); otherwise the server-provided confidence, defaulting to 'medium'
 * for fields the server didn't score.
 */
export function displayedConfidence(
	key: string,
	fieldConf: FieldConfidenceMap,
	correctedFields: ReadonlySet<string>
): FieldConfidence {
	if (correctedFields.has(key)) return 'high';
	return fieldConf[key] ?? 'medium';
}

/**
 * Resolved review state of a field, decoupled from raw confidence:
 *  - 'needs-input' (red "!")   — low confidence AND no value: the user must type.
 *  - 'verify'      (amber)     — low confidence but ALREADY has a value: a glance
 *                                + one-click confirm is enough; never force an
 *                                edit to a correct value.
 *  - 'ok'          (green)     — confirmed, corrected, or medium/high confidence.
 */
export type FieldState = 'needs-input' | 'verify' | 'ok';

/** True when a parsed value is effectively empty (null/undefined/blank). */
export function isEmptyValue(value: unknown): boolean {
	if (value == null) return true;
	if (typeof value === 'string') return value.trim() === '';
	return false;
}

/**
 * Resolve a field's review state. `confirmedFields` are fields the user reviewed
 * and accepted WITHOUT changing the value; `correctedFields` are fields the user
 * edited. Either clears the warning.
 */
export function fieldState(
	key: string,
	value: unknown,
	fieldConf: FieldConfidenceMap,
	correctedFields: ReadonlySet<string>,
	confirmedFields: ReadonlySet<string> = new Set()
): FieldState {
	if (correctedFields.has(key) || confirmedFields.has(key)) return 'ok';
	const conf = fieldConf[key] ?? 'medium';
	if (conf !== 'low') return 'ok';
	// Low confidence: empty -> must input; filled -> just verify.
	return isEmptyValue(value) ? 'needs-input' : 'verify';
}

/**
 * Count of rendered review fields that still need the user's attention — either
 * low-confidence-and-empty ('needs-input') or low-confidence-and-filled-but-
 * unconfirmed ('verify'). Drops to zero once the user fills/confirms them, so
 * the banner never disagrees with what's marked. `values` maps field key to its
 * current parsed value so filled-vs-empty can be distinguished.
 */
export function countNeedsAttention(
	fieldConf: FieldConfidenceMap,
	values: Record<string, unknown>,
	correctedFields: ReadonlySet<string>,
	confirmedFields: ReadonlySet<string> = new Set(),
	fields: ReviewField[] = ALL_REVIEW_FIELDS
): number {
	return fields.filter((f) => {
		const state = fieldState(f.key, values[f.key], fieldConf, correctedFields, confirmedFields);
		return state !== 'ok';
	}).length;
}

/**
 * Count of rendered review fields that display a low-confidence "!" badge. This
 * is the single source of truth for the "N fields need manual review" banner so
 * it can never disagree with the marked, editable fields the user sees.
 *
 * @deprecated Prefer countNeedsAttention, which distinguishes empty (needs
 * input) from filled-but-low (verify) and counts both as actionable. Retained
 * for callers that only have confidence (not values) available.
 */
export function countLowConfidence(
	fieldConf: FieldConfidenceMap,
	correctedFields: ReadonlySet<string>,
	fields: ReviewField[] = ALL_REVIEW_FIELDS
): number {
	return fields.filter((f) => displayedConfidence(f.key, fieldConf, correctedFields) === 'low')
		.length;
}
