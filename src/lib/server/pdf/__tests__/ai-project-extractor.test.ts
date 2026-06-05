import { describe, expect, it } from 'vitest';
import { mergeAiExtraction, runAiProjectExtraction, type EvidencePage } from '../ai-project-extractor.js';
import { parseGdotDocumentsV2 } from '../parse-gdot.js';
import type { WorkersAi } from '../llm-fallback.js';

const BASE_TEXT =
	'Contract Schedule\n' +
	'Contract ID: B1CBA2502850-0 Project(s): M006670\n' +
	'Counties : Echols\n' +
	'5.505 MILES OF MILLING, PLANT MIX RESURFACING AND SHOULDER REHABILITATION ON SR 11\n' +
	'BEGINNING AT THE FLORIDA STATE LINE AND EXTENDING SOUTH OF BAY BRANCH RD.\n' +
	'Total Bid: $1,567,683.83\n';

function mockAi(response: unknown): WorkersAi {
	return {
		async run() {
			return response;
		}
	};
}

function mockAiSequence(responses: unknown[]): WorkersAi {
	let idx = 0;
	return {
		async run() {
			const response = responses[Math.min(idx, responses.length - 1)];
			idx += 1;
			return response;
		}
	};
}

function evidence(text = BASE_TEXT): EvidencePage[] {
	return [
		{
			pdf_index: 0,
			filename: 'contract.pdf',
			page_number: 2,
			page_label: 'Proposal',
			text
		}
	];
}

describe('mergeAiExtraction', () => {
	it('fills deterministic gaps when AI supplies source page evidence', () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);

		const applied = mergeAiExtraction(v2, {
			fields: {
				route_designation: {
					value: 'SR 11',
					confidence: 0.92,
					source_pdf_index: 0,
					source_filename: 'contract.pdf',
					source_page: 2
				}
			},
			bid_items: [],
			production_mixes: [],
			roadway_log_events: [],
			warnings: []
		});

		expect(applied).toBe(true);
		expect(v2.route_designation.value).toBe('SR 11');
		expect(v2.route_designation.confidence).toBe('medium');
		expect(v2.route_designation.source).toBe('ai:contract.pdf:p2');
	});

	it('upgrades confidence when AI agrees with deterministic extraction', () => {
		const v2 = parseGdotDocumentsV2([BASE_TEXT]);

		const applied = mergeAiExtraction(v2, {
			fields: {
				route_designation: {
					value: 'SR 11',
					confidence: 0.91,
					source_pdf_index: 0,
					source_filename: 'contract.pdf',
					source_page: 2
				}
			},
			bid_items: [],
			production_mixes: [],
			roadway_log_events: [],
			warnings: []
		});

		expect(applied).toBe(true);
		expect(v2.route_designation.value).toBe('SR 11');
		expect(v2.route_designation.confidence).toBe('high');
		expect(v2.route_designation.source).toContain('deterministic+ai:contract.pdf:p2');
	});

	it('retains deterministic route-critical fields on conflict', () => {
		const v2 = parseGdotDocumentsV2([BASE_TEXT]);

		const applied = mergeAiExtraction(v2, {
			fields: {
				route_designation: {
					value: 'SR 99',
					confidence: 0.95,
					source_pdf_index: 0,
					source_filename: 'contract.pdf',
					source_page: 2
				}
			},
			bid_items: [],
			production_mixes: [],
			roadway_log_events: [],
			warnings: []
		});

		expect(applied).toBe(false);
		expect(v2.route_designation.value).toBe('SR 11');
		expect(v2.warnings.some((w) => w.includes('route_designation differs'))).toBe(true);
	});

	it('rejects AI scalar fields without source page evidence', () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);

		const applied = mergeAiExtraction(v2, {
			fields: {
				route_designation: { value: 'SR 11', confidence: 0.99 }
			},
			bid_items: [],
			production_mixes: [],
			roadway_log_events: [],
			warnings: []
		});

		expect(applied).toBe(false);
		expect(v2.route_designation.value).toBe('SR 11');
		expect(v2.route_designation.confidence).toBe('low');
	});
});

describe('runAiProjectExtraction', () => {
	it('falls back cleanly when AI binding is unavailable', async () => {
		const v2 = parseGdotDocumentsV2([BASE_TEXT]);

		const diag = await runAiProjectExtraction(undefined, evidence(), v2);

		expect(diag).toMatchObject({
			attempted: true,
			applied: false,
			outcome: 'binding-unavailable',
			reason: 'ai-binding-unavailable'
		});
	});

	it('applies schema-valid AI extraction', async () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);
		const ai = mockAi({
			response: {
				fields: {
					contract_id: {
						value: 'B1CBA2502850-0',
						confidence: 0.9,
						source_pdf_index: 0,
						source_filename: 'contract.pdf',
						source_page: 2
					}
				},
				bid_items: [],
				production_mixes: [],
				roadway_log_events: [],
				warnings: []
			}
		});

		const diag = await runAiProjectExtraction(ai, evidence(), v2);

		expect(diag.outcome).toBe('applied');
		expect(v2.contract_id.value).toBe('B1CBA2502850-0');
		expect(v2.contract_id.source).toBe('ai:contract.pdf:p2');
	});

	it('reads nested Workers AI response wrapper shapes', async () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);
		const ai = mockAi({
			result: {
				response: JSON.stringify({
					fields: {
						contract_id: {
							value: 'B1CBA2502850-0',
							confidence: 0.9,
							source_pdf_index: 0,
							source_filename: 'contract.pdf',
							source_page: 2
						}
					},
					bid_items: [],
					production_mixes: [],
					roadway_log_events: [],
					warnings: []
				})
			}
		});

		const diag = await runAiProjectExtraction(ai, evidence(), v2);

		expect(diag.outcome).toBe('applied');
		expect(v2.contract_id.value).toBe('B1CBA2502850-0');
	});

	it('extracts a valid JSON object from a long response with extra brace blocks', async () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);
		const ai = mockAi({
			response:
				'Here is the object shape {not valid json}.\n\n' +
				JSON.stringify({
					fields: {
						contract_id: {
							value: 'B1CBA2502850-0',
							confidence: 0.9,
							source_pdf_index: 0,
							source_filename: 'contract.pdf',
							source_page: 2
						}
					},
					bid_items: [],
					production_mixes: [],
					roadway_log_events: [],
					warnings: []
				}) +
				'\n\nAdditional explanation {also not json}.'
		});

		const diag = await runAiProjectExtraction(ai, evidence(), v2);

		expect(diag.outcome).toBe('applied');
		expect(v2.contract_id.source).toBe('ai:contract.pdf:p2');
	});

	it('extracts a valid JSON object from fenced text with leading prose', async () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);
		const ai = mockAi({
			response:
				'```json\n' +
				'Before the real object {bad}\n' +
				JSON.stringify({
					fields: {
						contract_id: {
							value: 'B1CBA2502850-0',
							confidence: 0.9,
							source_pdf_index: 0,
							source_filename: 'contract.pdf',
							source_page: 2
						}
					},
					bid_items: [],
					production_mixes: [],
					roadway_log_events: [],
					warnings: []
				}) +
				'\n```'
		});

		const diag = await runAiProjectExtraction(ai, evidence(), v2);

		expect(diag.outcome).toBe('applied');
		expect(v2.contract_id.source).toBe('ai:contract.pdf:p2');
	});

	it('retries with json_object mode when schema mode returns no JSON', async () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);
		const ai = mockAiSequence([
			{ response: 'I cannot parse that document.' },
			{
				response: {
					fields: {
						contract_id: {
							value: 'B1CBA2502850-0',
							confidence: 0.9,
							source_pdf_index: 0,
							source_filename: 'contract.pdf',
							source_page: 2
						}
					},
					bid_items: [],
					production_mixes: [],
					roadway_log_events: [],
					warnings: []
				}
			}
		]);

		const diag = await runAiProjectExtraction(ai, evidence(), v2);

		expect(diag.outcome).toBe('applied');
		expect(v2.contract_id.source).toBe('ai:contract.pdf:p2');
	});

	it('applies usable staged output even when later stages return no JSON', async () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);
		const ai = mockAiSequence([
			{
				response: {
					fields: {
						contract_id: {
							value: 'B1CBA2502850-0',
							confidence: 0.9,
							source_pdf_index: 0,
							source_filename: 'contract.pdf',
							source_page: 2
						}
					},
					warnings: []
				}
			},
			{ response: 'The item table is too large to parse.' },
			{ response: 'Still no item JSON.' },
			{ response: 'The roadway log is not present.' },
			{ response: 'Still no roadway JSON.' }
		]);

		const diag = await runAiProjectExtraction(ai, evidence(), v2);

		expect(diag.outcome).toBe('applied');
		expect(v2.contract_id.source).toBe('ai:contract.pdf:p2');
	});

	it('keeps staged model outputs bounded', async () => {
		const v2 = parseGdotDocumentsV2(['Contract Schedule\nTotal Bid: $1,000.00']);
		const inputs: Array<Record<string, unknown>> = [];
		const ai: WorkersAi = {
			async run(_model, input) {
				inputs.push(input);
				return {
					response: {
						fields: {},
						bid_items: [],
						production_mixes: [],
						roadway_log_events: [],
						warnings: []
					}
				};
			}
		};

		await runAiProjectExtraction(ai, evidence(), v2);

		expect(inputs.map((input) => input.max_tokens)).toEqual([2048, 3072, 3072]);
		expect(inputs.every((input) => input.temperature === 0.1)).toBe(true);
	});
});
