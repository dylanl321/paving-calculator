/**
 * Zone-based document splitter for GDOT PDF text.
 *
 * Instead of applying a single flat-regex pass over the whole document, we
 * first slice the extracted text into named zones, then run specialized parsers
 * on each zone. This isolates page-header noise, lets each zone use the most
 * appropriate matching strategy, and supplies the Phase 2 LLM fallback with a
 * focused chunk rather than the full document.
 *
 * Zone types:
 *   header — the opening section (contract ID, proposal ID, dates, total bid).
 *   table  — a block that looks like tabular data.
 *   body   — narrative text, headlines, form fields, notes.
 */

import type { GdotDocumentType } from './parse-gdot.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ZoneType = 'header' | 'table' | 'body';

export interface Zone {
	/** Broad category of this zone. */
	type: ZoneType;
	/**
	 * Human-readable label identifying the semantic purpose of the zone.
	 * Examples: 'header_page1', 'schedule_of_items', 'production_goals',
	 * 'bid_quantities', 'job_setup_form', 'body'.
	 */
	label: string;
	/** The text lines that fall inside this zone. */
	lines: string[];
	/** Joined text of the zone — convenience accessor used by parsers. */
	text: string;
}

/** Structured decomposition of a single GDOT PDF document. */
export interface DocumentZones {
	/** Opening section: contract/proposal identifiers, dates, financials. */
	header: Zone;
	/** Zero or more detected table blocks. */
	tables: Zone[];
	/** Narrative body (form fields, headlines, notes). */
	body: Zone;
	/** Lines that could not be assigned to any specific zone. */
	metadata: Zone;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Known table header patterns for GDOT documents. */
const TABLE_HEADER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
	{
		pattern:
			/PROPOSAL\s+LINE\s+NO|LINE\s+NO\.?\s+ITEM\s+NO|ITEM\s+NUMBER.*DESCRIPTION.*QUANTITY/i,
		label: 'schedule_of_items'
	},
	{
		pattern: /PRODUCT\s+TAKEOFF|QTY\s*\(TN\)\s*QUANTITY\s+PER\s+DAY|PRODUCTION\s+GOALS/i,
		label: 'production_goals'
	},
	{
		pattern: /TYPICAL\s+\(GAB|BID\s+QUANTITY|UNIT\s+BID\s+QUANTITY/i,
		label: 'bid_quantities'
	},
	{
		pattern: /MIX\s+TYPE|PLANT\s+MIX\s+SCHEDULE|ASPHALT\s+PLANT\s+MIX/i,
		label: 'mix_schedule'
	}
];

/**
 * Heuristic: does this line look like part of a table row?
 * A line is considered tabular when it contains 3+ numeric / unit tokens,
 * or when it matches a known schedule-of-items row pattern.
 */
function looksTabular(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed) return false;

	// Schedule-of-items row: starts with a line number followed by an item code.
	if (/^\d{4}\s+\d{3,4}/.test(trimmed)) return true;

	// Three or more numeric or unit tokens.
	const tokens = trimmed.split(/\s+/);
	const numericOrUnit = tokens.filter((t) =>
		/^\$?[\d,]+\.?\d*$/.test(t) || /^(TN|SY|LF|EA|LS|CY|GAL|SF|AC|TON|LB|MG)$/i.test(t)
	);
	return numericOrUnit.length >= 3;
}

/**
 * Heuristic: is this line a page header / footer artifact that should be
 * stripped when building zone text?
 */
function isPageArtifact(line: string): boolean {
	const t = line.trim();
	// Bare page numbers.
	if (/^-?\s*\d+\s*-?$/.test(t)) return true;
	// "Page X of Y" variants.
	if (/^page\s+\d+\s+of\s+\d+$/i.test(t)) return true;
	// GDOT contract repeat headers that appear on every page.
	if (
		/^(GEORGIA\s+DEPARTMENT\s+OF\s+TRANSPORTATION|SCHEDULE\s+OF\s+QUANTITIES|CONTRACT\s+PROPOSAL)$/i.test(
			t
		)
	)
		return true;
	return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split `pdfText` into structural zones.
 *
 * @param pdfText  - Raw text as returned by pdfToText() in parse-gdot.ts.
 * @param docType  - Document type detected by detectDocumentType(). Used to
 *                   tune zone boundaries (job_setup vs contract_summary have
 *                   different header extents).
 * @returns DocumentZones with header, tables[], body, and metadata zones.
 */
export function extractZones(pdfText: string, docType?: GdotDocumentType): DocumentZones {
	const allLines = pdfText.split('\n');

	// ------------------------------------------------------------------
	// Pass 1: identify table header lines and their extents.
	// ------------------------------------------------------------------
	type TableBlock = { label: string; startIdx: number; endIdx: number };
	const tableBlocks: TableBlock[] = [];

	let i = 0;
	while (i < allLines.length) {
		const line = allLines[i];
		const matchedHeader = TABLE_HEADER_PATTERNS.find((p) => p.pattern.test(line));
		if (matchedHeader) {
			const startIdx = i;
			// Consume lines while they look tabular or are within a short gap of
			// the last tabular line.
			let lastTabular = i;
			let j = i + 1;
			while (j < allLines.length) {
				const candidate = allLines[j];
				if (looksTabular(candidate) || (j - lastTabular <= 2 && candidate.trim())) {
					if (looksTabular(candidate)) lastTabular = j;
					j++;
				} else if (!candidate.trim()) {
					// A single blank line inside a table is ok.
					j++;
				} else {
					break;
				}
				// Bail if we drift too far from the last tabular line.
				if (j - lastTabular > 4) break;
			}
			// Only keep if we captured at least one non-header row.
			if (lastTabular > startIdx) {
				tableBlocks.push({ label: matchedHeader.label, startIdx, endIdx: lastTabular });
				i = lastTabular + 1;
				continue;
			}
		}
		i++;
	}

	// ------------------------------------------------------------------
	// Pass 2: mark each line as belonging to a table block, header, or body.
	// ------------------------------------------------------------------
	type LineClass = 'table' | 'header' | 'body' | 'artifact';
	const lineClass: LineClass[] = new Array(allLines.length).fill('body');
	const lineTableLabel: string[] = new Array(allLines.length).fill('');

	// Mark table lines.
	for (const block of tableBlocks) {
		for (let k = block.startIdx; k <= block.endIdx; k++) {
			lineClass[k] = 'table';
			lineTableLabel[k] = block.label;
		}
	}

	// Mark page artifacts.
	for (let k = 0; k < allLines.length; k++) {
		if (lineClass[k] !== 'table' && isPageArtifact(allLines[k])) {
			lineClass[k] = 'artifact';
		}
	}

	// Header zone: first non-artifact lines up to the first table block, capped
	// at a reasonable length. For job_setup documents the header is shorter.
	const headerLineLimit = docType === 'job_setup' ? 30 : 25;
	const firstTableStart = tableBlocks.length > 0 ? tableBlocks[0].startIdx : allLines.length;
	for (let k = 0; k < Math.min(headerLineLimit, firstTableStart, allLines.length); k++) {
		if (lineClass[k] === 'body') lineClass[k] = 'header';
	}

	// ------------------------------------------------------------------
	// Pass 3: assemble zones.
	// ------------------------------------------------------------------
	const headerLines: string[] = [];
	const bodyLines: string[] = [];
	const metaLines: string[] = [];

	// Per-table-block accumulator.
	const tableLinesByLabel: Map<string, string[]> = new Map();
	for (const block of tableBlocks) {
		if (!tableLinesByLabel.has(block.label)) tableLinesByLabel.set(block.label, []);
	}

	for (let k = 0; k < allLines.length; k++) {
		const cls = lineClass[k];
		const raw = allLines[k];
		if (cls === 'artifact') {
			metaLines.push(raw);
		} else if (cls === 'header') {
			headerLines.push(raw);
		} else if (cls === 'table') {
			const label = lineTableLabel[k];
			const arr = tableLinesByLabel.get(label);
			if (arr) arr.push(raw);
		} else {
			bodyLines.push(raw);
		}
	}

	// ------------------------------------------------------------------
	// Build result.
	// ------------------------------------------------------------------
	const makeZone = (type: ZoneType, label: string, lines: string[]): Zone => ({
		type,
		label,
		lines,
		text: lines.join('\n')
	});

	const tables: Zone[] = [];
	for (const block of tableBlocks) {
		const lines = tableLinesByLabel.get(block.label) ?? [];
		if (lines.length > 0) {
			tables.push(makeZone('table', block.label, lines));
		}
	}

	return {
		header: makeZone('header', 'header', headerLines),
		tables,
		body: makeZone('body', 'body', bodyLines),
		metadata: makeZone('body', 'metadata', metaLines)
	};
}
