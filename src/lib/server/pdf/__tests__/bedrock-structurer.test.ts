/**
 * Bedrock primary-structurer tests.
 *
 * Two layers, both fully offline (no network, no AI binding):
 *  1. Pure config/prompt helpers in bedrock-structurer.ts (readBedrockConfig,
 *     bedrockSystemPrompt).
 *  2. A fixture test that feeds the REAL saved Bedrock Converse response for the
 *     25186 GDOT SR 7 ALT contract through the SAME parse path the app uses
 *     (extractFlatContract -> wrapFlatContract -> validateContract), proving the
 *     existing wrapping handles real Bedrock output: 2 segments (mainline + ramp
 *     reset), exploded side_roads, and width_change events.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
	readBedrockConfig,
	bedrockSystemPrompt,
	bedrockImageFormat,
	type BedrockEnv
} from '../bedrock-structurer.js';
import {
	BEDROCK_DEFAULT_MODEL,
	BEDROCK_DEFAULT_REGION,
	BEDROCK_DEFAULT_MAX_TOKENS
} from '../llm-config.js';
import { extractFlatContract, wrapFlatContract } from '../structure-contract.js';
import { validateContract } from '../validate-contract.js';
import { STRUCTURED_CONTRACT_SCHEMA } from '../structured-contract.js';

// --------------------------------------------------------------------------
// readBedrockConfig
// --------------------------------------------------------------------------

describe('readBedrockConfig', () => {
	it('returns null when no API key is configured', () => {
		expect(readBedrockConfig({})).toBeNull();
		expect(readBedrockConfig(undefined)).toBeNull();
		expect(readBedrockConfig({ BEDROCK_REGION: 'us-west-2' } as BedrockEnv)).toBeNull();
	});

	it('reads the primary AWS_BEARER_TOKEN_BEDROCK key with central defaults', () => {
		const cfg = readBedrockConfig({ AWS_BEARER_TOKEN_BEDROCK: 'key-123' });
		expect(cfg).not.toBeNull();
		expect(cfg!.apiKey).toBe('key-123');
		expect(cfg!.region).toBe(BEDROCK_DEFAULT_REGION);
		expect(cfg!.model).toBe(BEDROCK_DEFAULT_MODEL);
		expect(cfg!.maxTokens).toBe(BEDROCK_DEFAULT_MAX_TOKENS);
	});

	it('falls back to the BEDROCK_API_KEY alias', () => {
		const cfg = readBedrockConfig({ BEDROCK_API_KEY: 'alias-key' });
		expect(cfg?.apiKey).toBe('alias-key');
	});

	it('prefers AWS_BEARER_TOKEN_BEDROCK over the alias', () => {
		const cfg = readBedrockConfig({
			AWS_BEARER_TOKEN_BEDROCK: 'primary',
			BEDROCK_API_KEY: 'alias'
		});
		expect(cfg?.apiKey).toBe('primary');
	});

	it('honors region/model/max-token overrides', () => {
		const cfg = readBedrockConfig({
			AWS_BEARER_TOKEN_BEDROCK: 'k',
			BEDROCK_REGION: 'us-west-2',
			BEDROCK_MODEL: 'us.anthropic.claude-x',
			BEDROCK_MAX_TOKENS: '4096'
		});
		expect(cfg?.region).toBe('us-west-2');
		expect(cfg?.model).toBe('us.anthropic.claude-x');
		expect(cfg?.maxTokens).toBe(4096);
	});

	it('falls back through AWS_REGION / AWS_DEFAULT_REGION for region', () => {
		expect(readBedrockConfig({ AWS_BEARER_TOKEN_BEDROCK: 'k', AWS_REGION: 'eu-west-1' })?.region).toBe(
			'eu-west-1'
		);
		expect(
			readBedrockConfig({ AWS_BEARER_TOKEN_BEDROCK: 'k', AWS_DEFAULT_REGION: 'ap-south-1' })?.region
		).toBe('ap-south-1');
	});

	it('ignores a non-numeric / non-positive max-tokens and uses the default', () => {
		expect(
			readBedrockConfig({ AWS_BEARER_TOKEN_BEDROCK: 'k', BEDROCK_MAX_TOKENS: 'oops' })?.maxTokens
		).toBe(BEDROCK_DEFAULT_MAX_TOKENS);
		expect(
			readBedrockConfig({ AWS_BEARER_TOKEN_BEDROCK: 'k', BEDROCK_MAX_TOKENS: '-5' })?.maxTokens
		).toBe(BEDROCK_DEFAULT_MAX_TOKENS);
	});

	it('treats a blank key as absent', () => {
		expect(readBedrockConfig({ AWS_BEARER_TOKEN_BEDROCK: '   ' })).toBeNull();
	});
});

// --------------------------------------------------------------------------
// bedrockSystemPrompt
// --------------------------------------------------------------------------

describe('bedrockSystemPrompt', () => {
	it('embeds the JSON schema and a raw-JSON-only instruction after the base prompt', () => {
		const prompt = bedrockSystemPrompt('BASE PROMPT', STRUCTURED_CONTRACT_SCHEMA);
		expect(prompt.startsWith('BASE PROMPT')).toBe(true);
		expect(prompt).toContain('return the raw JSON object only');
		// The serialized schema is appended verbatim.
		expect(prompt).toContain(JSON.stringify(STRUCTURED_CONTRACT_SCHEMA));
		expect(prompt).toContain('"segments"');
	});
});

// --------------------------------------------------------------------------
// bedrockImageFormat — MIME -> Bedrock Converse format token (Phase 2 vision)
// --------------------------------------------------------------------------

describe('bedrockImageFormat', () => {
	it('normalizes browser MIME strings to Bedrock format tokens', () => {
		expect(bedrockImageFormat('image/jpeg')).toBe('jpeg');
		expect(bedrockImageFormat('image/jpg')).toBe('jpeg');
		expect(bedrockImageFormat('image/png')).toBe('png');
		expect(bedrockImageFormat('image/gif')).toBe('gif');
		expect(bedrockImageFormat('image/webp')).toBe('webp');
	});

	it('accepts bare format tokens and is case-insensitive', () => {
		expect(bedrockImageFormat('JPEG')).toBe('jpeg');
		expect(bedrockImageFormat('PNG')).toBe('png');
		expect(bedrockImageFormat('  image/PNG  ')).toBe('png');
	});

	it('returns null for an unsupported / missing MIME (caller degrades to text-only)', () => {
		expect(bedrockImageFormat('image/tiff')).toBeNull();
		expect(bedrockImageFormat('application/pdf')).toBeNull();
		expect(bedrockImageFormat(null)).toBeNull();
		expect(bedrockImageFormat(undefined)).toBeNull();
		expect(bedrockImageFormat('')).toBeNull();
	});
});

// --------------------------------------------------------------------------
// Real Bedrock response -> wrap path (25186 GDOT SR 7 ALT)
// --------------------------------------------------------------------------

function loadBedrockFixture(): string | null {
	// The saved Converse response lives in the repo's structurer-input output dir.
	const here = dirname(fileURLToPath(import.meta.url));
	const repoRoot = resolve(here, '../../../../..');
	const fixture = resolve(
		repoRoot,
		'structurer-input',
		'25186 CONTRACT SUMMARY.bedrock-response.txt'
	);
	try {
		return readFileSync(fixture, 'utf-8');
	} catch {
		return null;
	}
}

describe('real Bedrock 25186 response flows through the app wrap path', () => {
	const raw = loadBedrockFixture();

	it.runIf(raw)('parses as a flat contract and wraps into 2 segments (mainline + ramp)', () => {
		const flat = extractFlatContract(raw);
		expect(flat).not.toBeNull();
		const contract = wrapFlatContract(flat!);

		expect(contract.segments).toHaveLength(2);
		expect(contract.segments[0].kind.value).toBe('mainline');
		expect(contract.segments[1].kind.value).toBe('ramp');
		// Independent project_mile axes (the ramp resets to 0.000-0.060).
		expect(contract.segments.every((s) => s.measure_axis.value === 'project_mile')).toBe(true);
		expect(contract.county.name.value).toBe('Lowndes');
	});

	it.runIf(raw)('explodes the Woodrow Wilson / Gornto multi-road line into 2 side_roads', () => {
		const contract = wrapFlatContract(extractFlatContract(raw)!);
		const mainline = contract.segments[0];
		const multiRoad = mainline.events.find((e) =>
			(e.text.value ?? '').includes('WOODROW WILSON')
		);
		expect(multiRoad).toBeDefined();
		expect(multiRoad!.side_roads).toHaveLength(2);
		const names = multiRoad!.side_roads.map((sr) => sr.name.value);
		expect(names).toContain('WOODROW WILSON DR');
		expect(names.some((n) => (n ?? '').includes('GORNTO'))).toBe(true);
	});

	it.runIf(raw)('carries width_ft on the mainline turn-lane width_change events', () => {
		const contract = wrapFlatContract(extractFlatContract(raw)!);
		const widthChanges = contract.segments[0].events.filter(
			(e) => e.type.value === 'width_change'
		);
		expect(widthChanges.length).toBeGreaterThan(0);
		// At least one width_change records a 60 ft turn-lane segment.
		expect(widthChanges.some((e) => e.width_ft.value === 60)).toBe(true);
	});

	it.runIf(raw)('adopts Bedrock bid_items despite alias keys (item_number/extension)', () => {
		// The real Bedrock response keys bid items as item_number/extension/quantity
		// rather than our canonical item_id/bid_amount. The alias-tolerant wrap must
		// still surface them (this was the "0 rows" regression).
		const contract = wrapFlatContract(extractFlatContract(raw)!);
		expect(contract.bid_items.length).toBeGreaterThanOrEqual(8);
		// item_id resolved from the model's "item_number" alias.
		const superpave = contract.bid_items.find((b) => b.item_id === '402-4510');
		expect(superpave).toBeDefined();
		expect(superpave!.description).toContain('SUPERPAVE');
		// bid_amount resolved from the model's "extension" alias.
		expect(superpave!.bid_amount).toBe(806687);
		expect(superpave!.quantity).toBe(7987);
	});

	it.runIf(raw)('validates without throwing and preserves all events (flag, never drop)', () => {
		const contract = wrapFlatContract(extractFlatContract(raw)!);
		const before = contract.segments.map((s) => s.events.length);
		const validated = validateContract(contract);
		expect(validated.segments.map((s) => s.events.length)).toEqual(before);
	});
});
