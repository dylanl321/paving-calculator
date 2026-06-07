/**
 * Adapter tests — `mergeStructuredContractIntoV2` is AI-PRIMARY (plan Phase 5).
 *
 * Fully offline (no AI binding). Verifies the flip from "fill-null/low-only" to
 * AI-primary: whenever the structured contract carries a value it OVERWRITES the
 * deterministic V2 field (even a high-confidence regex value), and the regex
 * value is only retained when the AI left the field genuinely absent.
 */

import { describe, it, expect } from 'vitest';
import { field, type ParsedField } from '../confidence.js';
import { mergeStructuredContractIntoV2 } from '../structured-contract-adapter.js';
import { parseGdotDocumentsV2, type ParsedGdotJobV2 } from '../parse-gdot.js';
import type { StructuredContract } from '../structured-contract.js';

function emptyContract(partial: Partial<StructuredContract> = {}): StructuredContract {
	return {
		route: null,
		county: { name: field.missing<string>('fixture'), fips: field.missing<string>('fixture') },
		midpoint: null,
		gross_length_mi: field.missing<number>('fixture'),
		segments: [],
		bid_items: [],
		production_mixes: [],
		warnings: [],
		...partial
	};
}

function v2With(overrides: Partial<Record<string, ParsedField<string | number>>>): ParsedGdotJobV2 {
	const v2 = parseGdotDocumentsV2(['']);
	for (const [k, v] of Object.entries(overrides)) {
		(v2 as unknown as Record<string, unknown>)[k] = v;
	}
	return v2;
}

describe('mergeStructuredContractIntoV2 is AI-primary', () => {
	it('OVERWRITES even a high-confidence deterministic value with the AI value', () => {
		const v2 = v2With({ county: field.high('Echols', 'deterministic') });
		const contract = emptyContract({
			county: { name: field.medium('Lowndes', 'llm'), fips: field.missing<string>('llm') }
		});
		mergeStructuredContractIntoV2(v2, contract);
		// AI-primary: the medium AI value beats the high deterministic value.
		expect(v2.county.value).toBe('Lowndes');
		expect(v2.county.source).toContain('llm-structurer');
	});

	it('retains the deterministic value only when the AI field is absent', () => {
		const v2 = v2With({ county: field.high('Echols', 'deterministic') });
		const contract = emptyContract({
			county: { name: field.missing<string>('llm'), fips: field.missing<string>('llm') }
		});
		mergeStructuredContractIntoV2(v2, contract);
		// AI absent -> deterministic value kept.
		expect(v2.county.value).toBe('Echols');
	});

	it('carries a high-confidence AI value through as high confidence', () => {
		const v2 = v2With({ gross_length_mi: field.medium(9.9, 'deterministic') });
		const contract = emptyContract({ gross_length_mi: field.high(2.86, 'llm') });
		mergeStructuredContractIntoV2(v2, contract);
		expect(v2.gross_length_mi.value).toBe(2.86);
		expect(v2.gross_length_mi.confidence).toBe('high');
	});

	it('adopts AI bid items only when the deterministic parse found none', () => {
		const v2 = v2With({});
		expect(v2.bid_items).toHaveLength(0);
		const contract = emptyContract({
			bid_items: [
				{
					line_number: '1',
					item_id: '402-4510',
					description: 'SUPERPAVE',
					quantity: 100,
					unit: 'TN',
					unit_price: 80,
					bid_amount: 8000,
					section: null,
					is_alternate: false,
					selected: true
				}
			]
		});
		mergeStructuredContractIntoV2(v2, contract);
		expect(v2.bid_items).toHaveLength(1);
		expect(v2.bid_items[0].item_id).toBe('402-4510');
	});
});
