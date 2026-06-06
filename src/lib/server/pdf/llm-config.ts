/**
 * Central Workers AI model configuration for the PDF import pipeline.
 *
 * Single source of truth for which models the classifier, structurer, and the
 * legacy field-fill fallback use — no model id should be hardcoded in those
 * modules. Importing from here keeps the model choice (and its documented
 * fallback chain) consistent across the whole pipeline.
 *
 * Model selection verified against the LIVE Cloudflare Workers AI docs
 * (https://developers.cloudflare.com/workers-ai/features/json-mode/, fetched
 * June 2026). The "Supported Models" list for JSON Mode (`response_format`
 * with a JSON Schema) at that date is:
 *   - @cf/meta/llama-3.1-8b-instruct-fast
 *   - @cf/meta/llama-3.1-70b-instruct
 *   - @cf/meta/llama-3.3-70b-instruct-fp8-fast   <-- selected primary
 *   - @cf/meta/llama-3-8b-instruct
 *   - @cf/meta/llama-3.1-8b-instruct              (deprecated May 30, 2026)
 *   - @cf/meta/llama-3.2-11b-vision-instruct
 *   - @hf/nousresearch/hermes-2-pro-mistral-7b
 *   - @hf/thebloke/deepseek-coder-6.7b-instruct-awq
 *   - @cf/deepseek-ai/deepseek-r1-distill-qwen-32b
 *
 * `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is the strongest general-purpose
 * instruct model on that JSON-Mode list (70B, FP8-fast for cost/latency) and is
 * Cloudflare's OWN documented default for structured JSON extraction (the
 * Browser Run `/json` endpoint defaults to it —
 * https://developers.cloudflare.com/browser-run/quick-actions/json-endpoint/).
 * That makes it the right primary for strict multi-section contract structuring,
 * a clear upgrade over the previous small `@cf/meta/llama-3.1-8b-instruct-fast`.
 *
 * The documented supported-models list is contested (cloudflare-docs#27786) and
 * Workers AI can return a "JSON Mode couldn't be met" error, so callers must
 * always validate output against their own shape and treat a model error as a
 * recoverable fallthrough. The FALLBACK_MODELS chain lets a caller retry a
 * lighter listed model when the primary errors.
 */

/**
 * Primary structuring/extraction model: strongest JSON-Mode-listed instruct
 * model. Used by the LLM contract structurer and project extraction.
 */
export const PRIMARY_LLM_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/**
 * Documented JSON-Mode fallback chain, strongest → lightest. Tried in order
 * when the primary errors (e.g. capacity, "JSON Mode couldn't be met"). Every
 * entry is on the live JSON-Mode supported-models list above. The deprecated
 * bare `@cf/meta/llama-3.1-8b-instruct` is intentionally excluded.
 */
export const FALLBACK_MODELS: readonly string[] = [
	'@cf/meta/llama-3.1-70b-instruct',
	'@cf/meta/llama-3.1-8b-instruct-fast'
];

/**
 * Ordered model chain (primary first, then fallbacks) for callers that want to
 * try progressively lighter models until one returns usable JSON.
 */
export const LLM_MODEL_CHAIN: readonly string[] = [PRIMARY_LLM_MODEL, ...FALLBACK_MODELS];

/**
 * Lightweight model for cheap, low-stakes calls (document-type classification).
 * The classifier only needs to pick one of a handful of labels, so the fast 8B
 * variant is sufficient and keeps Neuron usage low.
 */
export const CLASSIFY_LLM_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

/**
 * Vision model used to OCR page images that have little/no selectable text.
 * Not a JSON-Mode model — image transcription only.
 */
export const PAGE_OCR_MODEL = '@cf/unum/uform-gen2-qwen-500m';
