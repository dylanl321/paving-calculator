import { getDocument } from 'pdfjs-serverless';
import { extractZones } from './zone-extractor.js';
import { parseTableZone, applyBidQuantities } from './table-parser.js';
import { field, mergeField, type ParsedField, type FieldConfidence } from './confidence.js';

/**
 * Parser for GDOT-style paving documents:
 *  - "JOB SETUP" form (internal job set-up sheet): customer/owner, contract
 *    amount, dates, work type, PM, asphalt supplier, production goals.
 *  - "CONTRACT SUMMARY" (GDOT proposal / schedule of items): contract id,
 *    project number, county, total bid, and the per-line schedule of items.
 *
 * Everything is best-effort: any field we cannot find is left undefined so the
 * caller can prefill what it has and let the user fill the rest. We never invent
 * data — only values present in the source text are returned.
 */

export interface ParsedBidItem {
	line_number: string | null;
	item_id: string | null;
	description: string;
	quantity: number | null;
	unit: string | null;
	unit_price: number | null;
	bid_amount: number | null;
	section: string | null;
	is_alternate: boolean;
	selected: boolean;
}

export interface ParsedProductionMix {
	mix_name: string;
	/** Mapped GDOT/Superpave mix type (e.g. "Open Graded Interlayer (OGI)"). */
	mix_type: string | null;
	unit: string | null;
	/** State/customer-allotted contract quantity (from the bid-quantity table). */
	bid_quantity: number | null;
	/** Our internal production target/takeoff (from the production-goals table). */
	takeoff_tonnage: number | null;
	quantity_per_day: number | null;
	est_days: number | null;
	/** Contract unit price ($/unit) from the matching asphalt bid item. */
	contract_unit_price: number | null;
}

export type GdotDocumentType = 'contract_summary' | 'job_setup' | 'unknown';

export interface ParsedGdotJob {
	// Identity
	name: string | null;
	job_number: string | null;
	project_number: string | null;
	contract_id: string | null;
	county: string | null;
	// Contract
	work_type: string | null;
	contract_type: string | null;
	contract_amount: number | null;
	retainage_pct: number | null;
	est_start_date: string | null;
	completion_date: string | null;
	// Customer / owner
	customer_name: string | null;
	customer_address: string | null;
	customer_contact: string | null;
	customer_phone: string | null;
	customer_email: string | null;
	owner_name: string | null;
	owner_address: string | null;
	// Project management
	project_manager: string | null;
	asphalt_supplier: string | null;
	// Roadway / config
	total_length_ft: number | null;
	location_description: string | null;
	/** Route designation (e.g. "SR 13", "I-85", "CR 124") used to fetch GDOT route geometry. */
	route_designation: string | null;
	/** Begin terminus / starting point description (e.g. "FROM SR 9"). */
	begin_terminus: string | null;
	/** End terminus / ending point description (e.g. "TO HALL COUNTY LINE"). */
	end_terminus: string | null;
	// Multi-scope tags (e.g. ["milling","resurfacing","shoulder_rehab"])
	scopes: string[];
	// Line items
	bid_items: ParsedBidItem[];
	// Production goals / mixes
	production_mixes: ParsedProductionMix[];
	// Which GDOT document types were detected across the uploaded files.
	detected_documents: GdotDocumentType[];
	// True once both the contract summary and job setup have been seen.
	has_contract_summary: boolean;
	has_job_setup: boolean;
	// Diagnostics
	warnings: string[];
}

const FT_PER_MILE = 5280;

/**
 * Normalise a captured route number into a compact designation (e.g. "SR 13").
 * Returns null when the capture is empty, so we never invent a route.
 */
function normaliseRoute(num: string | null, prefix: 'SR' | 'I' | 'US' | 'CR'): string | null {
	if (!num) return null;
	const n = num.trim().toUpperCase();
	if (!n) return null;
	return prefix === 'I' ? `I-${n}` : `${prefix} ${n}`;
}

/**
 * Clean a captured terminus phrase: collapse whitespace, strip a trailing
 * boilerplate tail, and drop an empty result. Returns null when nothing useful
 * remains (so we never store junk like "(NOTICE) Total Bid").
 */
function cleanTerminus(raw: string | undefined): string | null {
	if (!raw) return null;
	let s = raw.replace(/\s+/g, ' ').trim();
	// Cut at the first boilerplate sentinel if the capture overran.
	const stop = s.search(/\s*\(|\s+NOTICE\b|\s+Bidders\b/i);
	if (stop > 0) s = s.slice(0, stop).trim();
	// Trim a dangling conjunction/preposition left by a lazy capture.
	s = s.replace(/\s+(?:AND|TO|OF)$/i, '').trim();
	return s === '' ? null : s;
}

/**
 * Extract begin/end termini from a GDOT project headline. Handles the common
 * phrasings (no invented data — returns null when no pattern matches):
 *   - "FROM <X> TO <Y>"
 *   - "BEGINNING AT <X> AND EXTENDING ... <Y>"
 *   - "BEGINS AT <X> ... END(S|ING) AT <Y>"
 */
function extractTermini(text: string): { begin: string; end: string } | null {
	const patterns: RegExp[] = [
		// "BEGINNING AT <X> AND EXTENDING <...connector...> <Y>"
		/\bBEGINNING\s+AT\s+(.+?)\s+AND\s+EXTENDING\s+(?:TO\s+|NORTH\s+OF\s+|SOUTH\s+OF\s+|EAST\s+OF\s+|WEST\s+OF\s+|NORTH\s+TO\s+|SOUTH\s+TO\s+)?(.+?)(?:\s*\(|\s+NOTICE|\s+Bidders|[.;]|\s{2,}|$)/i,
		// "BEGINS AT <X> ... ENDS/ENDING AT <Y>"
		/\bBEGIN(?:S|NING)?\s+AT\s+(.+?)\s+(?:AND\s+)?END(?:S|ING)?\s+AT\s+(.+?)(?:\s*\(|\s+NOTICE|\s+Bidders|[.;]|\s{2,}|$)/i,
		// "FROM <X> TO <Y>"
		/\bFROM\s+(.+?)\s+TO\s+(.+?)(?:\s*\(|\s+NOTICE|\s+Bidders|[.;]|\s{2,}|$)/i
	];
	for (const re of patterns) {
		const m = text.match(re);
		if (m) {
			const begin = cleanTerminus(m[1]);
			const end = cleanTerminus(m[2]);
			if (begin && end) return { begin, end };
		}
	}
	return null;
}

function emptyResult(): ParsedGdotJob {
	return {
		name: null,
		job_number: null,
		project_number: null,
		contract_id: null,
		county: null,
		work_type: null,
		contract_type: null,
		contract_amount: null,
		retainage_pct: null,
		est_start_date: null,
		completion_date: null,
		customer_name: null,
		customer_address: null,
		customer_contact: null,
		customer_phone: null,
		customer_email: null,
		owner_name: null,
		owner_address: null,
		project_manager: null,
		asphalt_supplier: null,
		total_length_ft: null,
		location_description: null,
		route_designation: null,
		begin_terminus: null,
		end_terminus: null,
		scopes: [],
		bid_items: [],
		production_mixes: [],
		detected_documents: [],
		has_contract_summary: false,
		has_job_setup: false,
		warnings: []
	};
}

/**
 * Maps a free-text mix name (from the job-setup tables or bid items) to a
 * canonical GDOT/Superpave mix type used by the configuration UI. Returns null
 * when no confident mapping exists, so we never invent a spec.
 */
export function mapMixType(name: string | null): string | null {
	if (!name) return null;
	const n = name.toUpperCase();
	if (/\bOGI\b|OPEN GRADED|CRACK RELIEF INTERLAYER/.test(n)) return 'Open Graded Interlayer (OGI)';
	if (/PATCH/.test(n)) return 'Patching';
	if (/LEVEL/.test(n)) return 'Leveling';
	if (/SMA|STONE MATRIX/.test(n)) return 'SMA (Stone Matrix Asphalt)';
	if (/POLYMER/.test(n)) return 'Polymer Modified';
	if (/4\.75/.test(n)) return '4.75mm Superpave';
	if (/12\.5/.test(n)) return '12.5mm Superpave';
	if (/9\.5/.test(n)) {
		if (/TYPE\s*(II|2)\b/.test(n) || /\bII\b/.test(n)) return '9.5mm Superpave Type 2';
		if (/TYPE\s*(I|1)\b/.test(n)) return '9.5mm Superpave Type 1';
		return '9.5mm Superpave Type 2';
	}
	if (/SUPERPAVE/.test(n)) return '9.5mm Superpave Type 2';
	return null;
}

/**
 * Classify a single document's extracted text as a GDOT contract summary, an
 * internal job-setup form, or unknown.
 */
export function detectDocumentType(text: string): GdotDocumentType {
	if (/JOB SET-?UP FORM/i.test(text) || /HEAVYBID #/i.test(text) || /PRODUCTION GOALS/i.test(text)) {
		return 'job_setup';
	}
	if (
		/Contract Schedule|Proposal ID|Schedule of Items|Total Bid:|PROPOSAL INDEX/i.test(text)
	) {
		return 'contract_summary';
	}
	return 'unknown';
}

/** Extract plain text from a PDF (works in the Workers runtime via pdfjs-serverless). */
export async function pdfToText(bytes: ArrayBuffer): Promise<string> {
	const doc = await getDocument({
		data: new Uint8Array(bytes),
		useSystemFonts: true,
		// Workers has no DOM/canvas; disabling these avoids touching browser-only globals.
		disableFontFace: true,
		isEvalSupported: false
	}).promise;

	const pages: string[] = [];
	for (let i = 1; i <= doc.numPages; i++) {
		const page = await doc.getPage(i);
		const content = await page.getTextContent();
		const text = content.items
			.map((item: unknown) => (item && typeof item === 'object' && 'str' in item ? (item as { str: string }).str : ''))
			.join(' ');
		pages.push(text);
	}
	return pages.join('\n');
}

function toNumber(raw: string | null | undefined): number | null {
	if (raw == null) return null;
	const cleaned = raw.replace(/[$,\s]/g, '');
	if (cleaned === '') return null;
	const n = Number(cleaned);
	return Number.isFinite(n) ? n : null;
}

function firstMatch(text: string, re: RegExp): string | null {
	const m = re.exec(text);
	return m ? (m[1] ?? '').trim() || null : null;
}

/**
 * Parse the internal "JOB SETUP" form. The extracted text is largely a flat
 * sequence of label / value pairs separated by tabs or newlines.
 */
function parseJobSetup(text: string, result: ParsedGdotJob): boolean {
	if (!/JOB SET-?UP FORM/i.test(text) && !/JOB NUMBER/i.test(text)) return false;

	// The extracted text is largely flat (tabs/newlines collapsed to spaces), so
	// each field is bounded by the label of the next known field.
	result.job_number = result.job_number ?? firstMatch(text, /JOB NUMBER\s+(\S+)/i);
	result.name = result.name ?? firstMatch(text, /JOB NAME\s+(.+?)\s+(?:CREDIT|CUSTOMER)/i);

	result.customer_name = firstMatch(text, /CUSTOMER\s+(.+?)\s+(?:APPROVED|CUSTOMER ADDRESS)/i);
	result.customer_address = firstMatch(text, /CUSTOMER ADDRESS\s+(.+?)\s+(?:CITY|CONTACT)/i);
	result.customer_contact = firstMatch(text, /CONTACT\s+(.+?)\s+(?:PHONE|EMAIL)/i);
	result.customer_phone = firstMatch(text, /PHONE\s+(\([0-9]{3}\)\s*[0-9-]+)/i);
	result.customer_email = firstMatch(text, /EMAIL\s+([^\s]+@[^\s]+)/i);

	result.owner_name = firstMatch(text, /\bOWNER\s+(.+?)\s+(?:OWNER ADDRESS)/i);
	result.owner_address = firstMatch(text, /OWNER ADDRESS\s+(.+?)\s+(?:CITY|CONTRACT)/i);

	result.contract_amount = result.contract_amount
		?? toNumber(firstMatch(text, /CONTRACT AMOUNT\s+([\d,]+\.\d{2})/i));
	result.est_start_date = firstMatch(text, /EST START DATE\s+([0-9/]+)/i);
	result.completion_date = result.completion_date
		?? firstMatch(text, /COMPLETION DATE\s+([0-9/]+)/i);

	const retain = firstMatch(text, /RETAINAGE\s*\(%\)\s+([\d.]+)\s*%/i);
	result.retainage_pct = retain != null ? toNumber(retain) : result.retainage_pct;

	result.work_type = result.work_type ?? firstMatch(text, /WORK TYPE\s+(.+?)\s+(?:CONTRACT PLAN|CONTRACT TYPE)/i);
	result.contract_type = firstMatch(text, /CONTRACT TYPE\s+(.+?)\s+(?:QUOTE PLAN|BONDED)/i);
	result.project_manager = firstMatch(text, /PROJECT MANAGER\s+(.+?)\s+(?:ASPHALT SUPPLIER)/i);
	result.asphalt_supplier = firstMatch(text, /ASPHALT SUPPLIER\s+(.+?)\s+(?:GAB VENDOR|GAB QUARRY|ASPHALT HAUL)/i);

	const mixes = parseProductionMixes(text);
	if (mixes.length > 0) result.production_mixes = mixes;

	return true;
}

/**
 * Parse the Job Setup mix tables and merge them by mix name:
 *  - "TYPICAL (GAB,B,B,T) UNIT BID QUANTITY" block: rows of "<name> <unit> <qty>",
 *    e.g. "RECYC OGI TN 4,755".
 *  - "PRODUCTION GOALS" block ("PRODUCT TAKEOFF QTY(TN) QUANTITY PER DAY
 *    TIME (DAYS)"): rows of "<name> <takeoff> <perDay> <days>", e.g.
 *    "RECYC OGI 4,084 1021 4.0".
 *
 * Text is flattened (mergePages), so we slice each block then regex-scan rows.
 */
function parseProductionMixes(text: string): ParsedProductionMix[] {
	const flat = text.replace(/\s+/g, ' ').trim();
	const byName = new Map<string, ParsedProductionMix>();
	const order: string[] = [];

	const upsert = (name: string): ParsedProductionMix => {
		const key = name.toUpperCase();
		let mix = byName.get(key);
		if (!mix) {
			mix = {
				mix_name: name,
				mix_type: mapMixType(name),
				unit: null,
				bid_quantity: null,
				takeoff_tonnage: null,
				quantity_per_day: null,
				est_days: null,
				contract_unit_price: null
			};
			byName.set(key, mix);
			order.push(key);
		}
		return mix;
	};

	// --- Bid quantity block ---
	const bidHeader = /TYPICAL\s*\(GAB[^)]*\)\s*UNIT\s*BID QUANTITY/i.exec(flat);
	if (bidHeader) {
		const bidStart = bidHeader.index + bidHeader[0].length;
		const bidEnd = flat.search(/\bPRODUCT\b\s+TAKEOFF/i);
		const block = flat.slice(
			bidStart,
			bidEnd > bidStart ? bidEnd : Math.min(flat.length, bidStart + 400)
		);
		// Rows: "<name with letters/parens/spaces> <UNIT> <qty>"
		const rowRe = /([A-Z][A-Z0-9 .()/-]*?)\s+(TN|SY|GL|LF|LM|GLM|EA|AC|LB|TON|TONS)\s+([\d,]+(?:\.\d+)?)/gi;
		for (let m = rowRe.exec(block); m; m = rowRe.exec(block)) {
			const name = m[1].replace(/\s+/g, ' ').trim();
			if (/^(TYPICAL|UNIT|BID|PRODUCT)$/i.test(name)) continue;
			const mix = upsert(name);
			mix.unit = mix.unit ?? m[2].toUpperCase();
			mix.bid_quantity = mix.bid_quantity ?? toNumber(m[3]);
		}
	}

	// --- Production goals block ---
	const goalsHeader = /PRODUCT\s+TAKEOFF QTY\(TN\)\s+QUANTITY PER DAY\s+TIME \(DAYS\)/i.exec(flat);
	if (goalsHeader) {
		const goalsStart = goalsHeader.index + goalsHeader[0].length;
		const goalsEnd = flat.search(/\bNOTES:/i);
		const block = flat.slice(
			goalsStart,
			goalsEnd > goalsStart ? goalsEnd : Math.min(flat.length, goalsStart + 400)
		);
		// Rows: "<name> <takeoff> <perDay> <days>" (days has a decimal, e.g. 4.0)
		const rowRe = /([A-Z][A-Z0-9 .()/-]*?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(\d+(?:\.\d+))/gi;
		for (let m = rowRe.exec(block); m; m = rowRe.exec(block)) {
			const name = m[1].replace(/\s+/g, ' ').trim();
			if (/^(PRODUCT|TAKEOFF|QUANTITY|TIME)$/i.test(name)) continue;
			const mix = upsert(name);
			mix.takeoff_tonnage = mix.takeoff_tonnage ?? toNumber(m[2]);
			mix.quantity_per_day = mix.quantity_per_day ?? toNumber(m[3]);
			mix.est_days = mix.est_days ?? toNumber(m[4]);
		}
	}

	return order.map((k) => byName.get(k)!);
}

/**
 * Parse the GDOT "CONTRACT SUMMARY" proposal. Pulls the contract id, project
 * number, county, total bid and the schedule of items.
 */
function parseContractSummary(text: string, result: ParsedGdotJob): boolean {
	const isContract = /Contract Schedule|Proposal ID|Total Bid/i.test(text);
	if (!isContract) return false;

	result.contract_id = result.contract_id
		?? firstMatch(text, /Contract ID:\s*([A-Z0-9-]+)/i)
		?? firstMatch(text, /Proposal ID\s*:\s*([A-Z0-9]{6,}-\d)/i);
	result.project_number = result.project_number
		?? firstMatch(text, /Project\(s\):\s*([A-Z0-9]+)/i)
		?? firstMatch(text, /Project No\.?\s*:\s*([A-Z0-9]+)/i)
		?? firstMatch(text, /P\.\s*I\.\s*NO:\s*([A-Z0-9]+)/i);
	result.county = result.county
		?? firstMatch(text, /Counties:\s*([A-Za-z]+)/i)
		?? firstMatch(text, /\b([A-Za-z]+)\s+COUNTY\b/i);

	result.contract_amount = result.contract_amount
		?? toNumber(firstMatch(text, /Total Bid:\s*\$?([\d,]+\.\d{2})/i));

	// Project description headline (e.g. "5.505 MILES OF MILLING, PLANT MIX
	// RESURFACING ...") doubles as a location/scope description.
	const headline = firstMatch(text, /([\d.]+\s+MILES OF .+?)\s+(?:\(E\)|Bidders|NOTICE)/i)
		?? firstMatch(text, /([\d.]+\s+MILES OF [^.]+)/i);
	if (headline) {
		result.location_description = result.location_description ?? headline.replace(/\s+/g, ' ').trim();
		if (!result.work_type && /RESURFAC/i.test(headline)) result.work_type = 'RESURFACING';
	}

	// Route designation (SR/State Route/US/I-Interstate/CR). Search the headline
	// first, then the whole text. Normalised to a compact form like "SR 13".
	const routeText = result.location_description ?? text;
	result.route_designation = result.route_designation
		?? normaliseRoute(firstMatch(routeText, /\b(?:STATE ROUTE|S\.?R\.?)\s*[-#]?\s*(\d+[A-Z]?)\b/i), 'SR')
		?? normaliseRoute(firstMatch(routeText, /\bINTERSTATE\s*[-#]?\s*(\d+)\b/i), 'I')
		?? normaliseRoute(firstMatch(routeText, /\bI-(\d+)\b/i), 'I')
		?? normaliseRoute(firstMatch(routeText, /\bU\.?S\.?\s*(?:ROUTE|HWY|HIGHWAY)?\s*[-#]?\s*(\d+)\b/i), 'US')
		?? normaliseRoute(firstMatch(routeText, /\b(?:COUNTY ROAD|C\.?R\.?)\s*[-#]?\s*(\d+[A-Z]?)\b/i), 'CR');

	// Begin / end termini. GDOT headlines phrase these several ways; try each
	// and stop captures at a paren, NOTICE/Bidders sentinel, punctuation, or a
	// run of whitespace so trailing boilerplate doesn't leak in.
	const termini = extractTermini(routeText);
	if (termini) {
		result.begin_terminus = result.begin_terminus ?? termini.begin;
		result.end_terminus = result.end_terminus ?? termini.end;
	}

	// Net length of project (miles -> feet).
	const lenMiles = toNumber(
		firstMatch(text, /NET LENGTH OF PROJECT\s+([\d.]+)/i)
			?? firstMatch(text, /GROSS LENGTH OF PROJECT\s+([\d.]+)/i)
	);
	if (lenMiles != null) result.total_length_ft = result.total_length_ft ?? lenMiles * FT_PER_MILE;

	result.bid_items = parseScheduleOfItems(text);
	if (result.bid_items.length === 0) {
		result.warnings.push('No schedule-of-items rows were detected in the contract summary.');
	}

	return true;
}

/**
 * Remove repeating page header/footer artifacts that can leak into a captured
 * item description when a pay item straddles a page break in the source PDF.
 */
function cleanItemDescription(body: string): string {
	return body
		.replace(/Contract Schedule.*?Docusign Envelope ID:\s*[A-Z0-9-]+/gi, ' ')
		.replace(/Proposal\s+Line\s+Number\s+Item ID.*?Dollars\s+Cents/gi, ' ')
		.replace(/Contract ID:\s*[A-Z0-9-]+/gi, ' ')
		.replace(/Project\(s\):\s*[A-Z0-9]+/gi, ' ')
		.replace(/Awarded Vendor:.*?(?:INC\.?|COMPANY)/gi, ' ')
		.replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ')
		.replace(/Page \d+ of \d+/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Parse the schedule-of-items rows from the (flattened) contract text.
 *
 * In the merged text each pay item appears as one run, e.g.:
 *   "0050 402-3103 7,771.000 RECYCLED ASPH CONC 9.5 MM SUPERPAVE, ... TN 99.25000 771,271.75"
 * or, for lump-sum items:
 *   "0025 150-1000 TRAFFIC CONTROL - M006670 LUMP SUM 88,990.00"
 *
 * We slice the text to the "Schedule of Items" region (between the first
 * "Proposal Line Number" header and "Total Bid:"), then split it on line-number
 * tokens (NNNN) that are immediately followed by an item id (NNN-NNNN).
 */
function parseScheduleOfItems(text: string): ParsedBidItem[] {
	const fullFlat = text.replace(/\s+/g, ' ').trim();
	let flat = fullFlat;

	// Restrict to the schedule region (drop the cover page / proposal index that
	// also contains NNNN and NNN-NNNN tokens). The schedule begins at the first
	// "Description Dollars Cents" header row and ends at "Total Bid:".
	const startIdx = flat.search(/Description\s+Dollars\s+Cents/i);
	if (startIdx >= 0) {
		const endIdx = flat.search(/Total Bid:/i);
		flat = flat.slice(startIdx, endIdx >= 0 ? endIdx + 40 : undefined);
	}

	// Track the active section by scanning the FULL text. Section headers look
	// like "0002 ALT 2 - ... SECTION $515,443.00" or "0003 ROADWAYSECTION $...".
	const sectionMarks: Array<{ at: number; name: string }> = [];
	const sectionRe = /(\d{4})\s+(ROADWAY|ALT\s*\d+[^$]*?)\s*SECTION\s*\$/gi;
	for (let m = sectionRe.exec(fullFlat); m; m = sectionRe.exec(fullFlat)) {
		const raw = m[2].replace(/\s+/g, ' ').trim().toUpperCase();
		const name = /^ALT\s*\d+/.test(raw) ? (/^(ALT\s*\d+)/.exec(raw)?.[1] ?? raw) : raw;
		sectionMarks.push({ at: m.index, name });
	}
	const sectionFor = (lineNumber: string, itemId: string): string | null => {
		const pos = fullFlat.indexOf(`${lineNumber} ${itemId}`);
		if (pos < 0) return null;
		let name: string | null = null;
		for (const mark of sectionMarks) {
			if (mark.at <= pos) name = mark.name;
			else break;
		}
		return name;
	};

	// Match each pay-item run: line number, item id, then a lazy body, ending at
	// either a tail (UNIT PRICE AMOUNT), a LUMP SUM AMOUNT, or before the next
	// line number / end of schedule.
	const itemRe =
		/(\d{4})\s+(\d{3}-\d{3,4})\s+(.*?)\s+(?:(LUMP SUM)\s+([\d,]+\.\d{2})|([A-Z]{1,5})\s+([\d,]+\.\d{4,5})\s+([\d,]+\.\d{2}))(?=\s+\d{4}\s+(?:\d{3}-\d{3,4}|(?:ROADWAY|ALT\s*\d+))|\s+Contract Schedule|\s+Total Bid|\s*$)/g;

	const items: ParsedBidItem[] = [];
	for (let m = itemRe.exec(flat); m; m = itemRe.exec(flat)) {
		const lineNumber = m[1];
		const itemId = m[2];
		let body = (m[3] ?? '').trim();

		let unit: string | null;
		let unitPrice: number | null;
		let bidAmount: number | null;
		let quantity: number | null = null;

		if (m[4]) {
			// Lump sum: no leading quantity token.
			unit = 'LUMP SUM';
			unitPrice = null;
			bidAmount = toNumber(m[5]);
		} else {
			unit = m[6];
			unitPrice = toNumber(m[7]);
			bidAmount = toNumber(m[8]);
			// The body starts with the approximate quantity (e.g. "7,771.000 ...").
			const qtyMatch = /^([\d,]+(?:\.\d+)?)\s+(.*)$/.exec(body);
			if (qtyMatch) {
				quantity = toNumber(qtyMatch[1]);
				body = qtyMatch[2];
			}
		}

		const description = cleanItemDescription(body) || `Item ${itemId}`;
		const section = sectionFor(lineNumber, itemId);
		const isAlternate = section != null && /^ALT/i.test(section);

		items.push({
			line_number: lineNumber,
			item_id: itemId,
			description,
			quantity,
			unit,
			unit_price: unitPrice,
			bid_amount: bidAmount,
			section,
			is_alternate: isAlternate,
			selected: !isAlternate
		});
	}

	// De-duplicate by line_number + item_id (sections repeat across pages).
	const seen = new Set<string>();
	return items.filter((it) => {
		const key = `${it.line_number}|${it.item_id}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Parse one or more GDOT PDFs (job setup and/or contract summary) into a single
 * merged prefill object. Pass the extracted text of each document; order does
 * not matter.
 */
export function parseGdotDocuments(texts: string[]): ParsedGdotJob {
	const result = emptyResult();
	let matchedAny = false;

	for (const text of texts) {
		const docType = detectDocumentType(text);
		if (docType !== 'unknown' && !result.detected_documents.includes(docType)) {
			result.detected_documents.push(docType);
		}
		if (parseContractSummary(text, result)) matchedAny = true;
		if (parseJobSetup(text, result)) matchedAny = true;
	}

	result.has_contract_summary = result.detected_documents.includes('contract_summary');
	result.has_job_setup = result.detected_documents.includes('job_setup');

	if (!matchedAny) {
		result.warnings.push(
			'Could not recognize this as a GDOT job-setup or contract-summary document.'
		);
	}

	// Both documents are needed for a complete picture: the contract summary
	// gives the schedule of items / allotted quantities and project geometry; the
	// job setup gives our production goals, customer info and supplier.
	if (matchedAny && !result.has_contract_summary) {
		result.warnings.push(
			'Missing the Contract Summary PDF — bid items, contract value and project geometry will be incomplete.'
		);
	}
	if (matchedAny && !result.has_job_setup) {
		result.warnings.push(
			'Missing the Job Setup PDF — production goals, customer/owner and asphalt supplier will be incomplete.'
		);
	}

	// Derive a name if the job-setup name was missing but we have a project number.
	if (!result.name && result.project_number) {
		result.name = result.county
			? `${result.project_number} — ${result.county} County`
			: result.project_number;
	}

	matchMixUnitPrices(result);
	result.scopes = deriveScopes(result);

	return result;
}

/**
 * Link each production mix to its asphalt bid item so we can carry the contract
 * unit price (the per-ton price the contract pays). Matching is by mapped mix
 * type and item-code family, choosing the SELECTED bid item with the closest
 * description, preferring tonnage (TN) items.
 */
function matchMixUnitPrices(result: ParsedGdotJob): void {
	const tnItems = result.bid_items.filter(
		(it) => it.unit && /^TN$/i.test(it.unit) && it.unit_price != null
	);
	if (tnItems.length === 0) return;

	const scoreItem = (mix: ParsedProductionMix, it: ParsedBidItem): number => {
		const id = it.item_id ?? '';
		const desc = (it.description ?? '').toUpperCase();
		const type = (mix.mix_type ?? '').toUpperCase();
		let score = 0;
		if (/OGI|OPEN GRADED/.test(type)) {
			if (/^415-/.test(id) || /OPEN GRADED/.test(desc)) score += 10;
		}
		if (/PATCH/.test(type) || /PATCH/.test(mix.mix_name.toUpperCase())) {
			if (/^402-18/.test(id) || /PATCH/.test(desc)) score += 10;
		}
		if (/9\.5/.test(type) || /9\.5/.test(mix.mix_name)) {
			if (/^402-31/.test(id) || /9\.5\s*MM/.test(desc)) score += 10;
		}
		if (/12\.5/.test(type) && /12\.5/.test(desc)) score += 10;
		if (/LEVEL/.test(type) && /LEVEL/.test(desc)) score += 8;
		// Prefer selected (base/awarded) items over unselected alternates.
		if (it.selected) score += 2;
		return score;
	};

	for (const mix of result.production_mixes) {
		let best: ParsedBidItem | null = null;
		let bestScore = 0;
		for (const it of tnItems) {
			const s = scoreItem(mix, it);
			if (s > bestScore) {
				bestScore = s;
				best = it;
			}
		}
		if (best && best.unit_price != null && bestScore >= 10) {
			mix.contract_unit_price = best.unit_price;
		}
	}
}

/**
 * Derive a set of lowercase scope tags from the contract headline and the
 * bid-item codes. Only tags supported by present evidence are returned (we do
 * not invent scopes). Tag set: milling, resurfacing, shoulder_rehab, leveling,
 * surface_treatment, patching, grassing, striping, rumble_strips, markers,
 * traffic_control.
 */
function deriveScopes(result: ParsedGdotJob): string[] {
	const tags = new Set<string>();
	const headline = (result.location_description ?? '').toUpperCase();
	const items = result.bid_items;
	const has = (re: RegExp) => items.some((it) => it.item_id != null && re.test(it.item_id));
	const desc = (re: RegExp) => items.some((it) => re.test(it.description.toUpperCase()));

	if (/MILL/.test(headline) || has(/^432-/) || desc(/\bMILL\b/)) tags.add('milling');
	if (/RESURFAC|PLANT MIX|SUPERPAVE/.test(headline) || has(/^402-31/) || desc(/SUPERPAVE/))
		tags.add('resurfacing');
	if (/SHOULDER/.test(headline) || desc(/SHOULDER/) || has(/^210-/)) tags.add('shoulder_rehab');
	if (has(/^402-18/) || desc(/PATCHING/)) tags.add('patching');
	if (desc(/LEVELING/) || has(/^402-1812/)) tags.add('leveling');
	if (desc(/SURFACE TRTMT|SURFACE TREATMENT|INTERLAYER/) || has(/^(424|415)-/))
		tags.add('surface_treatment');
	if (has(/^700-/) || desc(/GRASSING/)) tags.add('grassing');
	if (has(/^653-/) || desc(/TRAF STRIPE|STRIPE/)) tags.add('striping');
	if (has(/^456-/) || desc(/RUMBLE/)) tags.add('rumble_strips');
	if (has(/^654-/) || desc(/PVMT MARKERS|RAISED/)) tags.add('markers');
	if (has(/^150-/) || desc(/TRAFFIC CONTROL/)) tags.add('traffic_control');

	return [...tags];
}

// ---------------------------------------------------------------------------
// V2 — Zone-based, confidence-scored pipeline
// ---------------------------------------------------------------------------

/** Version of ParsedBidItem with per-field confidence. */
export interface ParsedBidItemV2 extends ParsedBidItem {
	confidence: FieldConfidence;
}

/** Version of ParsedProductionMix with per-field confidence. */
export interface ParsedProductionMixV2 extends ParsedProductionMix {
	confidence: FieldConfidence;
}

/**
 * Confidence-annotated result.  Every scalar field is wrapped in ParsedField<T>
 * so the UI can render confidence indicators and the merge logic can make
 * principled decisions when two source documents overlap.
 */
export interface ParsedGdotJobV2 {
	// Identity
	name: ParsedField<string>;
	job_number: ParsedField<string>;
	project_number: ParsedField<string>;
	contract_id: ParsedField<string>;
	county: ParsedField<string>;
	// Contract
	work_type: ParsedField<string>;
	contract_type: ParsedField<string>;
	contract_amount: ParsedField<number>;
	retainage_pct: ParsedField<number>;
	est_start_date: ParsedField<string>;
	completion_date: ParsedField<string>;
	// Customer / owner
	customer_name: ParsedField<string>;
	customer_address: ParsedField<string>;
	customer_contact: ParsedField<string>;
	customer_phone: ParsedField<string>;
	customer_email: ParsedField<string>;
	owner_name: ParsedField<string>;
	owner_address: ParsedField<string>;
	// Project management
	project_manager: ParsedField<string>;
	asphalt_supplier: ParsedField<string>;
	total_length_ft: ParsedField<number>;
	location_description: ParsedField<string>;
	route_designation: ParsedField<string>;
	begin_terminus: ParsedField<string>;
	end_terminus: ParsedField<string>;
	// Derived (no confidence needed — evidence-backed)
	scopes: string[];
	// Line items and mixes
	bid_items: ParsedBidItemV2[];
	production_mixes: ParsedProductionMixV2[];
	// Meta
	detected_documents: GdotDocumentType[];
	has_contract_summary: boolean;
	has_job_setup: boolean;
	warnings: string[];
	/** Zones where extraction confidence was low — passed to Phase 2 LLM fallback. */
	lowConfidenceZones: import('./zone-extractor.js').Zone[];
}

function emptyV2(): ParsedGdotJobV2 {
	const missing = <T>(src: string): ParsedField<T> => field.missing<T>(src);
	return {
		name: missing('unset'),
		job_number: missing('unset'),
		project_number: missing('unset'),
		contract_id: missing('unset'),
		county: missing('unset'),
		work_type: missing('unset'),
		contract_type: missing('unset'),
		contract_amount: missing('unset'),
		retainage_pct: missing('unset'),
		est_start_date: missing('unset'),
		completion_date: missing('unset'),
		customer_name: missing('unset'),
		customer_address: missing('unset'),
		customer_contact: missing('unset'),
		customer_phone: missing('unset'),
		customer_email: missing('unset'),
		owner_name: missing('unset'),
		owner_address: missing('unset'),
		project_manager: missing('unset'),
		asphalt_supplier: missing('unset'),
		total_length_ft: missing('unset'),
		location_description: missing('unset'),
		route_designation: missing('unset'),
		begin_terminus: missing('unset'),
		end_terminus: missing('unset'),
		scopes: [],
		bid_items: [],
		production_mixes: [],
		detected_documents: [],
		has_contract_summary: false,
		has_job_setup: false,
		warnings: [],
		lowConfidenceZones: []
	};
}

/**
 * Merge a single V1 result (from the existing flat-regex parsers) into a V2
 * result, assigning confidence based on which parser produced each field.
 *
 * For labelled form fields parsed from the job_setup doc we use 'high'.
 * For regex-inferred fields from the contract_summary we use 'medium'.
 * For positional/heuristic fields we use 'low'.
 */
function mergeV1IntoV2(
	v1: ParsedGdotJob,
	v2: ParsedGdotJobV2,
	docType: GdotDocumentType
): void {
	// Confidence level depends on the document that produced the data.
	const conf: FieldConfidence = docType === 'job_setup' ? 'high' : 'medium';
	const src = docType === 'job_setup' ? 'job_setup_regex' : 'contract_summary_regex';

	const setIfBetter = <T>(
		key: keyof ParsedGdotJobV2,
		value: T | null,
		confidence: FieldConfidence,
		source: string
	) => {
		if (value == null) return;
		const current = v2[key] as ParsedField<T>;
		const incoming: ParsedField<T> = { value, confidence, source };
		// A real value always beats a still-empty field, even at equal confidence
		// (mergeField's first-wins tie-break would otherwise keep the null
		// `missing` placeholder and drop low-confidence extractions like termini).
		if (current.value == null) {
			(v2 as Record<string, unknown>)[key as string] = incoming;
			return;
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(v2 as any)[key] = mergeField(current, incoming);
	};

	setIfBetter('name', v1.name, conf, src);
	setIfBetter('job_number', v1.job_number, conf, src);
	setIfBetter('project_number', v1.project_number, conf, src);
	setIfBetter('contract_id', v1.contract_id, 'high', src); // labelled field
	setIfBetter('county', v1.county, docType === 'contract_summary' ? 'medium' : 'low', src);
	setIfBetter('work_type', v1.work_type, conf, src);
	setIfBetter('contract_type', v1.contract_type, conf, src);
	setIfBetter('contract_amount', v1.contract_amount, 'high', src);
	setIfBetter('retainage_pct', v1.retainage_pct, conf, src);
	setIfBetter('est_start_date', v1.est_start_date, conf, src);
	setIfBetter('completion_date', v1.completion_date, conf, src);
	setIfBetter('customer_name', v1.customer_name, conf, src);
	setIfBetter('customer_address', v1.customer_address, conf, src);
	setIfBetter('customer_contact', v1.customer_contact, conf, src);
	setIfBetter('customer_phone', v1.customer_phone, conf, src);
	setIfBetter('customer_email', v1.customer_email, conf, src);
	setIfBetter('owner_name', v1.owner_name, conf, src);
	setIfBetter('owner_address', v1.owner_address, conf, src);
	setIfBetter('project_manager', v1.project_manager, conf, src);
	setIfBetter('asphalt_supplier', v1.asphalt_supplier, conf, src);
	setIfBetter('total_length_ft', v1.total_length_ft, 'medium', src);
	setIfBetter('location_description', v1.location_description, 'medium', src);
	setIfBetter('route_designation', v1.route_designation, 'medium', src);
	setIfBetter('begin_terminus', v1.begin_terminus, 'low', src);
	setIfBetter('end_terminus', v1.end_terminus, 'low', src);
}

/**
 * Zone-based V2 parsing pass.  Runs zone extraction on the text and passes
 * each table zone through the zone-aware table parsers.  Results are merged
 * into v2 using the same mergeField logic.
 */
function applyZonePass(text: string, docType: GdotDocumentType, v2: ParsedGdotJobV2): void {
	const zones = extractZones(text, docType);

	const allWarnings: string[] = [];
	let allBidItems: ParsedBidItemV2[] = [];
	let allMixes: ParsedProductionMixV2[] = [];
	let bidQuantityMap: Map<string, number> | null = null;

	for (const tableZone of zones.tables) {
		const result = parseTableZone(tableZone);
		if (result.scheduleOfItems) {
			allWarnings.push(...result.scheduleOfItems.warnings);
			// Zone parser wins over regex parser when it produced rows.
			if (result.scheduleOfItems.items.length > 0) {
				allBidItems = result.scheduleOfItems.items.map((it) => ({
					...it,
					confidence: 'high' as FieldConfidence
				}));
			}
		}
		if (result.productionGoals) {
			allWarnings.push(...result.productionGoals.warnings);
			if (result.productionGoals.mixes.length > 0) {
				allMixes = result.productionGoals.mixes.map((m) => ({
					...m,
					mix_type: mapMixType(m.mix_name),
					confidence: 'high' as FieldConfidence
				}));
			}
		}
		if (result.bidQuantities) {
			allWarnings.push(...result.bidQuantities.warnings);
			if (result.bidQuantities.quantities.value) {
				bidQuantityMap = result.bidQuantities.quantities.value;
			}
		}
	}

	// Apply bid quantities to mixes.
	if (bidQuantityMap && allMixes.length > 0) {
		applyBidQuantities(allMixes, bidQuantityMap);
	}

	// Zone parser results override regex results when they produced data.
	if (allBidItems.length > 0) v2.bid_items = allBidItems;
	if (allMixes.length > 0) v2.production_mixes = allMixes;

	v2.warnings.push(...allWarnings);

	// Collect low-confidence zones for Phase 2 LLM fallback. Geographic fields
	// (county/route/location) feed the map's geocoding + route geometry, so a
	// miss on any of them makes the header zone eligible for the LLM pass.
	if (zones.header.lines.length > 0) {
		const hasLowConf =
			v2.contract_id.confidence === 'low' ||
			v2.county.confidence === 'low' || v2.county.value == null ||
			v2.contract_amount.confidence === 'low' ||
			v2.route_designation.value == null ||
			v2.location_description.value == null;
		if (hasLowConf) v2.lowConfidenceZones.push(zones.header);
	}
	for (const tz of zones.tables) {
		if (v2.bid_items.length === 0 || v2.production_mixes.length === 0) {
			v2.lowConfidenceZones.push(tz);
		}
	}
}

/**
 * Zone-based, confidence-scored entry point.  Processes one or more GDOT
 * document texts (job_setup and/or contract_summary) and returns a
 * ParsedGdotJobV2 with ParsedField<T> wrappers on every scalar field.
 *
 * The existing regex parsers still run first (they handle the common flat-text
 * format well), and their results are tagged with appropriate confidence levels.
 * The zone-based table parsers then run as a second pass and upgrade bid-item /
 * production-mix rows from medium to high confidence when they can parse the
 * table structure directly.
 */
export function parseGdotDocumentsV2(texts: string[]): ParsedGdotJobV2 {
	const v2 = emptyV2();

	// --- Pass 1: existing flat-regex parsers tagged with confidence ---
	const v1 = emptyResult();
	let matchedAny = false;

	for (const text of texts) {
		const docType = detectDocumentType(text);
		if (docType !== 'unknown' && !v1.detected_documents.includes(docType)) {
			v1.detected_documents.push(docType);
		}
		if (parseContractSummary(text, v1)) matchedAny = true;
		if (parseJobSetup(text, v1)) matchedAny = true;
	}

	v1.has_contract_summary = v1.detected_documents.includes('contract_summary');
	v1.has_job_setup = v1.detected_documents.includes('job_setup');

	if (!matchedAny) {
		v1.warnings.push('Could not recognize this as a GDOT job-setup or contract-summary document.');
	}
	if (matchedAny && !v1.has_contract_summary) {
		v1.warnings.push(
			'Missing the Contract Summary PDF — bid items, contract value and project geometry will be incomplete.'
		);
	}
	if (matchedAny && !v1.has_job_setup) {
		v1.warnings.push(
			'Missing the Job Setup PDF — production goals, customer/owner and asphalt supplier will be incomplete.'
		);
	}

	matchMixUnitPrices(v1);
	v1.scopes = deriveScopes(v1);

	// Merge flat V1 into V2 with confidence annotations.
	for (const text of texts) {
		const docType = detectDocumentType(text);
		mergeV1IntoV2(v1, v2, docType);
	}

	// Carry over array results from V1 as the baseline (medium confidence).
	if (v2.bid_items.length === 0) {
		v2.bid_items = v1.bid_items.map((it) => ({ ...it, confidence: 'medium' as FieldConfidence }));
	}
	if (v2.production_mixes.length === 0) {
		v2.production_mixes = v1.production_mixes.map((m) => ({
			...m,
			confidence: 'medium' as FieldConfidence
		}));
	}

	v2.detected_documents = v1.detected_documents;
	v2.has_contract_summary = v1.has_contract_summary;
	v2.has_job_setup = v1.has_job_setup;
	v2.scopes = v1.scopes;
	v2.warnings = [...v1.warnings];

	// --- Pass 2: zone-based table parsers (upgrade to high confidence) ---
	for (const text of texts) {
		const docType = detectDocumentType(text);
		applyZonePass(text, docType, v2);
	}

	// Derive name from project_number if missing.
	if (!v2.name.value && v2.project_number.value) {
		v2.name = field.low(
			v2.county.value
				? `${v2.project_number.value} — ${v2.county.value} County`
				: v2.project_number.value,
			'derived_from_project_number'
		);
	}

	return v2;
}

/**
 * Downgrade a ParsedGdotJobV2 to the original ParsedGdotJob (flat nullable
 * fields) for backward compatibility with existing callers.
 *
 * Use this adapter while callers migrate to V2 incrementally.
 */
export function toV1(v2: ParsedGdotJobV2): ParsedGdotJob {
	return {
		name: v2.name.value,
		job_number: v2.job_number.value,
		project_number: v2.project_number.value,
		contract_id: v2.contract_id.value,
		county: v2.county.value,
		work_type: v2.work_type.value,
		contract_type: v2.contract_type.value,
		contract_amount: v2.contract_amount.value,
		retainage_pct: v2.retainage_pct.value,
		est_start_date: v2.est_start_date.value,
		completion_date: v2.completion_date.value,
		customer_name: v2.customer_name.value,
		customer_address: v2.customer_address.value,
		customer_contact: v2.customer_contact.value,
		customer_phone: v2.customer_phone.value,
		customer_email: v2.customer_email.value,
		owner_name: v2.owner_name.value,
		owner_address: v2.owner_address.value,
		project_manager: v2.project_manager.value,
		asphalt_supplier: v2.asphalt_supplier.value,
		total_length_ft: v2.total_length_ft.value,
		location_description: v2.location_description.value,
		route_designation: v2.route_designation.value,
		begin_terminus: v2.begin_terminus.value,
		end_terminus: v2.end_terminus.value,
		scopes: v2.scopes,
		bid_items: v2.bid_items,
		production_mixes: v2.production_mixes,
		detected_documents: v2.detected_documents,
		has_contract_summary: v2.has_contract_summary,
		has_job_setup: v2.has_job_setup,
		warnings: v2.warnings
	};
}
