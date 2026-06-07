/**
 * Central Workers AI model configuration for the PDF import pipeline.
 *
 * Single source of truth for which models the classifier, structurer, and the
 * legacy field-fill fallback use — no model id should be hardcoded in those
 * modules. Importing from here keeps the model choice (and its documented
 * fallback chain) consistent across the whole pipeline.
 *
 * Model selection verified against the LIVE Cloudflare Workers AI docs
 * (https://developers.cloudflare.com/workers-ai/features/json-mode/ and the AI
 * changelog, fetched June 2026).
 *
 * PRIMARY = `@cf/moonshotai/kimi-k2.5` (added Mar 19, 2026): the first
 * frontier-scale model on Workers AI, with a 256k context window, native VISION
 * inputs, and structured outputs (JSON mode + JSON Schema). It is the right
 * primary for strict multi-section contract structuring because:
 *   - the import bundles are large (e.g. a 22-page GDOT package ~ tens of
 *     thousands of chars PLUS one image per page) — the 256k context swallows
 *     the whole bundle where the ~smaller-context Llama 70B timed out
 *     ("3046: Request timeout") on the same document;
 *   - vision inputs let it read schematic / roadway-log page images directly;
 *   - JSON Schema structured outputs are drop-in with the existing
 *     `response_format: { type:'json_schema' }` call.
 *
 * FALLBACK = the Llama JSON-Mode chain (strongest -> lightest). Every entry is
 * on the live JSON-Mode "Supported Models" list:
 *   - @cf/meta/llama-3.3-70b-instruct-fp8-fast
 *   - @cf/meta/llama-3.1-70b-instruct
 *   - @cf/meta/llama-3.1-8b-instruct-fast
 *   - @cf/meta/llama-3-8b-instruct
 *   - @cf/meta/llama-3.2-11b-vision-instruct
 *   - @hf/nousresearch/hermes-2-pro-mistral-7b
 *   - @hf/thebloke/deepseek-coder-6.7b-instruct-awq
 *   - @cf/deepseek-ai/deepseek-r1-distill-qwen-32b
 *   - (@cf/meta/llama-3.1-8b-instruct deprecated May 30, 2026 — excluded)
 *
 * Workers AI can return a "JSON Mode couldn't be met" error or a capacity/
 * timeout error, so callers MUST validate output against their own shape and
 * treat any model error as a recoverable fallthrough to the next chain entry.
 */

/**
 * Primary structuring/extraction model: the frontier-scale 256k-context vision
 * model. Used by the LLM contract structurer and project extraction.
 */
export const PRIMARY_LLM_MODEL = '@cf/moonshotai/kimi-k2.5';

/**
 * JSON-Mode fallback chain, strongest → lightest. Tried in order when the
 * primary errors (e.g. capacity, timeout, "JSON Mode couldn't be met"). Every
 * entry is on the live JSON-Mode supported-models list above. The deprecated
 * bare `@cf/meta/llama-3.1-8b-instruct` is intentionally excluded.
 */
export const FALLBACK_MODELS: readonly string[] = [
	'@cf/meta/llama-3.3-70b-instruct-fp8-fast',
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
 * Lightweight JSON-Mode model for the NARROW gap-fill fallback (a handful of
 * scalar geographic/identity fields). The frontier PRIMARY_LLM_MODEL is overkill
 * for that small top-up, so the fallback uses a fast JSON-Mode-listed model.
 */
export const GAP_FILL_LLM_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

/**
 * Vision model used to OCR page images that have little/no selectable text.
 * Not a JSON-Mode model — image transcription only.
 */
export const PAGE_OCR_MODEL = '@cf/unum/uform-gen2-qwen-500m';

// --------------------------------------------------------------------------
// AWS Bedrock (primary contract structurer)
// --------------------------------------------------------------------------

/**
 * Bedrock is the PRIMARY structurer engine: Claude Sonnet 4 via the Bedrock
 * Converse REST API reliably produces the strict multi-segment StructuredContract
 * where the Workers AI models return no-json / time out. It is called from the
 * Worker with a plain `Authorization: Bearer <AWS_BEARER_TOKEN_BEDROCK>` header
 * (no SigV4), so a LONG-TERM Bedrock API key is required (short-term keys sign
 * with SigV4, which a bare fetch cannot do). Configure via Cloudflare secret
 * `AWS_BEARER_TOKEN_BEDROCK` (or `BEDROCK_API_KEY` alias) plus the vars below.
 * When the key is absent the structurer falls back to the Workers AI chain.
 */
export const BEDROCK_DEFAULT_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';
export const BEDROCK_DEFAULT_REGION = 'us-east-1';
/** Higher than the Workers AI 4096 cap: the full multi-segment output is large
 * (a 30-event roadway log) and 4096 truncates it. */
export const BEDROCK_DEFAULT_MAX_TOKENS = 8192;

// --------------------------------------------------------------------------
// Hybrid text+vision evidence package (Bedrock-only vision, plan Phase 2)
// --------------------------------------------------------------------------

/**
 * A page whose extracted (selectable) text is shorter than this many characters
 * is treated as "diagram / low-text": if a client-rendered page image exists,
 * the profile sends that image as a Bedrock Converse image block alongside the
 * text so the model can READ the diagram (e.g. a Typical Section drawing). A
 * scanned roadway-log page commonly extracts almost no text, hence the band.
 */
export const VISION_DIAGRAM_TEXT_THRESHOLD = 200;

/**
 * Hard cap on how many page images are attached to a single Bedrock request.
 * Each base64 image is a large multimodal token cost, so the package is bounded
 * to the most-likely-diagram pages; excess images degrade to text-only. Picked
 * to comfortably cover a typical package's diagram/typical-section pages without
 * blowing the per-request token / latency budget.
 */
export const VISION_MAX_IMAGE_COUNT = 8;

/**
 * Per-image byte cap. Images larger than this are skipped (text-only for that
 * page) to keep the base64 payload and token cost bounded. Client renders are
 * JPEG quality 0.75 at <=1600px, which sits well under this.
 */
export const VISION_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * p95 latency budget (ms) for a full import (the LATENCY TRIGGER from the plan).
 * The engine records each import's wall-clock in `diagnostics.duration_ms`; when
 * vision imports routinely exceed this, that is the signal to pull the async
 * job (Phase 9) forward. This constant defines "too slow"; it does not by itself
 * change behaviour (no request is failed for exceeding it).
 */
export const IMPORT_P95_LATENCY_BUDGET_MS = 60000;
