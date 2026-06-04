/**
 * Zone-aware table parser for GDOT PDF documents.
 *
 * Each table zone produced by zone-extractor.ts has a `label` that identifies
 * its semantic type. This module routes each zone to the appropriate parsing
 * function and returns structured data wrapped in ParsedField<T>.
 */

import { field, type ParsedField } from './confidence.js';
import type { Zone } from './zone-extractor.js';
import type { ParsedBidItem, ParsedProductionMix } from './parse-gdot.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedScheduleOfItems {
	items: ParsedBidItem[];
	warnings: string[];
}

export interface ParsedProductionGoals {
	mixes: ParsedProductionMix[];
	warnings: string[];
}

export interface ParsedBidQuantities {
	/** Map of mix name -> bid quantity in tons. */
	quantities: ParsedField<Map<string, number>>;
	warnings: string[];
}

export interface ParsedTableResult {
	scheduleOfItems?: ParsedScheduleOfItems;
	productionGoals?: ParsedProductionGoals;
	bidQuantities?: ParsedBidQuantities;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumber(s: string): number | null {
	if (!s) return null;
	const cleaned = s.replace(/[$,]/g, '').trim();
	const n = parseFloat(cleaned);
	return isNaN(n) ? null : n;
}

/**
 * Tokenize a line, splitting on 2+ consecutive spaces or tab characters.
 * This preserves multi-word descriptions better than a single split(/\s+/).
 */
function tokenize(line: string): string[] {
	return line
		.split(/\t|  +/)
		.map((t) => t.trim())
		.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Schedule-of-items parser
// ---------------------------------------------------------------------------

/**
 * The GDOT schedule-of-items format looks like:
 *   0010 400-3000 ASPHALT CONCRETE, WARM MIX 100 TN 5.000 $24.00 $120.00
 *
 * Columns (space-delimited, right-aligned numbers):
 *   LINE_NO  ITEM_ID  DESCRIPTION...  QUANTITY  UNIT  UNIT_PRICE  BID_AMOUNT
 *
 * The regex below is derived from the existing parseScheduleOfItems logic in
 * parse-gdot.ts but produces structured ParsedBidItem objects.
 */
const SCHEDULE_ROW_RE =
	/^(\d{4})\s+([\dA-Z]{3,4}-[\dA-Z]+)\s+(.*?)\s+([\d,]+\.?\d*)\s+(TN|SY|LF|EA|LS|CY|GAL|SF|AC|TON|LB|MG)\s+\$?([\d,]+\.\d{2,})\s+\$?([\d,]+\.\d{2,})$/i;

/**
 * Some lines have an ALTERNATE indicator. Check for it before the regular row.
 */
const ALTERNATE_MARKER_RE = /\bALT(ERNATE)?\b/i;

function parseScheduleOfItemsZone(zone: Zone): ParsedScheduleOfItems {
	const warnings: string[] = [];
	const items: ParsedBidItem[] = [];
	const seen = new Set<string>();
	let currentSection = '';
	let isAlternate = false;

	for (const line of zone.lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// Detect section headers (e.g. "SECTION A — BASE BID").
		if (/^SECTION\s+[A-Z0-9]/i.test(trimmed) || /^(BASE BID|ALTERNATE)/i.test(trimmed)) {
			currentSection = trimmed;
			isAlternate = ALTERNATE_MARKER_RE.test(trimmed);
			continue;
		}

		// Mark alternate flag without resetting section.
		if (ALTERNATE_MARKER_RE.test(trimmed) && !/^\d{4}/.test(trimmed)) {
			isAlternate = true;
			continue;
		}

		const m = SCHEDULE_ROW_RE.exec(trimmed);
		if (!m) continue;

		const [, lineNo, itemId, description, qty, unit, unitPrice, bidAmount] = m;
		const dedupeKey = `${lineNo}-${itemId}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);

		items.push({
			line_number: lineNo,
			item_id: itemId,
			description: description.trim(),
			quantity: parseNumber(qty),
			unit,
			unit_price: parseNumber(unitPrice),
			bid_amount: parseNumber(bidAmount),
			section: currentSection || null,
			is_alternate: isAlternate,
			selected: !isAlternate
		});
	}

	if (items.length === 0) {
		warnings.push(
			`schedule_of_items zone detected but 0 rows parsed — possible format variation`
		);
	}

	return { items, warnings };
}

// ---------------------------------------------------------------------------
// Production goals parser
// ---------------------------------------------------------------------------

/**
 * Production goals block format (from the Job Setup form):
 *   MIX_NAME  TAKEOFF_QTY  QTY_PER_DAY  EST_DAYS
 *
 * Example:
 *   19.0MM SP 12.5 SUPERPAVE  2500  400  6.25
 */
const GOALS_ROW_RE = /^(.+?)\s{2,}([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)$/;

function parseProductionGoalsZone(zone: Zone): ParsedProductionGoals {
	const warnings: string[] = [];
	const mixes: ParsedProductionMix[] = [];

	// Skip header line.
	const dataLines = zone.lines.filter(
		(l) => !/PRODUCT|TAKEOFF|QTY\s*\(TN\)|PRODUCTION\s+GOALS/i.test(l)
	);

	for (const line of dataLines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const m = GOALS_ROW_RE.exec(trimmed);
		if (!m) continue;

		const [, mixName, takeoff, qtyPerDay, estDays] = m;
		mixes.push({
			mix_name: mixName.trim(),
			mix_type: null, // resolved later by mapMixType in parse-gdot.ts
			unit: 'TN',
			bid_quantity: null, // resolved from bid_quantities zone
			takeoff_tonnage: parseNumber(takeoff),
			quantity_per_day: parseNumber(qtyPerDay),
			est_days: parseNumber(estDays),
			contract_unit_price: null // resolved by matchMixUnitPrices
		});
	}

	if (mixes.length === 0) {
		warnings.push(
			`production_goals zone detected but 0 rows parsed — check column alignment`
		);
	}

	return { mixes, warnings };
}

// ---------------------------------------------------------------------------
// Bid quantities parser
// ---------------------------------------------------------------------------

/**
 * Bid quantities block: maps mix names to contract tonnages.
 *
 * Example header:
 *   TYPICAL (GAB, ...) UNIT BID QUANTITY
 *
 * Example row:
 *   SP 12.5  TN  3500
 */
function parseBidQuantitiesZone(zone: Zone): ParsedBidQuantities {
	const warnings: string[] = [];
	const map = new Map<string, number>();

	// Skip header lines.
	const dataLines = zone.lines.filter(
		(l) => !/TYPICAL|BID\s+QUANTITY|UNIT\s+BID/i.test(l)
	);

	for (const line of dataLines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const tokens = tokenize(trimmed);
		// Expect at least: [mix_name, unit, quantity]
		if (tokens.length < 3) continue;
		const qty = parseNumber(tokens[tokens.length - 1]);
		if (qty == null) continue;
		// Mix name is everything before the last two tokens (unit + qty).
		const mixName = tokens.slice(0, tokens.length - 2).join(' ').trim();
		if (mixName) map.set(mixName, qty);
	}

	if (map.size === 0) {
		warnings.push(`bid_quantities zone detected but 0 rows parsed — check table format`);
	}

	return {
		quantities: map.size > 0 ? field.high(map, 'bid_quantities_table') : field.missing('bid_quantities_table'),
		warnings
	};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a single Zone into structured table data.
 *
 * The zone's `label` (set by zone-extractor.ts) determines which specialized
 * parser is used. Unknown labels are returned as empty results with a warning.
 */
export function parseTableZone(zone: Zone): ParsedTableResult {
	switch (zone.label) {
		case 'schedule_of_items':
			return { scheduleOfItems: parseScheduleOfItemsZone(zone) };
		case 'production_goals':
			return { productionGoals: parseProductionGoalsZone(zone) };
		case 'bid_quantities':
			return { bidQuantities: parseBidQuantitiesZone(zone) };
		default:
			// Unknown table type — parse as schedule of items as a best-effort fallback.
			if (zone.lines.some((l) => /^\d{4}\s+\d{3,4}/.test(l.trim()))) {
				return { scheduleOfItems: parseScheduleOfItemsZone(zone) };
			}
			return {};
	}
}

/**
 * Merge bid quantities from the bid_quantities zone into production mixes.
 * Updates each mix's `bid_quantity` in place when a name match is found.
 */
export function applyBidQuantities(
	mixes: ParsedProductionMix[],
	quantities: Map<string, number>
): void {
	for (const mix of mixes) {
		for (const [name, qty] of quantities) {
			// Loose substring match: the mix name in production goals is often
			// a subset of the bid-quantities name (e.g. "SP 12.5" vs "SP 12.5 SURFACE").
			if (
				mix.mix_name.toUpperCase().includes(name.toUpperCase()) ||
				name.toUpperCase().includes(mix.mix_name.toUpperCase())
			) {
				mix.bid_quantity = qty;
				break;
			}
		}
	}
}
