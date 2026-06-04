/**
 * Typed field wrapper with confidence and provenance for PDF-extracted values.
 *
 * Every extracted scalar should be wrapped in ParsedField<T> so the UI can
 * render confidence indicators and the merge logic can make principled decisions
 * about which source to trust when multiple documents provide the same field.
 */

export type FieldConfidence = 'high' | 'medium' | 'low';

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
 */
export interface ParsedField<T> {
	value: T | null;
	confidence: FieldConfidence;
	source: string;
	raw?: string;
}

/** Convenience constructors for the three confidence levels. */
export const field = {
	high: <T>(value: T, source: string, raw?: string): ParsedField<T> => ({
		value,
		confidence: 'high',
		source,
		raw
	}),
	medium: <T>(value: T, source: string, raw?: string): ParsedField<T> => ({
		value,
		confidence: 'medium',
		source,
		raw
	}),
	low: <T>(value: T, source: string, raw?: string): ParsedField<T> => ({
		value,
		confidence: 'low',
		source,
		raw
	}),
	missing: <T>(source: string): ParsedField<T> => ({
		value: null,
		confidence: 'low',
		source
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
