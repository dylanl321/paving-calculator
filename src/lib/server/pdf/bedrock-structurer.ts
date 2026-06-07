/**
 * AWS Bedrock contract structurer client — the PRIMARY structuring engine.
 *
 * Claude Sonnet 4 via the Bedrock Converse REST API reliably produces the strict
 * multi-segment {@link StructuredContract} where the Workers AI models return
 * no-json / time out. Bedrock is called from the Worker with a plain
 * `Authorization: Bearer <key>` header (NO SigV4), so it works with a bare
 * `fetch()`. This requires a LONG-TERM Bedrock API key — short-term keys sign
 * with SigV4, which we cannot do here.
 *
 * Converse has no `response_format`/JSON-Mode, so the JSON Schema is embedded in
 * the system prompt and the model returns a raw JSON object as text. The caller
 * runs that text through the same `extractFlatContract` + `wrapFlatContract`
 * path the Workers AI structurer uses, so no Bedrock-specific parsing is needed.
 *
 * Mirrors `run_bedrock()` / `bedrock_system_prompt()` in
 * tools/build_structurer_input.py, which validated this exact path end-to-end.
 */

import {
	BEDROCK_DEFAULT_MODEL,
	BEDROCK_DEFAULT_REGION,
	BEDROCK_DEFAULT_MAX_TOKENS
} from './llm-config.js';

export interface BedrockConfig {
	apiKey: string;
	region: string;
	model: string;
	maxTokens: number;
}

/**
 * Minimal shape of the bits of `platform.env` we read. The secret
 * (AWS_BEARER_TOKEN_BEDROCK / BEDROCK_API_KEY) is not declared in wrangler.jsonc,
 * so it is not on the generated Env type — we read it via an index signature.
 */
export type BedrockEnv = Record<string, unknown> | undefined | null;

function envString(env: BedrockEnv, key: string): string | null {
	if (!env) return null;
	const v = (env as Record<string, unknown>)[key];
	if (typeof v !== 'string') return null;
	const trimmed = v.trim();
	return trimmed === '' ? null : trimmed;
}

/**
 * Build a {@link BedrockConfig} from the Worker env, or null when no API key is
 * configured (so the structurer falls back to the Workers AI chain). Reads the
 * key from `AWS_BEARER_TOKEN_BEDROCK` with `BEDROCK_API_KEY` as an alias, and
 * region/model/max-tokens from their vars with the central defaults.
 */
export function readBedrockConfig(env: BedrockEnv): BedrockConfig | null {
	const apiKey = envString(env, 'AWS_BEARER_TOKEN_BEDROCK') ?? envString(env, 'BEDROCK_API_KEY');
	if (!apiKey) return null;

	const region =
		envString(env, 'BEDROCK_REGION') ??
		envString(env, 'AWS_REGION') ??
		envString(env, 'AWS_DEFAULT_REGION') ??
		BEDROCK_DEFAULT_REGION;
	const model = envString(env, 'BEDROCK_MODEL') ?? BEDROCK_DEFAULT_MODEL;
	const maxTokensRaw = envString(env, 'BEDROCK_MAX_TOKENS');
	const parsed = maxTokensRaw != null ? Number(maxTokensRaw) : NaN;
	const maxTokens = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : BEDROCK_DEFAULT_MAX_TOKENS;

	return { apiKey, region, model, maxTokens };
}

/**
 * Bedrock Converse has no structured-output mode, so we append the JSON Schema
 * to the base structurer system prompt and instruct raw-JSON-only output.
 * Mirrors `bedrock_system_prompt()` in the Python tool.
 */
export function bedrockSystemPrompt(baseSystemPrompt: string, schema: unknown): string {
	return (
		baseSystemPrompt +
		'\n\nFor Bedrock, return the raw JSON object only. Do not wrap it in Markdown fences.' +
		'\n\nThe JSON object must satisfy this JSON Schema:\n' +
		JSON.stringify(schema)
	);
}

interface ConverseContentBlock {
	text?: string;
}
interface ConverseResponse {
	output?: { message?: { content?: ConverseContentBlock[] } };
}

/**
 * One image attached to a Bedrock Converse request (hybrid vision, Phase 2).
 * `mime_type` is the browser MIME of the rendered page (e.g. `image/jpeg`);
 * {@link runBedrockStructure} normalizes it to the Bedrock `format` token.
 */
export interface BedrockImage {
	bytes: ArrayBuffer;
	mime_type: string;
}

/** Bedrock Converse image `format` tokens (NOT MIME strings). */
type BedrockImageFormat = 'jpeg' | 'png' | 'gif' | 'webp';

/**
 * Normalize a browser MIME string to the Bedrock Converse image `format` token.
 * Bedrock wants `jpeg`/`png`/`gif`/`webp`, NOT `image/jpeg`. Returns null for an
 * unsupported MIME so the caller can skip that image (degrade to text-only).
 */
export function bedrockImageFormat(mime: string | null | undefined): BedrockImageFormat | null {
	if (typeof mime !== 'string') return null;
	const m = mime.trim().toLowerCase();
	if (m === 'image/jpeg' || m === 'image/jpg' || m === 'jpeg' || m === 'jpg') return 'jpeg';
	if (m === 'image/png' || m === 'png') return 'png';
	if (m === 'image/gif' || m === 'gif') return 'gif';
	if (m === 'image/webp' || m === 'webp') return 'webp';
	return null;
}

/** Base64-encode raw image bytes (the Converse body is JSON, so bytes must be a string). */
function base64FromBytes(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/**
 * Build the Converse user-message content blocks: any usable image blocks first
 * (so the model sees the diagrams), then the text prompt. Images whose MIME does
 * not map to a Bedrock format token are dropped (text-only for that page).
 */
function buildUserContent(
	userPrompt: string,
	images: readonly BedrockImage[]
): Array<Record<string, unknown>> {
	const content: Array<Record<string, unknown>> = [];
	for (const img of images) {
		const format = bedrockImageFormat(img.mime_type);
		if (!format) continue;
		content.push({
			image: { format, source: { bytes: base64FromBytes(img.bytes) } }
		});
	}
	content.push({ text: userPrompt });
	return content;
}

/**
 * Call the Bedrock Converse REST endpoint and return the concatenated text of
 * the response (expected to be a raw JSON object). Bounded by `signal` so a slow
 * call can't stall the import. Throws on non-2xx or transport error; the caller
 * treats any throw as a recoverable fallthrough to the Workers AI chain.
 *
 * When `images` are supplied (hybrid vision, Phase 2) they are base64-encoded
 * and sent as Converse image content blocks BEFORE the text prompt; images with
 * an unsupported MIME are skipped so the call degrades cleanly to text-only.
 */
export async function runBedrockStructure(
	cfg: BedrockConfig,
	systemPrompt: string,
	userPrompt: string,
	signal?: AbortSignal,
	images: readonly BedrockImage[] = []
): Promise<string> {
	const url = `https://bedrock-runtime.${cfg.region}.amazonaws.com/model/${encodeURIComponent(
		cfg.model
	)}/converse`;
	const body = {
		system: [{ text: systemPrompt }],
		messages: [{ role: 'user', content: buildUserContent(userPrompt, images) }],
		inferenceConfig: { temperature: 0, maxTokens: cfg.maxTokens }
	};

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${cfg.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body),
		signal
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`bedrock HTTP ${res.status}: ${detail.slice(0, 300)}`);
	}

	const data = (await res.json()) as ConverseResponse;
	const parts = data.output?.message?.content ?? [];
	const text = parts
		.map((block) => block.text ?? '')
		.join('')
		.trim();
	if (!text) throw new Error('bedrock returned no text content');
	return text;
}
