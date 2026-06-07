/**
 * Standardized document-EXTRACTION contract + the profile seam.
 *
 * This is the foundation of the format-agnostic extraction service (plan Phase
 * 0). It defines the generic, profile-driven boundary the import endpoint and
 * later phases build against:
 *
 *  - {@link ExtractionProfile} — a versioned profile (e.g. `paving-contract-v1`)
 *    that OWNS the schema, prompt, page-selection, validation, and post-process
 *    for one document family. The engine is generic; the profile is specific.
 *  - {@link EvidencePage} — the standardized per-page evidence shape carried into
 *    the engine: `{ page_number, text, bytes?, mime_type? }` (vision-ready). The
 *    legacy `ai-project-extractor.ts` `EvidencePage` is a richer superset; the
 *    engine accepts the legacy shape today and narrows to this for new callers.
 *  - {@link ExtractionResult} — the standardized result contract every extraction
 *    emits: `{ job_id, profile, status, result, field_meta, conflicts, warnings,
 *    diagnostics }`. Forward-compatible so going async (Phase 9) is an
 *    orchestration swap behind the same contract, not a rewrite.
 *
 * NOTHING here gates by document type or auto-routes: the CALLER passes a profile
 * id (see the plan's "Profile selection rule"). `field_meta`/`conflicts` become
 * first-class in Phase 4; this module defines their shape now so downstream
 * phases share one vocabulary.
 */

import type { FieldConfidence, EvidenceType, FieldCitation } from '../pdf/confidence.js';

// --------------------------------------------------------------------------
// Evidence
// --------------------------------------------------------------------------

/**
 * Standardized per-page evidence. Extended (per Phase 0) to carry raw page image
 * `bytes` + `mime_type` so the hybrid text+vision package (Phase 2) can send
 * diagram pages to a vision model. All image fields are optional: a text-only
 * page (or a package parsed via the manual multipart fallback, which renders no
 * images) simply omits them.
 */
export interface EvidencePage {
	/** 1-based page number within its source document. */
	page_number: number;
	/** Selectable text extracted from the page (may be empty for a scanned page). */
	text: string;
	/** Raw rendered page-image bytes, when a client-side render was uploaded. */
	bytes?: ArrayBuffer;
	/** Browser MIME of `bytes` (e.g. `image/jpeg`); normalized to jpeg/png at the Bedrock boundary. */
	mime_type?: string;
}

// --------------------------------------------------------------------------
// Result contract
// --------------------------------------------------------------------------

/** Lifecycle status of an extraction (sync path only ever emits succeeded/failed). */
export type ExtractionStatus = 'succeeded' | 'failed' | 'pending' | 'processing';

/**
 * Resolution of a conflict between the AI value and the regex-validator value.
 *  - `ai`            — AI value kept (AI-primary; the default once Phase 5 lands).
 *  - `validator`     — deterministic value kept (legacy deterministic-wins).
 *  - `agree`         — both agreed (confidence upgraded, no real conflict).
 *  - `needs_review`  — kept the AI value but flagged amber for human verification.
 */
export type ConflictResolution = 'ai' | 'validator' | 'agree' | 'needs_review';

/** Severity of a flagged conflict, for review-UI prioritization. */
export type ConflictSeverity = 'info' | 'warning' | 'error';

/**
 * Per-field provenance + confidence, keyed by field path in {@link ExtractionResult.field_meta}.
 * Assembled by the engine from each {@link FieldCitation} the structurer stamped
 * (see confidence.ts). Replaces the brittle flat `field_confidence`/`field_source`
 * string maps (Phase 4).
 */
export interface FieldMeta {
	confidence: FieldConfidence;
	/** Source page numbers the value was read from (one or more). */
	source_pages: number[];
	/** Source document filename / R2 key. */
	source_file: string | null;
	/** What kind of evidence the value came from. */
	evidence_type: EvidenceType | null;
}

/**
 * A structured disagreement between the AI value and the regex-validator value
 * for one field path. Replaces the warning-prose round-trip (Phase 4) whose UI
 * parser only matched single-word labels.
 */
export interface FieldConflict {
	/** Dotted field path, e.g. `county.name`, `gross_length_mi`. */
	field_path: string;
	/** The value the AI/structurer produced. */
	ai_value: unknown;
	/** The value the deterministic regex validator produced. */
	validator_value: unknown;
	resolution: ConflictResolution;
	severity: ConflictSeverity;
}

/**
 * The standardized result every extraction emits, regardless of profile or
 * (future) sync/async execution. `result` is the profile-specific canonical
 * model (typed by the profile's `TResult`).
 */
export interface ExtractionResult<TResult = unknown> {
	/** Stable id for this extraction run (used by the Phase 9 async job + polling). */
	job_id: string;
	/** Profile id that produced the result, e.g. `paving-contract-v1`. */
	profile: string;
	status: ExtractionStatus;
	/** Profile-specific canonical extraction (null when status !== 'succeeded'). */
	result: TResult | null;
	/** Per-field provenance/confidence, keyed by field path. */
	field_meta: Record<string, FieldMeta>;
	/** Structured AI-vs-validator disagreements (flag-only; never drops values). */
	conflicts: FieldConflict[];
	/** Non-fatal, human-readable notes for the review UI. */
	warnings: string[];
	/** Free-form engine diagnostics (engine, model, durations, …). */
	diagnostics: ExtractionDiagnostics;
}

/**
 * Free-form engine diagnostics. Intentionally open (index signature) so phases
 * can record latency / model / page-selection details without a type churn; the
 * named fields are the stable, always-present ones.
 */
export interface ExtractionDiagnostics {
	/** Which engine produced (or attempted) the result. */
	engine: 'bedrock' | 'workers-ai' | null;
	/** Model id, when known. */
	model: string | null;
	/** Total wall-clock of the extraction, in ms. */
	duration_ms: number;
	[key: string]: unknown;
}

// --------------------------------------------------------------------------
// Profile seam
// --------------------------------------------------------------------------

/**
 * Inputs handed to a profile's hooks. The engine assembles the evidence package
 * + bindings; the profile decides what to do with them.
 */
export interface ExtractionContext {
	/** Stable id for this run. */
	job_id: string;
	/** Full evidence package (all pages of all uploaded documents). */
	pages: EvidencePage[];
	/**
	 * Optional profile-specific validation input the engine supplies (e.g. the
	 * deterministic regex parse the paving profile cross-checks against). Kept
	 * loosely typed so the generic engine need not know each profile's shape.
	 */
	validatorInput?: unknown;
}

/**
 * A versioned extraction profile. The engine is generic orchestration; the
 * profile owns the document-family specifics:
 *  - `schema`      — the JSON Schema the model is asked to fill.
 *  - `buildPrompt` — system+user prompt for the selected pages.
 *  - `selectPages` — which pages to send (Phase 0: all; Phase 2: hybrid text+vision).
 *  - `validate`    — deterministic, flag-only validation/cross-check of the model output.
 *  - `postProcess` — final shaping into the canonical `TResult` (e.g. geometry mapping).
 *
 * `TResult` is the profile-specific canonical model (e.g. a `StructuredContract`
 * mapped to segments). Hooks may be async (geometry lookups, etc.).
 */
export interface ExtractionProfile<TResult = unknown> {
	/** Stable, versioned id, e.g. `paving-contract-v1`. */
	id: string;
	/** JSON Schema the model is asked to satisfy (embedded in the prompt for Bedrock). */
	schema: unknown;
	/** Build the system + user prompt for a set of selected pages. */
	buildPrompt(pages: EvidencePage[]): ExtractionPrompt;
	/** Choose which pages to send to the model (Phase 0: identity / all pages). */
	selectPages(pages: EvidencePage[]): EvidencePage[];
	/**
	 * Deterministic, side-effect-free validation of the raw model result. FLAG,
	 * NEVER DROP: returns the (possibly annotated) result plus warnings/conflicts.
	 */
	validate(result: TResult, ctx: ExtractionContext): ProfileValidation<TResult>;
	/** Optional final shaping (geometry mapping, derived fields). */
	postProcess?(result: TResult, ctx: ExtractionContext): Promise<TResult> | TResult;
}

/** System + user prompt pair returned by a profile's `buildPrompt`. */
export interface ExtractionPrompt {
	system: string;
	user: string;
}

/** Output of a profile's `validate` hook: the result plus flag-only annotations. */
export interface ProfileValidation<TResult = unknown> {
	result: TResult;
	warnings: string[];
	conflicts: FieldConflict[];
	/** Per-field meta the profile resolved during validation (merged into field_meta). */
	field_meta?: Record<string, FieldMeta>;
}

/** Re-export the citation type so profiles/engine can build FieldMeta from it. */
export type { FieldCitation, FieldMeta as ExtractionFieldMeta };
