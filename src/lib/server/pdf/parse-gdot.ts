import { getDocument } from 'pdfjs-serverless';

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
				est_days: null
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
		/(\d{4})\s+(\d{3}-\d{3,4})\s+(.*?)\s+(?:(LUMP SUM)\s+([\d,]+\.\d{2})|([A-Z]{1,5})\s+([\d,]+\.\d{4,5})\s+([\d,]+\.\d{2}))(?=\s+\d{4}\s+\d{3}-\d{3,4}|\s+Contract Schedule|\s+Total Bid|\s*$)/g;

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

	result.scopes = deriveScopes(result);

	return result;
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
