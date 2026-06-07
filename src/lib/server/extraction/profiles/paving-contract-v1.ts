/**
 * `paving-contract-v1` — the first extraction profile.
 *
 * Owns the paving-contract document family's specifics for the generic
 * {@link ExtractionProfile} seam:
 *  - `schema`      — the existing {@link STRUCTURED_CONTRACT_SCHEMA} (multi-segment).
 *  - `buildPrompt` — the existing structurer system prompt + user prompt builder.
 *  - `selectPages` — Phase 0: ALL pages (hybrid text+vision page selection lands
 *    in Phase 2; this profile owns that knob so the engine stays generic).
 *  - `validate`    — the existing deterministic, flag-only validator + the
 *    regex-vs-LLM cross-check (`validateContract` -> `crossCheckWithRegex`).
 *
 * Phase 0 deliberately reuses the existing structurer pipeline verbatim (no
 * behaviour change): the engine still calls `structureContract()` for the heavy
 * model work; this profile just declares the schema/prompt/page-selection/
 * validation so Phase 1 can move the orchestration body into the engine without
 * the paving specifics leaking into it.
 */

import {
	STRUCTURED_CONTRACT_SCHEMA,
	type StructuredContract
} from '../../pdf/structured-contract.js';
import {
	STRUCTURE_SYSTEM_PROMPT,
	buildStructureUserPrompt
} from '../../pdf/structure-contract.js';
import { bedrockSystemPrompt } from '../../pdf/bedrock-structurer.js';
import { VISION_DIAGRAM_TEXT_THRESHOLD } from '../../pdf/llm-config.js';
import { validateContract, crossCheckWithRegex } from '../../pdf/validate-contract.js';
import type { EvidencePage as PdfEvidencePage } from '../../pdf/ai-project-extractor.js';
import type { ParsedGdotJobV2 } from '../../pdf/parse-gdot.js';
import type { ParsedField } from '../../pdf/confidence.js';
import type {
	EvidencePage,
	ExtractionProfile,
	ExtractionPrompt,
	ExtractionContext,
	ProfileValidation,
	FieldMeta,
	FieldConflict
} from '../types.js';

/** Stable, versioned id for this profile (the caller passes this to the engine). */
export const PAVING_CONTRACT_V1_ID = 'paving-contract-v1';

/**
 * Adapt the engine's standardized {@link EvidencePage} into the richer legacy
 * {@link PdfEvidencePage} the structurer's prompt builder consumes. The prompt
 * builder only reads page_number / page_label / text / ocr_text, so we fill the
 * structural fields and leave the rest blank. (The engine passes the legacy
 * pages straight to `structureContract` for the heavy model call; this adapter
 * only feeds the profile's own `buildPrompt`.)
 */
function toPdfPages(pages: EvidencePage[]): PdfEvidencePage[] {
	return pages.map((p, i) => ({
		pdf_index: 0,
		filename: '',
		page_number: p.page_number,
		page_label: `Page ${p.page_number}`,
		text: p.text,
		image: p.bytes,
		ocr_text: undefined,
		_index: i
	} as unknown as PdfEvidencePage));
}

/**
 * Build a top-level {@link FieldMeta} from a structured {@link ParsedField}'s
 * citation envelope. Used by the engine (Phase 4 wires this fully); the profile
 * exposes it so field_meta assembly lives next to the schema that produces it.
 */
export function fieldMetaFromParsedField(f: ParsedField<unknown> | null | undefined): FieldMeta {
	return {
		confidence: f?.confidence ?? 'low',
		source_pages: f?.source_page != null ? [f.source_page] : [],
		source_file: f?.source_file ?? null,
		evidence_type: f?.evidence_type ?? null
	};
}

/**
 * Walk the validated contract's scalar fields and assemble per-field meta from
 * the citation envelopes the structurer stamped. Keyed by field path so the
 * review UI (Phase 7) can show "from Page N". Best-effort and null-safe.
 */
function buildFieldMeta(contract: StructuredContract): Record<string, FieldMeta> {
	const meta: Record<string, FieldMeta> = {};
	const put = (path: string, f: ParsedField<unknown> | null | undefined) => {
		if (f == null) return;
		meta[path] = fieldMetaFromParsedField(f);
	};
	if (contract.route) {
		put('route.designation', contract.route.designation);
		put('route.kind', contract.route.kind);
		put('route.number', contract.route.number);
	}
	put('county.name', contract.county?.name);
	put('county.fips', contract.county?.fips);
	put('gross_length_mi', contract.gross_length_mi);
	if (contract.midpoint) {
		put('midpoint.easting', contract.midpoint.easting);
		put('midpoint.northing', contract.midpoint.northing);
		put('midpoint.zone_label', contract.midpoint.zone_label);
	}
	contract.segments?.forEach((seg, i) => {
		put(`segments[${i}].name`, seg.name);
		put(`segments[${i}].length_mi`, seg.length_mi);
		put(`segments[${i}].begin_terminus`, seg.begin_terminus);
		put(`segments[${i}].end_terminus`, seg.end_terminus);
		seg.pavement?.forEach((pv, j) => {
			const base = `segments[${i}].pavement[${j}]`;
			put(`${base}.lift_thickness_in`, pv.lift_thickness_in);
			put(`${base}.mill_depth_in`, pv.mill_depth_in);
			put(`${base}.spread_rate_lbs_sy`, pv.spread_rate_lbs_sy);
			put(`${base}.mix`, pv.mix);
			put(`${base}.roadway_width_ft.min`, pv.roadway_width_ft?.min);
			put(`${base}.roadway_width_ft.max`, pv.roadway_width_ft?.max);
			put(`${base}.applies_from_mi`, pv.applies_from_mi);
			put(`${base}.applies_to_mi`, pv.applies_to_mi);
		});
	});
	return meta;
}

/**
 * The paving-contract profile. `TResult` is the multi-segment
 * {@link StructuredContract}. Validation is FLAG-ONLY (matches the existing
 * `validateContract` + `crossCheckWithRegex` contract); the structured
 * `conflicts[]` channel is populated in Phase 4 (the validator currently writes
 * human-readable warnings, which the engine carries through).
 */
export const pavingContractV1: ExtractionProfile<StructuredContract> = {
	id: PAVING_CONTRACT_V1_ID,
	schema: STRUCTURED_CONTRACT_SCHEMA,

	buildPrompt(pages: EvidencePage[]): ExtractionPrompt {
		const user = buildStructureUserPrompt(toPdfPages(pages));
		return {
			// Bedrock embeds the schema in the system prompt; Workers AI uses the
			// base prompt + response_format json_schema. The engine picks per engine,
			// but exposing the schema-embedded system prompt keeps the profile the
			// single source of truth for both.
			system: bedrockSystemPrompt(STRUCTURE_SYSTEM_PROMPT, STRUCTURED_CONTRACT_SCHEMA),
			user
		};
	},

	// Phase 2: hybrid text+vision page selection. Mark a page "diagram / low-text"
	// when its extracted text is short (a scanned/diagram page yields little
	// selectable text) OR it is a known diagram type (a Typical Section, which
	// carries the canonical pavement spec). Those pages get their client-rendered
	// image sent to Bedrock as a vision block; the rest stay text-only. The engine
	// further filters to pages that actually have image bytes + caps the count.
	selectPages(pages: EvidencePage[]): EvidencePage[] {
		return pages.filter((p) => {
			const text = p.text ?? '';
			if (text.trim().length < VISION_DIAGRAM_TEXT_THRESHOLD) return true;
			return /TYPICAL\s+SECTION/i.test(text);
		});
	},

	validate(result: StructuredContract, ctx: ExtractionContext): ProfileValidation<StructuredContract> {
		const before = result.warnings ?? [];
		// FLAG, NEVER DROP: structural validation then AI-primary regex cross-check.
		const validated = validateContract(result);
		const regex = ctx.validatorInput as ParsedGdotJobV2 | undefined;
		const crossChecked = regex
			? crossCheckWithRegex(validated, regex)
			: { contract: validated, conflicts: [] as FieldConflict[] };
		const checked = crossChecked.contract;

		// New warnings this stage added (the validator dedupes into the array).
		const beforeSet = new Set(before);
		const warnings = (checked.warnings ?? []).filter((w) => !beforeSet.has(w));

		// Structured conflicts: the AI-primary cross-check kept the AI value and
		// flagged each disagreement (resolution 'needs_review', amber severity).
		const conflicts: FieldConflict[] = crossChecked.conflicts;

		return {
			result: checked,
			warnings,
			conflicts,
			field_meta: buildFieldMeta(checked)
		};
	}
};
