/**
 * Generic extraction ENGINE — the orchestration seam (plan Phase 0).
 *
 * The engine is profile-DRIVEN and caller-routed: the caller passes an
 * {@link ExtractionProfile} (e.g. `paving-contract-v1`); the engine never
 * auto-routes by document type. It runs the model structurer, hands the result
 * to the profile's flag-only `validate`, optionally `postProcess`es it, and
 * assembles the standardized {@link ExtractionResult} contract.
 *
 * Phase 0 scope: establish the module + signature so Phase 1 can MOVE the
 * `import-pdf/+server.ts` orchestration body in here without a behaviour change.
 * Today the engine WRAPS the existing `structureContract()` structurer pipeline
 * (Bedrock primary -> Workers AI fallback) verbatim — the gating/cross-check/
 * merge logic still lives in the endpoint and migrates in later phases. The
 * endpoint keeps working whether or not it routes through the engine.
 */

import { structureContract, type StructureContractResult, type StructureContractDiagnostic } from '../pdf/structure-contract.js';
import type { BedrockConfig } from '../pdf/bedrock-structurer.js';
import type { WorkersAi } from '../pdf/llm-fallback.js';
import type { EvidencePage as PdfEvidencePage } from '../pdf/ai-project-extractor.js';
import type { StructuredContract } from '../pdf/structured-contract.js';
import { VISION_DIAGRAM_TEXT_THRESHOLD, IMPORT_P95_LATENCY_BUDGET_MS } from '../pdf/llm-config.js';
import type {
	ExtractionProfile,
	ExtractionResult,
	ExtractionContext,
	ExtractionStatus,
	EvidencePage,
	FieldMeta,
	FieldConflict
} from './types.js';

/**
 * Options for one engine run. The engine is text+model today; vision image
 * blocks + page-selection caps arrive in Phase 2 behind the same signature.
 */
export interface RunExtractionOptions {
	/** Stable id for this run; defaults to a fresh UUID. */
	job_id?: string;
	/** Bedrock primary engine config (tried before the Workers AI chain). */
	bedrock?: BedrockConfig | null;
	/** Workers AI binding (undefined under local dev -> fallback skipped). */
	ai?: WorkersAi | undefined;
	/** Per-model timeout, forwarded to the structurer. */
	perModelTimeoutMs?: number;
	/**
	 * Profile-specific validation input (e.g. the deterministic regex parse the
	 * paving profile cross-checks against). Passed through to the profile's
	 * `validate` via {@link ExtractionContext.validatorInput}.
	 */
	validatorInput?: unknown;
}

/**
 * The current paving structurer produces a {@link StructuredContract}; the
 * engine is written generically against `TResult` but the wrapped structurer is
 * contract-shaped. A future profile that uses a different model entry point will
 * supply its own model call (Phase 1+); for now the engine knows how to drive
 * the StructuredContract structurer.
 */
type StructurerRunner = (
	ai: WorkersAi | undefined,
	pages: PdfEvidencePage[],
	options: { bedrock?: BedrockConfig | null; perModelTimeoutMs?: number; visionPages?: readonly PdfEvidencePage[] }
) => Promise<StructureContractResult>;

/**
 * Run an extraction through the generic engine for the given profile.
 *
 * @param profile  The caller-selected extraction profile (no auto-routing).
 * @param pages    The full evidence package (legacy pdf EvidencePage shape — the
 *                 structurer's native input; the standardized {@link EvidencePage}
 *                 is a narrowed view of the same data).
 * @param options  Bindings (ai/bedrock), timeout, and profile validation input.
 *
 * Best-effort: a missing AI binding / unusable model JSON yields a `failed`
 * status with a null result + diagnostics, never throwing — the caller falls
 * back to its deterministic path exactly as today.
 */
export async function runExtraction(
	profile: ExtractionProfile<StructuredContract>,
	pages: PdfEvidencePage[],
	options: RunExtractionOptions = {},
	runStructurer: StructurerRunner = structureContract
): Promise<ExtractionResult<StructuredContract>> {
	const started = Date.now();
	const job_id = options.job_id ?? crypto.randomUUID();

	// Profile-owned page selection: which pages get their image sent to vision.
	// The profile decides on the standardized pages; we map the chosen pages back
	// to the legacy pages (which carry the rendered image bytes) by page identity.
	const standardPages = toStandardPages(pages);
	const selectedStandard = profile.selectPages(standardPages);
	const selectedKeys = new Set(selectedStandard.map((p) => p.page_number));
	const visionPages = pages.filter((p, i) => selectedKeys.has(standardPages[i].page_number) && p.image != null);

	const structureResult = await runStructurer(options.ai, pages, {
		bedrock: options.bedrock,
		perModelTimeoutMs: options.perModelTimeoutMs,
		visionPages
	});

	const diagnostic = structureResult.diagnostic;
	const baseDiagnostics = {
		engine: diagnostic.engine,
		model: diagnostic.model,
		duration_ms: Date.now() - started,
		structurer_outcome: diagnostic.outcome,
		structurer_reason: diagnostic.reason,
		segment_count: diagnostic.segment_count,
		/** Number of page images sent to the vision model (0 = text-only). */
		vision_image_count: visionPages.length,
		/** The configured p95 latency budget; over-budget imports signal "go async" (Phase 9). */
		p95_budget_ms: IMPORT_P95_LATENCY_BUDGET_MS,
		/** The full structurer diagnostic, so callers needing the legacy shape can read it. */
		structurer_diagnostic: diagnostic as StructureContractDiagnostic
	};

	if (!structureResult.contract) {
		return {
			job_id,
			profile: profile.id,
			status: 'failed',
			result: null,
			field_meta: {},
			conflicts: [],
			warnings: [],
			diagnostics: baseDiagnostics
		};
	}

	const ctx: ExtractionContext = {
		job_id,
		pages: standardPages,
		validatorInput: options.validatorInput
	};

	const validation = profile.validate(structureResult.contract, ctx);
	let result = validation.result;
	if (profile.postProcess) {
		result = await profile.postProcess(result, ctx);
	}

	const status: ExtractionStatus = 'succeeded';
	const field_meta: Record<string, FieldMeta> = validation.field_meta ?? {};
	const conflicts: FieldConflict[] = validation.conflicts ?? [];
	const warnings = validation.warnings ?? [];

	const duration_ms = Date.now() - started;
	return {
		job_id,
		profile: profile.id,
		status,
		result,
		field_meta,
		conflicts,
		warnings,
		diagnostics: { ...baseDiagnostics, duration_ms, over_p95: duration_ms > IMPORT_P95_LATENCY_BUDGET_MS }
	};
}

/** Narrow the legacy pdf evidence pages to the standardized {@link EvidencePage}. */
function toStandardPages(pages: PdfEvidencePage[]): EvidencePage[] {
	return pages.map((p) => ({
		page_number: p.page_number,
		text: p.text,
		bytes: p.image,
		mime_type: p.image_mime_type
	}));
}
