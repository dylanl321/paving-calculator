/**
 * Parser for GDOT Change Orders and Supplemental Agreements.
 *
 * Handles:
 *  - Standard GDOT "CHANGE ORDER" forms
 *  - "SUPPLEMENTAL AGREEMENT" documents
 *
 * Extraction is best-effort with confidence levels. Any field not found is
 * left null — we never invent data that isn't present in the source text.
 */

import { field, type ParsedField } from './confidence.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single line item affected by this change order. */
export interface ChangeOrderAffectedItem {
	/** Schedule item number (e.g. "0110-0000-A"). */
	item_id: string | null;
	/** Item description. */
	description: string;
	/** Quantity adjustment (positive = increase, negative = decrease). */
	quantity_change: number | null;
	/** Unit of measure. */
	unit: string | null;
	/** Unit price. */
	unit_price: number | null;
	/** Dollar amount for this line. */
	amount: number | null;
}

export interface ParsedChangeOrder {
	/** Change order number (e.g. "CO-001", "1"). */
	change_order_number: ParsedField<string>;
	/** Date of the change order (ISO date string when parseable). */
	date: ParsedField<string>;
	/** Free-text description of the reason for the change order. */
	description: ParsedField<string>;
	/** Net dollar amount added to the contract by this CO. */
	additional_amount: ParsedField<number>;
	/** New contract total after this CO. */
	new_contract_total: ParsedField<number>;
	/** List of schedule items modified or added by this CO. */
	affected_items: ChangeOrderAffectedItem[];
	/** Contract ID this CO applies to. */
	contract_id: ParsedField<string>;
	/** Contractor name. */
	contractor: ParsedField<string>;
	/** Warnings / fields we could not parse. */
	warnings: string[];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the document text strongly resembles a GDOT change order
 * or supplemental agreement.
 */
export function isChangeOrder(text: string): boolean {
	return /\bCHANGE\s+ORDER\b|\bSUPPLEMENTAL\s+AGREEMENT\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emptyResult(): ParsedChangeOrder {
	const missing = <T>(src: string): ParsedField<T> => ({
		value: null,
		confidence: 'low',
		source: src
	});
	return {
		change_order_number: missing('not found'),
		date: missing('not found'),
		description: missing('not found'),
		additional_amount: missing('not found'),
		new_contract_total: missing('not found'),
		affected_items: [],
		contract_id: missing('not found'),
		contractor: missing('not found'),
		warnings: []
	};
}

function toNumber(raw: string | null | undefined): number | null {
	if (raw == null) return null;
	const cleaned = raw.replace(/[$,\s]/g, '');
	const n = Number(cleaned);
	return Number.isFinite(n) && cleaned !== '' ? n : null;
}

/** Normalise a date string to ISO (YYYY-MM-DD) when possible. */
function normaliseDate(raw: string): string {
	const mdy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(raw.trim());
	if (mdy) {
		const [, m, d, y] = mdy;
		return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
	return raw.trim();
}

/** Extract the value following a label on the same or next line. */
function afterLabel(text: string, labelRe: RegExp): string | null {
	const m = labelRe.exec(text);
	if (!m) return null;
	const rest = text.slice(m.index + m[0].length);
	const line = /^[^\n\r]{1,150}/.exec(rest)?.[0] ?? '';
	const val = line.replace(/^\s*:?\s*/, '').trim();
	return val || null;
}

/** Grab text between two headings. */
function zoneBetween(text: string, startRe: RegExp, endRe: RegExp): string | null {
	const start = startRe.exec(text);
	if (!start) return null;
	const slice = text.slice(start.index + start[0].length);
	const end = endRe.exec(slice);
	const region = end ? slice.slice(0, end.index) : slice.slice(0, 800);
	return region.replace(/^\s+/, '').replace(/\s+$/, '') || null;
}

/**
 * Parse a table-style schedule of items from a change order.
 *
 * Typical GDOT CO table rows:
 *   0110-0000-A  CLEARING AND GRUBBING  ACRE  2.00  $1500.00  $3000.00
 *   DELETE: 0620-1100-00  24" CULVERT PIPE  LF  (50)  $45.00  ($2250.00)
 */
function parseAffectedItems(text: string): ChangeOrderAffectedItem[] {
	const items: ChangeOrderAffectedItem[] = [];

	// Scan line-by-line for rows that look like schedule items.
	// Pattern: optional DELETE/ADD, item_id, description words, unit, qty, price, amount
	const lineRe =
		/(?:(?:ADD|DELETE|REVISE|CHANGE)\s*:?\s*)?(\d{4}[-\s]\d{4}[-\s]\d{2}[A-Z]?)\s+(.+?)\s+(AC|ACRE|CY|LF|LS|LM|SY|TON|EACH|EA|GAL|MGAL|HR|DAY|LUMP SUM)\s+([\-\(]?[\d,]+(?:\.\d+)?\)?)\s+\$?([\d,]+(?:\.\d+)?)\s+\$?([\-\(]?[\d,]+(?:\.\d+)?\)?)/gi;

	for (const m of text.matchAll(lineRe)) {
		const rawQty = m[4].replace(/[()]/g, '');
		const qty = /^\-/.test(m[4]) || /^\(/.test(m[4]) ? -(toNumber(rawQty) ?? 0) : (toNumber(rawQty) ?? null);
		const rawAmt = m[6].replace(/[()]/g, '');
		const amt = /^\-/.test(m[6]) || /^\(/.test(m[6]) ? -(toNumber(rawAmt) ?? 0) : (toNumber(rawAmt) ?? null);
		items.push({
			item_id: m[1].replace(/\s+/g, '-'),
			description: m[2].trim(),
			quantity_change: qty,
			unit: m[3].toUpperCase(),
			unit_price: toNumber(m[5]),
			amount: amt
		});
	}

	// Fallback: simpler two-column rows (item_id  description  amount)
	if (items.length === 0) {
		const simpleRe = /(\d{4}[-\s]\d{4}[-\s]\d{2}[A-Z]?)\s+(.+?)\s+\$?([\d,]+(?:\.\d+)?)/g;
		for (const m of text.matchAll(simpleRe)) {
			items.push({
				item_id: m[1].replace(/\s+/g, '-'),
				description: m[2].trim(),
				quantity_change: null,
				unit: null,
				unit_price: null,
				amount: toNumber(m[3])
			});
		}
	}

	return items;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a GDOT change order or supplemental agreement from extracted PDF text.
 *
 * @param text  Full concatenated text from all pages of the document.
 */
export function parseChangeOrder(text: string): ParsedChangeOrder {
	const result = emptyResult();

	if (!isChangeOrder(text)) {
		result.warnings.push(
			'Document does not match expected change order headers (CHANGE ORDER / SUPPLEMENTAL AGREEMENT).'
		);
		return result;
	}

	// --- Change order number ---
	// "CHANGE ORDER NO. 3", "CHANGE ORDER #2", "SUPPLEMENTAL AGREEMENT NO. 1"
	const coNumRaw =
		afterLabel(text, /CHANGE\s+ORDER\s+(?:NO\.?|NUMBER|#)\s*/i) ??
		afterLabel(text, /SUPPLEMENTAL\s+AGREEMENT\s+(?:NO\.?|NUMBER|#)\s*/i) ??
		afterLabel(text, /C\.?O\.?\s+(?:NO\.?|#)\s*/i);
	if (coNumRaw) {
		const numPart = /^[\w\-\/]+/.exec(coNumRaw)?.[0];
		if (numPart) {
			result.change_order_number = field.high(numPart.trim(), 'regex_label_CO_NUMBER', coNumRaw);
		}
	}
	// Alternative: "CHANGE ORDER 3" on its own line / near the top.
	if (result.change_order_number.value === null) {
		const headlineRe = /\bCHANGE\s+ORDER\s+(\d+)\b/i.exec(text);
		if (headlineRe) {
			result.change_order_number = field.medium(headlineRe[1], 'regex_headline_CO', headlineRe[0]);
		}
	}

	// --- Date ---
	const dateRaw =
		afterLabel(text, /DATE\s+(?:OF\s+(?:CHANGE\s+ORDER|AGREEMENT)\s*)?:?\s*/i) ??
		afterLabel(text, /EFFECTIVE\s+DATE\s*:?\s*/i);
	if (dateRaw) {
		const datePart =
			/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.exec(dateRaw)?.[0] ??
			/\d{4}-\d{2}-\d{2}/.exec(dateRaw)?.[0];
		if (datePart) {
			result.date = field.high(normaliseDate(datePart), 'regex_label_DATE', dateRaw);
		}
	}

	// --- Contract ID ---
	const contractIdRaw =
		afterLabel(text, /CONTRACT\s+(?:ID|NUMBER|NO\.?)\s*:?\s*/i) ??
		afterLabel(text, /CONTRACT\s*#\s*/i);
	if (contractIdRaw) {
		const idPart = /^[\w\-\/]+/.exec(contractIdRaw.split(/\n/)[0].trim())?.[0];
		if (idPart) {
			result.contract_id = field.high(idPart, 'regex_label_CONTRACT_ID', contractIdRaw);
		}
	}

	// --- Contractor ---
	const contractorRaw =
		afterLabel(text, /CONTRACTOR\s*:?\s*/i) ??
		afterLabel(text, /PRIME\s+CONTRACTOR\s*:?\s*/i);
	if (contractorRaw) {
		result.contractor = field.high(contractorRaw.split(/\n/)[0].trim(), 'regex_label_CONTRACTOR', contractorRaw);
	}

	// --- Description ---
	// Try a dedicated section first, then fall back to "REASON FOR CHANGE".
	const descZone =
		zoneBetween(text, /DESCRIPTION\s*(?:OF\s+(?:CHANGE|WORK)\s*)?:?\s*/i, /SCHEDULE\s+OF\s+ITEMS|AFFECTED\s+ITEMS|AMOUNT|CONTRACT\s+(?:VALUE|TOTAL)|CONTRACTOR\s+SIGNATURE/i) ??
		zoneBetween(text, /REASON\s+FOR\s+CHANGE\s*:?\s*/i, /AMOUNT|SCHEDULE|AFFECTED|SIGNATURE/i) ??
		afterLabel(text, /DESCRIPTION\s*:?\s*/i);
	if (descZone) {
		result.description = field.medium(descZone.slice(0, 800).trim(), 'regex_section_DESCRIPTION', descZone);
	}

	// --- Additional amount ---
	// "AMOUNT OF THIS CHANGE ORDER: $12,500.00", "NET CHANGE: ($2,500)"
	// "THIS CHANGE ORDER INCREASES/DECREASES the contract amount by $..."
	const addAmtRaw =
		afterLabel(text, /AMOUNT\s+OF\s+THIS\s+CHANGE\s+ORDER\s*:?\s*/i) ??
		afterLabel(text, /NET\s+CHANGE\s*:?\s*/i) ??
		afterLabel(text, /THIS\s+(?:CHANGE\s+ORDER|AGREEMENT)\s+(?:INCREASES?|DECREASES?)\s+.*?BY\s*/i);
	if (addAmtRaw) {
		const isNeg = /DECREASE|REDUCTION|\(/.test(addAmtRaw);
		const numPart = /[\d,]+(?:\.\d+)?/.exec(addAmtRaw.replace(/[$()]/g, ''))?.[0];
		const n = toNumber(numPart);
		if (n !== null) {
			result.additional_amount = field.high(isNeg ? -n : n, 'regex_label_AMOUNT_THIS_CO', addAmtRaw);
		}
	}

	// --- New contract total ---
	const newTotalRaw =
		afterLabel(text, /(?:REVISED\s+)?CONTRACT\s+(?:AMOUNT\s+)?TOTAL\s*(?:AFTER\s+(?:THIS\s+)?(?:CHANGE\s+ORDER|AGREEMENT))?\s*:?\s*/i) ??
		afterLabel(text, /NEW\s+CONTRACT\s+(?:AMOUNT|VALUE)\s*:?\s*/i) ??
		afterLabel(text, /TOTAL\s+CONTRACT\s+AMOUNT\s*:?\s*/i);
	if (newTotalRaw) {
		const numPart = /[\d,]+(?:\.\d+)?/.exec(newTotalRaw.replace(/[$()]/g, ''))?.[0];
		const n = toNumber(numPart);
		if (n !== null) {
			result.new_contract_total = field.high(n, 'regex_label_NEW_TOTAL', newTotalRaw);
		}
	}

	// --- Affected items (schedule items) ---
	// Try to isolate the items table zone, then parse it.
	const itemsZone =
		zoneBetween(text, /SCHEDULE\s+OF\s+(?:AFFECTED\s+)?ITEMS?\s*:?\s*/i, /SIGNATURE|TOTAL\s+NET\s+CHANGE|CONTRACTOR\s+SIGNATURE|ENGINEER\s+SIGNATURE/i) ??
		zoneBetween(text, /ITEM\s+(?:NO\.?|NUMBER)\s+DESCRIPTION/i, /SIGNATURE|NET\s+CHANGE|TOTAL/i) ??
		text;
	result.affected_items = parseAffectedItems(itemsZone);

	// Warn about any fields still missing.
	const missing: string[] = [];
	if (result.change_order_number.value === null) missing.push('change_order_number');
	if (result.date.value === null) missing.push('date');
	if (result.description.value === null) missing.push('description');
	if (result.additional_amount.value === null) missing.push('additional_amount');
	if (missing.length > 0) {
		result.warnings.push(`Could not extract: ${missing.join(', ')}.`);
	}

	return result;
}
