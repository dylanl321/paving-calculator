/**
 * Typed field wrapper with confidence and provenance for PDF-extracted values.
 *
 * Every extracted scalar should be wrapped in ParsedField<T> so the UI can
 * render confidence indicators and the merge logic can make principled decisions
 * about which source to trust when multiple documents provide the same field.
 */

export type FieldConfidence = 'high' | 'medium' | 'low';

/**
 * What kind of evidence a field was extracted from. Lets the review UI label a
 * field's provenance ("from Page 7 (Typical Section), text" vs "vision") and
 * lets the extraction engine assemble top-level `field_meta` from per-field
 * citations rather than guessing source pages after the fact.
 */
export type EvidenceType = 'text' | 'vision' | 'ocr' | 'mixed';

/**
 * Optional per-field citation: WHERE the value came from in the source package.
 * Designed INTO the extraction schema (Phase 0) so source pages are carried, not
 * guessed. Every member is optional so existing callers that don't set citations
 * keep producing fields with `citation: undefined`.
 */
export interface FieldCitation {
	/** 1-based page number within the source document the value was read from. */
	source_page?: number | null;
	/** Source document filename / R2 key the value was read from. */
	source_file?: string | null;
	/** What kind of evidence the value was extracted from. */
	evidence_type?: EvidenceType | null;
}

/**
 * A single extracted field with provenance.
 *
 * - value:      the extracted value, or null if extraction failed.
 * - confidence: how confident the extractor is.
 *   high   — matched a labelled form field or a stable structural marker.
 *   medium — inferred from context (positional proximity, single candidate).
 *   low    — matched a heuristic with known false-positive risk, or inferred
 *             from an ambiguous source.
 * - source: human-readable description of the extraction method (useful for
 *   debugging and as context for the Phase 2 LLM fallback prompt).
 * - raw:    the original matched text before normalization.
 * - source_page/source_file/evidence_type: optional citation envelope describing
 *   WHERE the value came from. Populated by the LLM-primary structurer from the
 *   model's per-field citations; left undefined by deterministic/regex callers.
 *   The extraction engine assembles these into the top-level `field_meta`.
 */
export interface ParsedField<T> {
	value: T | null;
	confidence: FieldConfidence;
	source: string;
	raw?: string;
	source_page?: number | null;
	source_file?: string | null;
	evidence_type?: EvidenceType | null;
}

/**
 * Spread an optional citation onto a ParsedField. Returns an empty object when
 * no citation (or an all-empty citation) is supplied, so the produced field has
 * no citation keys at all — keeping the back-compat shape identical to before.
 */
function citationFields(citation?: FieldCitation | null): Partial<FieldCitation> {
	if (citation == null) return {};
	const out: Partial<FieldCitation> = {};
	if (citation.source_page != null) out.source_page = citation.source_page;
	if (citation.source_file != null) out.source_file = citation.source_file;
	if (citation.evidence_type != null) out.evidence_type = citation.evidence_type;
	return out;
}

/**
 * Convenience constructors for the three confidence levels. Each accepts an
 * OPTIONAL trailing `citation` so the structurer can stamp per-field source
 * pages; omitting it produces the exact same field shape as before.
 */
export const field = {
	high: <T>(value: T, source: string, raw?: string, citation?: FieldCitation | null): ParsedField<T> => ({
		value,
		confidence: 'high',
		source,
		raw,
		...citationFields(citation)
	}),
	medium: <T>(value: T, source: string, raw?: string, citation?: FieldCitation | null): ParsedField<T> => ({
		value,
		confidence: 'medium',
		source,
		raw,
		...citationFields(citation)
	}),
	low: <T>(value: T, source: string, raw?: string, citation?: FieldCitation | null): ParsedField<T> => ({
		value,
		confidence: 'low',
		source,
		raw,
		...citationFields(citation)
	}),
	missing: <T>(source: string, citation?: FieldCitation | null): ParsedField<T> => ({
		value: null,
		confidence: 'low',
		source,
		...citationFields(citation)
	})
};

/**
 * Merge two ParsedField values: higher confidence wins.
 * On equal confidence the existing value is retained (first-wins tiebreaker).
 */
export function mergeField<T>(
	existing: ParsedField<T>,
	incoming: ParsedField<T>
): ParsedField<T> {
	const rank: Record<FieldConfidence, number> = { high: 2, medium: 1, low: 0 };
	return rank[incoming.confidence] > rank[existing.confidence] ? incoming : existing;
}

/**
 * Return true when any of the listed fields on the object have low confidence
 * or a null value — used to decide whether a Phase 2 LLM pass is worthwhile.
 */
export function hasLowConfidenceFields<T extends Record<string, ParsedField<unknown>>>(
	obj: T,
	keys: (keyof T)[]
): boolean {
	return keys.some((k) => {
		const f = obj[k];
		return f == null || f.value === null || f.confidence === 'low';
	});
}
