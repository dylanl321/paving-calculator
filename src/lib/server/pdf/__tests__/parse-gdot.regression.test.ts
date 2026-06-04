import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
	parseGdotDocuments,
	parseGdotDocumentsV2,
	mapMixType,
	detectDocumentType,
	toV1
} from '../parse-gdot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): string {
	return readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
}

describe('detectDocumentType', () => {
	it('detects contract summary', () => {
		const text = loadFixture('fixture-01-contract-summary.txt');
		expect(detectDocumentType(text)).toBe('contract_summary');
	});

	it('detects job setup', () => {
		const text = loadFixture('fixture-02-job-setup.txt');
		expect(detectDocumentType(text)).toBe('job_setup');
	});

	it('detects unknown document', () => {
		const text = loadFixture('fixture-04-unknown.txt');
		expect(detectDocumentType(text)).toBe('unknown');
	});
});

describe('mapMixType', () => {
	it('maps RECYC OGI to Open Graded Interlayer (OGI)', () => {
		expect(mapMixType('RECYC OGI')).toBe('Open Graded Interlayer (OGI)');
	});

	it('maps OGI MIX to Open Graded Interlayer (OGI)', () => {
		expect(mapMixType('OGI MIX')).toBe('Open Graded Interlayer (OGI)');
	});

	it('maps 9.5MM SUPERPAVE TYPE II to 9.5mm Superpave Type 2', () => {
		expect(mapMixType('9.5MM SUPERPAVE TYPE II')).toBe('9.5mm Superpave Type 2');
	});

	it('maps 9.5MM SUPERPAVE TYPE I to 9.5mm Superpave Type 1', () => {
		expect(mapMixType('9.5MM SUPERPAVE TYPE I')).toBe('9.5mm Superpave Type 1');
	});

	it('maps 12.5MM SUPERPAVE to 12.5mm Superpave', () => {
		expect(mapMixType('12.5MM SUPERPAVE')).toBe('12.5mm Superpave');
	});

	it('maps PATCH MIX to Patching', () => {
		expect(mapMixType('PATCH MIX')).toBe('Patching');
	});

	it('maps LEVELING COURSE to Leveling', () => {
		expect(mapMixType('LEVELING COURSE')).toBe('Leveling');
	});

	it('maps SMA MIX to SMA (Stone Matrix Asphalt)', () => {
		expect(mapMixType('SMA MIX')).toBe('SMA (Stone Matrix Asphalt)');
	});

	it('maps 4.75MM to 4.75mm Superpave', () => {
		expect(mapMixType('4.75MM')).toBe('4.75mm Superpave');
	});

	it('maps POLYMER MODIFIED to Polymer Modified', () => {
		expect(mapMixType('POLYMER MODIFIED')).toBe('Polymer Modified');
	});

	it('returns null for null input', () => {
		expect(mapMixType(null)).toBe(null);
	});

	it('returns null for empty string', () => {
		expect(mapMixType('')).toBe(null);
	});

	it('returns null for unknown mix type', () => {
		expect(mapMixType('UNKNOWN SPECIAL MIX')).toBe(null);
	});
});

describe('parseGdotDocuments - fixture-01 (contract summary only)', () => {
	const text = loadFixture('fixture-01-contract-summary.txt');
	const result = parseGdotDocuments([text]);

	it('detects contract summary present', () => {
		expect(result.has_contract_summary).toBe(true);
	});

	it('detects job setup missing', () => {
		expect(result.has_job_setup).toBe(false);
	});

	it('extracts contract_id', () => {
		expect(result.contract_id).not.toBe(null);
		expect(result.contract_id).toBe('GDOT-2024-ATL-001');
	});

	it('extracts county', () => {
		expect(result.county).toBe('Fulton');
	});

	it('extracts contract_amount', () => {
		expect(result.contract_amount).toBe(2847550);
	});

	it('calculates total_length_ft from miles', () => {
		expect(result.total_length_ft).not.toBe(null);
		expect(Math.abs((result.total_length_ft ?? 0) - 5.505 * 5280)).toBeLessThan(1);
	});

	it('extracts correct number of bid items', () => {
		expect(result.bid_items.length).toBe(4);
	});

	it('parses first bid item as LUMP SUM', () => {
		expect(result.bid_items[0].unit).toBe('LUMP SUM');
		expect(result.bid_items[0].bid_amount).toBe(88990);
	});

	it('parses second bid item with SY unit', () => {
		expect(result.bid_items[1].unit).toBe('SY');
	});

	it('parses third bid item with TN unit and unit price', () => {
		expect(result.bid_items[2].unit).toBe('TN');
		expect(result.bid_items[2].unit_price).toBe(99.25);
	});

	it('parses fourth bid item with correct item_id', () => {
		expect(result.bid_items[3].item_id).toBe('415-0600');
	});

	it('derives milling scope', () => {
		expect(result.scopes).toContain('milling');
	});

	it('derives resurfacing scope', () => {
		expect(result.scopes).toContain('resurfacing');
	});

	it('derives traffic_control scope', () => {
		expect(result.scopes).toContain('traffic_control');
	});

	it('warns about missing job setup', () => {
		expect(result.warnings.some((w) => w.includes('Missing the Job Setup'))).toBe(true);
	});
});

describe('parseGdotDocuments - fixture-02 (job setup only)', () => {
	const text = loadFixture('fixture-02-job-setup.txt');
	const result = parseGdotDocuments([text]);

	it('detects job setup present', () => {
		expect(result.has_job_setup).toBe(true);
	});

	it('detects contract summary missing', () => {
		expect(result.has_contract_summary).toBe(false);
	});

	it('extracts job_number', () => {
		expect(result.job_number).toBe('J24-0847');
	});

	it('extracts contract_amount', () => {
		expect(result.contract_amount).toBe(2847550);
	});

	it('extracts customer_phone', () => {
		expect(result.customer_phone).toBe('(404) 555-1234');
	});

	it('extracts project_manager', () => {
		expect(result.project_manager).toBe('Mike Johnson');
	});

	it('extracts asphalt_supplier', () => {
		expect(result.asphalt_supplier).toBe('Atlanta Asphalt Co');
	});

	it('extracts correct number of production mixes', () => {
		expect(result.production_mixes.length).toBe(2);
	});

	it('first production mix matches OGI pattern', () => {
		expect(result.production_mixes[0].mix_name).toMatch(/OGI/i);
	});

	it('first production mix has correct type', () => {
		expect(result.production_mixes[0].mix_type).toBe('Open Graded Interlayer (OGI)');
	});

	it('first production mix has correct takeoff_tonnage', () => {
		expect(result.production_mixes[0].takeoff_tonnage).toBe(4084);
	});

	it('second production mix matches 9.5 pattern', () => {
		expect(result.production_mixes[1].mix_name).toMatch(/9\.5/i);
	});

	it('warns about missing contract summary', () => {
		expect(result.warnings.some((w) => w.includes('Missing the Contract Summary'))).toBe(true);
	});
});

describe('parseGdotDocuments - fixture-04 (unknown document)', () => {
	const text = loadFixture('fixture-04-unknown.txt');
	const result = parseGdotDocuments([text]);

	it('warns about unrecognized document', () => {
		expect(result.warnings.some((w) => w.includes('Could not recognize'))).toBe(true);
	});

	it('has_contract_summary is false', () => {
		expect(result.has_contract_summary).toBe(false);
	});

	it('has_job_setup is false', () => {
		expect(result.has_job_setup).toBe(false);
	});
});

describe('parseGdotDocuments - fixture-05 (contract with sections)', () => {
	const text = loadFixture('fixture-05-contract-with-sections.txt');
	const result = parseGdotDocuments([text]);

	it('extracts county', () => {
		expect(result.county).toBe('Cobb');
	});

	it('has items marked as alternate', () => {
		const hasAlternate = result.bid_items.some((item) => item.is_alternate === true);
		expect(hasAlternate).toBe(true);
	});

	it('has items not marked as alternate', () => {
		const hasNonAlternate = result.bid_items.some((item) => item.is_alternate === false);
		expect(hasNonAlternate).toBe(true);
	});

	it('derives resurfacing scope', () => {
		expect(result.scopes).toContain('resurfacing');
	});
});

describe('parseGdotDocumentsV2 - fixture-01 smoke tests', () => {
	const text = loadFixture('fixture-01-contract-summary.txt');
	const v1 = parseGdotDocuments([text]);
	const v2 = parseGdotDocumentsV2([text]);

	it('v2 contract_id.value matches v1', () => {
		expect(v2.contract_id.value).toBe(v1.contract_id);
	});

	it('v2 county.confidence is medium or high', () => {
		expect(['medium', 'high']).toContain(v2.county.confidence);
	});
});

describe('parseGdotDocumentsV2 - fixture-02 smoke tests', () => {
	const text = loadFixture('fixture-02-job-setup.txt');
	const v2 = parseGdotDocumentsV2([text]);

	it('v2 job_number.value is correct', () => {
		expect(v2.job_number.value).toBe('J24-0847');
	});

	it('v2 project_manager.confidence is high', () => {
		expect(v2.project_manager.confidence).toBe('high');
	});

	it('v2 production_mixes has correct count', () => {
		expect(v2.production_mixes.length).toBe(2);
	});
});

describe('toV1 round-trip test', () => {
	const text = loadFixture('fixture-01-contract-summary.txt');
	const v1Direct = parseGdotDocuments([text]);
	const v2 = parseGdotDocumentsV2([text]);
	const v1FromV2 = toV1(v2);

	it('contract_id matches', () => {
		expect(v1FromV2.contract_id).toBe(v1Direct.contract_id);
	});

	it('county matches', () => {
		expect(v1FromV2.county).toBe(v1Direct.county);
	});

	it('contract_amount matches', () => {
		expect(v1FromV2.contract_amount).toBe(v1Direct.contract_amount);
	});

	it('total_length_ft matches', () => {
		expect(v1FromV2.total_length_ft).toBe(v1Direct.total_length_ft);
	});

	it('has_contract_summary matches', () => {
		expect(v1FromV2.has_contract_summary).toBe(v1Direct.has_contract_summary);
	});

	it('has_job_setup matches', () => {
		expect(v1FromV2.has_job_setup).toBe(v1Direct.has_job_setup);
	});

	it('bid_items count matches', () => {
		expect(v1FromV2.bid_items.length).toBe(v1Direct.bid_items.length);
	});

	it('route_designation round-trips', () => {
		expect(v1FromV2.route_designation).toBe(v2.route_designation.value);
	});
});

describe('route_designation extraction', () => {
	it('extracts SR route from fixture-01 headline ("ON SR 14")', () => {
		const result = parseGdotDocuments([loadFixture('fixture-01-contract-summary.txt')]);
		expect(result.route_designation).toBe('SR 14');
	});

	it('extracts SR route from fixture-05 headline ("ON SR 92")', () => {
		const result = parseGdotDocuments([loadFixture('fixture-05-contract-with-sections.txt')]);
		expect(result.route_designation).toBe('SR 92');
	});

	it('normalises "STATE ROUTE 13" to "SR 13"', () => {
		const text =
			'Contract Schedule\nContract ID: T-1\nCounties: Hall\nNET LENGTH OF PROJECT 1.000 MILES\n' +
			'1.000 MILES OF RESURFACING ON STATE ROUTE 13 (NOTICE)\nTotal Bid: $100,000.00\n';
		expect(parseGdotDocuments([text]).route_designation).toBe('SR 13');
	});

	it('normalises an interstate to "I-85"', () => {
		const text =
			'Contract Schedule\nContract ID: T-2\nCounties: Fulton\nNET LENGTH OF PROJECT 1.000 MILES\n' +
			'1.000 MILES OF RESURFACING ON I-85 (NOTICE)\nTotal Bid: $100,000.00\n';
		expect(parseGdotDocuments([text]).route_designation).toBe('I-85');
	});

	it('leaves route_designation null when no route is present', () => {
		const text =
			'Contract Schedule\nContract ID: T-3\nCounties: Bibb\nNET LENGTH OF PROJECT 1.000 MILES\n' +
			'1.000 MILES OF RESURFACING AND RELATED WORK (NOTICE)\nTotal Bid: $100,000.00\n';
		expect(parseGdotDocuments([text]).route_designation).toBe(null);
	});

	it('extracts begin/end termini from a "FROM ... TO ..." headline', () => {
		const text =
			'Contract Schedule\nContract ID: T-4\nCounties: Hall\nNET LENGTH OF PROJECT 2.000 MILES\n' +
			'2.000 MILES OF RESURFACING ON SR 13 FROM SR 9 TO HALL COUNTY LINE (NOTICE)\nTotal Bid: $200,000.00\n';
		const result = parseGdotDocuments([text]);
		expect(result.begin_terminus).toBe('SR 9');
		expect(result.end_terminus).toBe('HALL COUNTY LINE');
	});

	it('extracts termini from a "BEGINNING AT ... AND EXTENDING ... " headline', () => {
		const text =
			'Contract Schedule\nContract ID: T-6\nCounties: Lowndes\nNET LENGTH OF PROJECT 5.505 MILES\n' +
			'5.505 MILES OF MILLING, PLANT MIX RESURFACING AND SHOULDER REHABILITATION ON SR 11 ' +
			'BEGINNING AT THE FLORIDA STATE LINE AND EXTENDING SOUTH OF BAY BRANCH RD (NOTICE)\n' +
			'Total Bid: $1,567,683.83\n';
		const result = parseGdotDocuments([text]);
		expect(result.route_designation).toBe('SR 11');
		expect(result.begin_terminus).toBe('THE FLORIDA STATE LINE');
		expect(result.end_terminus).toBe('BAY BRANCH RD');
	});

	it('extracts termini from a "BEGINS AT ... ENDS AT ..." headline', () => {
		const text =
			'Contract Schedule\nContract ID: T-7\nCounties: Bibb\nNET LENGTH OF PROJECT 1.000 MILES\n' +
			'1.000 MILES OF RESURFACING ON SR 22 BEGINS AT MAIN ST ENDS AT OAK AVE (NOTICE)\n' +
			'Total Bid: $100,000.00\n';
		const result = parseGdotDocuments([text]);
		expect(result.begin_terminus).toBe('MAIN ST');
		expect(result.end_terminus).toBe('OAK AVE');
	});

	it('strips trailing boilerplate from a BEGINNING/EXTENDING end terminus', () => {
		const text =
			'Contract Schedule\nContract ID: T-8\nCounties: Lowndes\nNET LENGTH OF PROJECT 3.000 MILES\n' +
			'3.000 MILES OF RESURFACING ON SR 7 BEGINNING AT US 84 AND EXTENDING TO CLYATTVILLE RD ' +
			'(E) Bidders\nTotal Bid: $300,000.00\n';
		const result = parseGdotDocuments([text]);
		expect(result.begin_terminus).toBe('US 84');
		// Must not leak "(E) Bidders ... Total Bid".
		expect(result.end_terminus).toBe('CLYATTVILLE RD');
	});

	it('V2 termini are low confidence and survive the V1 round-trip', () => {
		const text =
			'Contract Schedule\nContract ID: T-9\nCounties: Lowndes\nNET LENGTH OF PROJECT 5.505 MILES\n' +
			'5.505 MILES OF RESURFACING ON SR 11 BEGINNING AT THE FLORIDA STATE LINE AND ' +
			'EXTENDING SOUTH OF BAY BRANCH RD (NOTICE)\nTotal Bid: $1,000,000.00\n';
		const v2 = parseGdotDocumentsV2([text]);
		expect(v2.begin_terminus.value).toBe('THE FLORIDA STATE LINE');
		expect(v2.begin_terminus.confidence).toBe('low');
		const v1 = toV1(v2);
		expect(v1.begin_terminus).toBe('THE FLORIDA STATE LINE');
		expect(v1.end_terminus).toBe('BAY BRANCH RD');
	});

	it('leaves termini null when there is no FROM/TO phrasing', () => {
		const result = parseGdotDocuments([loadFixture('fixture-01-contract-summary.txt')]);
		expect(result.begin_terminus).toBe(null);
		expect(result.end_terminus).toBe(null);
	});
});

describe('parseGdotDocumentsV2 - geographic field confidence', () => {
	it('route_designation is medium confidence when found by regex', () => {
		const v2 = parseGdotDocumentsV2([loadFixture('fixture-01-contract-summary.txt')]);
		expect(v2.route_designation.value).toBe('SR 14');
		expect(v2.route_designation.confidence).toBe('medium');
	});

	it('pushes the header zone to lowConfidenceZones when route is missing', () => {
		const text =
			'Contract Schedule\nContract ID: T-5\nCounties: Bibb\nNET LENGTH OF PROJECT 1.000 MILES\n' +
			'Schedule of Items\nProposal Line Number Item ID Description Dollars Cents\n' +
			'0010 150-1000 TRAFFIC CONTROL M006670 LUMP SUM 1000.00\nTotal Bid: $1,000.00\n';
		const v2 = parseGdotDocumentsV2([text]);
		expect(v2.route_designation.value).toBe(null);
		expect(v2.lowConfidenceZones.length).toBeGreaterThan(0);
	});
});
