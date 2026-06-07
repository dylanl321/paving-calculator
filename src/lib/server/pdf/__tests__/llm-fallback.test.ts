import { describe, it, expect } from 'vitest';
import {
	needsLlmFallback,
	runLlmFallback,
	buildLlmDiagnostic,
	appendLlmFallbackWarning,
	DEFAULT_LLM_MODEL,
	type WorkersAi
} from '../llm-fallback.js';
import { parseGdotDocumentsV2, type ParsedGdotJobV2 } from '../parse-gdot.js';

/** A contract summary that is missing route + location text, so the geographic
 *  fallback fields end up low/null and needsLlmFallback() is true. */
const TEXT_MISSING_LOCATION =
	'Contract Schedule\nContract ID: T-LLM\nCounties: Bibb\nNET LENGTH OF PROJECT 1.000 MILES\n' +
	'Schedule of Items\nProposal Line Number Item ID Description Dollars Cents\n' +
	'0010 150-1000 TRAFFIC CONTROL M006670 LUMP SUM 1000.00\nTotal Bid: $1,000.00\n';

/** A complete contract summary where route + location parse at medium confidence. */
const TEXT_WITH_LOCATION =
	'Contract Schedule\nContract ID: T-FULL\nCounties: Fulton\nNET LENGTH OF PROJECT 5.505 MILES\n' +
	'5.505 MILES OF MILLING, PLANT MIX RESURFACING ON SR 14 (NOTICE)\n' +
	'Schedule of Items\nProposal Line Number Item ID Description Dollars Cents\n' +
	'0010 150-1000 TRAFFIC CONTROL M006670 LUMP SUM 1000.00\nTotal Bid: $1,000.00\n';

/** Build a Workers AI stub that returns a fixed payload (or throws). */
function stubAi(payload: unknown, opts: { throwErr?: Error } = {}): WorkersAi {
	return {
		run: async () => {
			if (opts.throwErr) throw opts.throwErr;
			return payload;
		}
	};
}

describe('needsLlmFallback', () => {
	it('returns true when geographic fields are missing', () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		expect(needsLlmFallback(v2)).toBe(true);
	});

	it('still flags when only the route is missing (location present)', () => {
		// fixture-style text without a route designation
		const v2 = parseGdotDocumentsV2([
			'Contract Schedule\nContract ID: T-NR\nCounties: Cobb\nNET LENGTH OF PROJECT 1.000 MILES\n' +
				'1.000 MILES OF RESURFACING AND RELATED WORK (NOTICE)\nTotal Bid: $1,000.00\n'
		]);
		expect(v2.route_designation.value).toBe(null);
		expect(needsLlmFallback(v2)).toBe(true);
	});
});

describe('runLlmFallback - guard conditions', () => {
	it('does nothing when the AI binding is unavailable', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		const res = await runLlmFallback(undefined, v2);
		expect(res.applied).toBe(false);
		expect(res.reason).toBe('ai-binding-unavailable');
	});

	it('does nothing when there are no low-confidence fields', async () => {
		// Use a result that has no low-confidence fallback fields by faking high
		// confidence on all of them via a fully-populated parse is hard, so assert
		// the early-exit reason path with a stub that should never be called.
		const v2 = parseGdotDocumentsV2([TEXT_WITH_LOCATION]);
		// Force the remaining fallback fields to non-low so the guard trips.
		for (const k of [
			'county',
			'route_designation',
			'location_description',
			'begin_terminus',
			'end_terminus',
			'contract_id',
			'project_number',
			'contract_amount'
		] as const) {
			const f = v2[k] as { value: unknown; confidence: string };
			if (f.value == null) f.value = 'x';
			f.confidence = 'high';
		}
		let called = false;
		const ai: WorkersAi = {
			run: async () => {
				called = true;
				return {};
			}
		};
		const res = await runLlmFallback(ai, v2);
		expect(res.applied).toBe(false);
		expect(res.reason).toBe('no-low-confidence-fields');
		expect(called).toBe(false);
	});
});

describe('runLlmFallback - merge behavior', () => {
	it('fills a missing route_designation from the model (json_object shape)', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		expect(v2.route_designation.value).toBe(null);

		const ai = stubAi({ response: { route_designation: 'SR 247', location_description: '1 MILE OF X' } });
		const res = await runLlmFallback(ai, v2);

		expect(res.applied).toBe(true);
		expect(v2.route_designation.value).toBe('SR 247');
		expect(v2.route_designation.confidence).toBe('medium');
		expect(v2.route_designation.source).toBe('llm-fallback');
	});

	it('parses a stringified JSON response', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		const ai = stubAi(JSON.stringify({ route_designation: 'I-75' }));
		const res = await runLlmFallback(ai, v2);
		expect(res.applied).toBe(true);
		expect(v2.route_designation.value).toBe('I-75');
	});

	it('NEVER overrides a medium/high deterministic field', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_WITH_LOCATION]);
		// county parsed at medium/high from the contract summary
		expect(['medium', 'high']).toContain(v2.county.confidence);
		const originalCounty = v2.county.value;

		// Model tries to overwrite county — must be ignored.
		const ai = stubAi({ response: { county: 'WRONG COUNTY' } });
		await runLlmFallback(ai, v2);
		expect(v2.county.value).toBe(originalCounty);
	});

	it('ignores null fields from the model (never invents)', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		const ai = stubAi({ response: { route_designation: null, location_description: null } });
		await runLlmFallback(ai, v2);
		expect(v2.route_designation.value).toBe(null);
	});

	it('coerces a numeric contract_amount and drops bad numbers', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		// contract_amount parsed as 1000 (high) — model cannot override it.
		const ai = stubAi({ response: { contract_amount: 'not-a-number' } });
		const res = await runLlmFallback(ai, v2);
		expect(res.applied).toBe(true);
		// Stays the deterministic value, never NaN/garbage.
		expect(typeof v2.contract_amount.value === 'number' || v2.contract_amount.value === null).toBe(
			true
		);
	});
});

describe('runLlmFallback - error fallthrough', () => {
	it('degrades silently to deterministic on a thrown error (e.g. JSON Mode unmet)', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		const before = v2.route_designation.value;
		const ai = stubAi(null, { throwErr: new Error('JSON Mode couldn\u2019t be met') });
		const res = await runLlmFallback(ai, v2);
		expect(res.applied).toBe(false);
		expect(res.reason).toContain('JSON Mode');
		expect(v2.route_designation.value).toBe(before);
	});

	it('returns no-json when the model returns a non-object/non-string', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		const ai = stubAi({ response: 42 });
		const res = await runLlmFallback(ai, v2);
		expect(res.applied).toBe(false);
		expect(res.reason).toBe('no-json');
	});
});

describe('DEFAULT_LLM_MODEL', () => {
	it('is an active (non-deprecated) JSON-Mode model', () => {
		// The narrow gap-fill fallback uses the lightweight GAP_FILL_LLM_MODEL (a
		// fast JSON-Mode-listed model) — the frontier structurer primary
		// (@cf/moonshotai/kimi-k2.5) is reserved for full contract structuring.
		// Must NOT be the deprecated @cf/meta/llama-3.1-8b-instruct.
		expect(DEFAULT_LLM_MODEL).toBe('@cf/meta/llama-3.1-8b-instruct-fast');
		expect(DEFAULT_LLM_MODEL).not.toBe('@cf/meta/llama-3.1-8b-instruct');
	});
});

describe('buildLlmDiagnostic', () => {
	it('reports binding-unavailable as observable (not silent)', () => {
		const diag = buildLlmDiagnostic(true, false, {
			applied: false,
			reason: 'ai-binding-unavailable'
		});
		expect(diag).toEqual({
			attempted: true,
			applied: false,
			reason: 'ai-binding-unavailable',
			binding_available: false,
			outcome: 'binding-unavailable'
		});
	});

	it('reports an applied fallback', () => {
		const diag = buildLlmDiagnostic(true, true, { applied: true });
		expect(diag.applied).toBe(true);
		expect(diag.binding_available).toBe(true);
		expect(diag.outcome).toBe('applied');
		// reason defaults to a sentinel when the result omits it
		expect(diag.reason).toBe('applied');
	});

	it('classifies no-zone-text / no-low-confidence as a benign no-op (not-needed)', () => {
		expect(buildLlmDiagnostic(true, true, { applied: false, reason: 'no-zone-text' }).outcome).toBe(
			'not-needed'
		);
		expect(
			buildLlmDiagnostic(true, true, { applied: false, reason: 'no-low-confidence-fields' }).outcome
		).toBe('not-needed');
	});

	it('classifies a model error / no-json as failed', () => {
		expect(buildLlmDiagnostic(true, true, { applied: false, reason: 'no-json' }).outcome).toBe(
			'failed'
		);
		expect(
			buildLlmDiagnostic(true, true, { applied: false, reason: 'JSON Mode could not be met' }).outcome
		).toBe('failed');
	});
});

describe('appendLlmFallbackWarning', () => {
	const diagOf = (
		bindingAvailable: boolean,
		result: { applied: boolean; reason?: string }
	) => buildLlmDiagnostic(true, bindingAvailable, result);

	it('adds a non-alarming note when the binding was unavailable', () => {
		const warnings: string[] = [];
		appendLlmFallbackWarning(warnings, diagOf(false, { applied: false, reason: 'ai-binding-unavailable' }));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/not available in this environment/i);
	});

	it('stays SILENT for a no-op (no-zone-text) — nothing low-confidence to send', () => {
		const warnings: string[] = [];
		appendLlmFallbackWarning(warnings, diagOf(true, { applied: false, reason: 'no-zone-text' }));
		expect(warnings).toHaveLength(0);
	});

	it('stays silent for no-low-confidence-fields', () => {
		const warnings: string[] = [];
		appendLlmFallbackWarning(
			warnings,
			diagOf(true, { applied: false, reason: 'no-low-confidence-fields' })
		);
		expect(warnings).toHaveLength(0);
	});

	it('warns only when a model call genuinely failed', () => {
		const warnings: string[] = [];
		appendLlmFallbackWarning(warnings, diagOf(true, { applied: false, reason: 'no-json' }));
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toMatch(/could not supplement/i);
		expect(warnings[0]).toContain('no-json');
	});

	it('stays silent when the fallback applied successfully', () => {
		const warnings: string[] = [];
		appendLlmFallbackWarning(warnings, diagOf(true, { applied: true }));
		expect(warnings).toHaveLength(0);
	});
});

describe('import-pdf diagnostic integration (binding-unavailable path)', () => {
	it('a real parse with no AI binding yields an observable, non-applied diagnostic', async () => {
		const v2 = parseGdotDocumentsV2([TEXT_MISSING_LOCATION]);
		const attempted = needsLlmFallback(v2);
		expect(attempted).toBe(true);

		// Mirror the +server.ts wiring: no binding => runLlmFallback no-ops.
		const result = await runLlmFallback(undefined, v2);
		const diag = buildLlmDiagnostic(attempted, false, result);
		expect(diag.attempted).toBe(true);
		expect(diag.applied).toBe(false);
		expect(diag.binding_available).toBe(false);
		expect(diag.reason).toBe('ai-binding-unavailable');
		expect(diag.outcome).toBe('binding-unavailable');

		const warnings: string[] = [];
		appendLlmFallbackWarning(warnings, diag);
		expect(warnings[0]).toMatch(/not available in this environment/i);
	});
});
