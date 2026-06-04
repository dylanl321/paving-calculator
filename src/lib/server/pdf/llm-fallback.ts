/**
 * Phase 2 LLM fallback for GDOT PDF parsing.
 *
 * Deterministic regex/zone parsing in parse-gdot.ts is ALWAYS the primary path.
 * This fallback runs ONLY when the deterministic pass leaves geographic / key
 * scalar fields low-confidence or null (see needsLlmFallback), and it is fed
 * ONLY the already-isolated lowConfidenceZones — never the whole document.
 *
 * Spec-traceability constraint: the model may only FILL gaps. It can never
 * override a field the deterministic parser produced at medium/high confidence,
 * and anything it returns is stamped source:'llm-fallback' at 'medium'
 * confidence — we never auto-trust the model at 'high'. It must return null for
 * any field it cannot find; it must not invent values.
 *
 * Cloudflare Workers AI facts verified against the live docs (June 2026):
 *  - Free allocation 10,000 Neurons/day on Free AND Paid; overage $0.011/1k
 *    Neurons (Paid only). Free plan is a hard daily wall — calls fail rather
 *    than bill, so the fallback is best-effort and degrades to the
 *    deterministic result on any error.
 *  - JSON Mode = OpenAI-compatible `response_format` with a JSON Schema. The
 *    documented supported-models list is contested (cloudflare-docs#27786), so
 *    we always validate the output against our own shape and treat the
 *    "JSON Mode couldn't be met" error as a recoverable fallthrough.
 */

import { field, mergeField, type FieldConfidence } from './confidence.js';
import type { ParsedGdotJobV2 } from './parse-gdot.js';

/**
 * Active, JSON-Mode-listed text model. We avoid @cf/meta/llama-3.1-8b-instruct
 * (on the May 30, 2026 deprecation list) and prefer the retained `-fast`
 * variant. Override per call if needed.
 */
export const DEFAULT_LLM_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

/** Minimal shape of the env.AI binding we depend on (avoids a hard Ai type dep). */
export interface WorkersAi {
	run(
		model: string,
		input: Record<string, unknown>
	): Promise<unknown>;
}

/**
 * The geographic + identity fields the map pipeline and job creation depend on.
 * A miss on any of these is what makes a fallback worthwhile.
 */
const FALLBACK_FIELDS = [
	'county',
	'route_designation',
	'location_description',
	'begin_terminus',
	'end_terminus',
	'contract_id',
	'project_number',
	'contract_amount'
] as const;

type FallbackField = (typeof FALLBACK_FIELDS)[number];

/**
 * True when any fallback field is low-confidence or null after the
 * deterministic pass — i.e. an LLM gap-fill could plausibly help.
 */
export function needsLlmFallback(result: ParsedGdotJobV2): boolean {
	return FALLBACK_FIELDS.some((k) => {
		const f = result[k];
		return f == null || f.value === null || f.confidence === 'low';
	});
}

/** JSON Schema for the partial location/identity output (strings nullable). */
function fallbackSchema() {
	const nullableString = { type: ['string', 'null'] };
	const nullableNumber = { type: ['number', 'null'] };
	return {
		type: 'object',
		properties: {
			county: nullableString,
			route_designation: nullableString,
			location_description: nullableString,
			begin_terminus: nullableString,
			end_terminus: nullableString,
			contract_id: nullableString,
			project_number: nullableString,
			contract_amount: nullableNumber
		},
		required: [...FALLBACK_FIELDS]
	};
}

interface FallbackOutput {
	county?: string | null;
	route_designation?: string | null;
	location_description?: string | null;
	begin_terminus?: string | null;
	end_terminus?: string | null;
	contract_id?: string | null;
	project_number?: string | null;
	contract_amount?: number | null;
}

const SYSTEM_PROMPT =
	'You extract structured fields from excerpts of a Georgia DOT (GDOT) paving ' +
	'contract document. Return ONLY the requested JSON. For any field you cannot ' +
	'find in the provided text, return null. Never guess or invent a value. ' +
	'route_designation should be a compact road id like "SR 13", "I-85", "US 23", ' +
	'or "CR 124" when present.';

/** Pull the model's JSON object out of the various Workers AI response shapes. */
function extractJson(raw: unknown): FallbackOutput | null {
	// JSON Mode typically returns { response: {...} }; some models return a string.
	const candidate =
		raw && typeof raw === 'object' && 'response' in raw
			? (raw as { response: unknown }).response
			: raw;

	if (candidate && typeof candidate === 'object') {
		return candidate as FallbackOutput;
	}
	if (typeof candidate === 'string') {
		try {
			return JSON.parse(candidate) as FallbackOutput;
		} catch {
			return null;
		}
	}
	return null;
}

function cleanString(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const s = v.trim();
	return s === '' ? null : s;
}

function cleanNumber(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	return null;
}

/**
 * Merge LLM output into the V2 result. ONLY fills fields that are currently
 * 'low' confidence or null; mergeField guarantees a medium-confidence
 * llm-fallback value can never beat an existing medium/high field.
 */
function mergeFallback(v2: ParsedGdotJobV2, out: FallbackOutput): void {
	const conf: FieldConfidence = 'medium';
	const src = 'llm-fallback';

	const fillString = (key: FallbackField, value: string | null) => {
		if (value == null) return;
		const current = v2[key] as ReturnType<typeof field.low<string>>;
		v2[key] = mergeField(current, field.medium(value, src)) as never;
		void conf;
	};
	const fillNumber = (key: 'contract_amount', value: number | null) => {
		if (value == null) return;
		const current = v2[key];
		v2[key] = mergeField(current, field.medium(value, src));
	};

	fillString('county', cleanString(out.county));
	fillString('route_designation', cleanString(out.route_designation));
	fillString('location_description', cleanString(out.location_description));
	fillString('begin_terminus', cleanString(out.begin_terminus));
	fillString('end_terminus', cleanString(out.end_terminus));
	fillString('contract_id', cleanString(out.contract_id));
	fillString('project_number', cleanString(out.project_number));
	fillNumber('contract_amount', cleanNumber(out.contract_amount));
}

export interface LlmFallbackResult {
	/** True if the model returned usable JSON that was merged. */
	applied: boolean;
	/** Non-fatal reason when the fallback did not apply. */
	reason?: string;
}

/**
 * Observable diagnostic for the Phase 2 Workers AI fallback, so the import-pdf
 * response can tell the user/UI whether the LLM actually ran and why it did or
 * did not apply. The most common reason it does NOT run is that the `AI` binding
 * is absent in the environment under test (e.g. the local `vite dev` platform
 * proxy frequently does not expose Workers AI), in which case the fallback
 * silently no-ops — this makes that explicit.
 */
export interface LlmFallbackDiagnostic {
	/** True when a fallback was warranted (low-confidence/null geographic fields). */
	attempted: boolean;
	/** True when the model returned usable JSON that was merged into the result. */
	applied: boolean;
	/** Why the fallback did/didn't apply (e.g. 'ai-binding-unavailable'). */
	reason: string;
	/** True when the `AI` binding was present in this environment. */
	binding_available: boolean;
}

/**
 * Build the observable LLM-fallback diagnostic from the attempt context and the
 * runLlmFallback result. Pure (no I/O) so it is unit-testable directly.
 */
export function buildLlmDiagnostic(
	attempted: boolean,
	bindingAvailable: boolean,
	result: LlmFallbackResult
): LlmFallbackDiagnostic {
	return {
		attempted,
		applied: result.applied,
		reason: result.reason ?? (result.applied ? 'applied' : 'unknown'),
		binding_available: bindingAvailable
	};
}

/**
 * Append a single human-readable warning describing the LLM fallback outcome,
 * but ONLY when it would have been useful and didn't apply — so the user can
 * see why low-confidence fields weren't supplemented. The success warning is
 * pushed inside runLlmFallback, so it is skipped here to avoid duplication.
 */
export function appendLlmFallbackWarning(
	warnings: string[],
	diag: LlmFallbackDiagnostic
): void {
	if (!diag.attempted || diag.applied) return;

	if (!diag.binding_available) {
		warnings.push(
			'AI assist did not run: the Workers AI binding is not available in this environment ' +
				'(common under local dev). Low-confidence fields were left as deterministically parsed.'
		);
		return;
	}

	warnings.push(
		`AI assist ran but did not supplement any fields (${diag.reason}). ` +
			'Low-confidence fields were left as deterministically parsed.'
	);
}

/**
 * Run the text-PDF LLM fallback on the low-confidence zones of a V2 result.
 * Mutates `v2` in place (filling only low/null fields). Best-effort: any error
 * or unmet JSON Mode leaves the deterministic result untouched.
 */
export async function runLlmFallback(
	ai: WorkersAi | undefined,
	v2: ParsedGdotJobV2,
	model: string = DEFAULT_LLM_MODEL
): Promise<LlmFallbackResult> {
	if (!ai) return { applied: false, reason: 'ai-binding-unavailable' };
	if (!needsLlmFallback(v2)) return { applied: false, reason: 'no-low-confidence-fields' };

	const zoneText = v2.lowConfidenceZones
		.map((z) => z.text)
		.join('\n\n---\n\n')
		.slice(0, 8000); // keep token usage bounded — zones only, never the whole doc

	if (!zoneText.trim()) return { applied: false, reason: 'no-zone-text' };

	try {
		const raw = await ai.run(model, {
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content:
						'Extract the location and identity fields from this GDOT document excerpt:\n\n' +
						zoneText
				}
			],
			response_format: {
				type: 'json_schema',
				json_schema: fallbackSchema()
			}
		});

		const out = extractJson(raw);
		if (!out) return { applied: false, reason: 'no-json' };

		mergeFallback(v2, out);
		v2.warnings.push('Low-confidence fields were supplemented by the LLM fallback (verify before use).');
		return { applied: true };
	} catch (err) {
		// Includes the documented "JSON Mode couldn't be met" error and the
		// Free-plan daily Neuron wall — both degrade silently to deterministic.
		const reason = err instanceof Error ? err.message : 'llm-error';
		return { applied: false, reason };
	}
}
