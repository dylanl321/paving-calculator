/**
 * Unit tests for ticket-ocr.ts extraction logic.
 *
 * These tests exercise the pure parsing functions without a real Workers AI binding.
 * The AI is mocked to return a controlled description string.
 */

import { describe, it, expect } from 'vitest';
import { extractJsonFromText, extractTicketData, type WorkersAi } from '../ticket-ocr.js';

// ── extractJsonFromText ────────────────────────────────────────────────────────

describe('extractJsonFromText', () => {
	it('parses a standalone JSON object', () => {
		const result = extractJsonFromText('{"ticket_number": "T-001", "net_weight_tons": 22.5}');
		expect(result).toEqual({ ticket_number: 'T-001', net_weight_tons: 22.5 });
	});

	it('extracts JSON embedded in surrounding prose', () => {
		const text =
			'Here is the extracted data from the ticket: {"ticket_number": "48291", "net_weight_tons": 18.3} Please verify.';
		const result = extractJsonFromText(text);
		expect(result).not.toBeNull();
		expect(result!.ticket_number).toBe('48291');
		expect(result!.net_weight_tons).toBe(18.3);
	});

	it('returns null for plain text with no JSON', () => {
		const result = extractJsonFromText('No data found on this ticket.');
		expect(result).toBeNull();
	});

	it('returns null for malformed JSON', () => {
		const result = extractJsonFromText('{not valid json here}');
		expect(result).toBeNull();
	});

	it('handles nested JSON objects', () => {
		const result = extractJsonFromText('{"a": {"b": 1}, "c": 2}');
		expect(result).not.toBeNull();
		expect((result as Record<string, unknown>).c).toBe(2);
	});
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a mock WorkersAi that always returns the given description string. */
function mockAi(description: string): WorkersAi {
	return {
		run: async (_model: string, _input: Record<string, unknown>) => ({ description })
	};
}

// ── extractTicketData ──────────────────────────────────────────────────────────

describe('extractTicketData', () => {
	it('extracts fields with high confidence on a valid ticket', async () => {
		const desc = JSON.stringify({
			ticket_number: 'T-001',
			gross_weight_tons: 30,
			tare_weight_tons: 7.5,
			net_weight_tons: 22.5,
			truck_number: 'TRK-14',
			material_type: '19mm Superpave',
			plant_name: 'Atlanta Asphalt Plant',
			timestamp: '07:45'
		});
		const result = await extractTicketData(mockAi(desc), new ArrayBuffer(0));

		expect(result.ticket_number.value).toBe('T-001');
		expect(result.net_weight.value).toBeCloseTo(22.5);
		expect(result.gross_weight.value).toBeCloseTo(30);
		expect(result.tare_weight.value).toBeCloseTo(7.5);
		expect(result.truck_number.value).toBe('TRK-14');
		expect(result.material_type.value).toBe('19mm Superpave');
		expect(result.plant_name.value).toBe('Atlanta Asphalt Plant');
		expect(result.load_timestamp.value).toBe('07:45');
		expect(result.validation_errors).toHaveLength(0);
		expect(result.net_weight.confidence).toBe('high');
	});

	it('converts lbs to tons when value exceeds 200', async () => {
		// 45000 lbs -> 22.5 tons
		const desc = JSON.stringify({
			ticket_number: 'T-LBS',
			gross_weight_tons: 60000,
			tare_weight_tons: 15000,
			net_weight_tons: 45000
		});
		const result = await extractTicketData(mockAi(desc), new ArrayBuffer(0));

		expect(result.net_weight.value).toBeCloseTo(22.5);
		expect(result.gross_weight.value).toBeCloseTo(30);
		expect(result.tare_weight.value).toBeCloseTo(7.5);
	});

	it('records a validation error when net != gross - tare', async () => {
		const desc = JSON.stringify({
			ticket_number: 'T-MISMATCH',
			gross_weight_tons: 20,
			tare_weight_tons: 5,
			net_weight_tons: 10 // should be 15
		});
		const result = await extractTicketData(mockAi(desc), new ArrayBuffer(0));

		expect(result.validation_errors.length).toBeGreaterThan(0);
		expect(result.validation_errors[0]).toMatch(/net weight/i);
		expect(result.net_weight.confidence).toBe('medium');
	});

	it('returns empty extraction when AI returns non-JSON prose', async () => {
		const result = await extractTicketData(
			mockAi('I cannot read this image clearly.'),
			new ArrayBuffer(0)
		);

		expect(result.ticket_number.value).toBeNull();
		expect(result.net_weight.value).toBeNull();
		expect(result.net_weight.confidence).toBe('low');
		expect(result.validation_errors).toHaveLength(0);
	});

	it('returns empty extraction when AI throws an error', async () => {
		const badAi: WorkersAi = {
			run: async () => {
				throw new Error('AI binding unavailable');
			}
		};
		const result = await extractTicketData(badAi, new ArrayBuffer(0));

		expect(result.ticket_number.value).toBeNull();
		expect(result.net_weight.value).toBeNull();
		expect(result.net_weight.confidence).toBe('low');
	});

	it('handles partial data (only net_weight available)', async () => {
		const desc = JSON.stringify({
			net_weight_tons: 18.5,
			ticket_number: null,
			gross_weight_tons: null,
			tare_weight_tons: null
		});
		const result = await extractTicketData(mockAi(desc), new ArrayBuffer(0));

		expect(result.net_weight.value).toBeCloseTo(18.5);
		expect(result.ticket_number.value).toBeNull();
		expect(result.validation_errors).toHaveLength(0);
	});
});
