import { constant } from '$lib/config';
import type { FieldConfidence } from './confidence.js';

export type RoadwayLogEventType =
	| 'project_start'
	| 'project_end'
	| 'operation_change'
	| 'width_change'
	| 'side_road'
	| 'reference'
	| 'note';

export interface ParsedRoadwayLogEvent {
	source_index: number | null;
	page_number: number | null;
	milepost: number;
	station: number;
	event_type: RoadwayLogEventType;
	description: string;
	roadway_width_ft: number | null;
	side: 'left' | 'right' | null;
	surface: 'paved' | 'unpaved' | null;
	is_reference: boolean;
	confidence: FieldConfidence;
	raw_text: string;
	sort_order: number;
}

const FT_PER_MILE = () => constant('CONST.FT_PER_MILE');
const FT_PER_STATION = () => constant('CONST.FT_PER_STATION');

function stationFromMilepost(milepost: number): number {
	return (milepost * FT_PER_MILE()) / FT_PER_STATION();
}

function normalizeWhitespace(text: string): string {
	return text
		.replace(/[“”]/g, '"')
		.replace(/[–—]/g, '-')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseMilepost(raw: string): number | null {
	const cleaned = raw.trim().replace(/^\.(?=\d+\.\d{3}$)/, '');
	const normalized = cleaned.startsWith('.') ? `0${cleaned}` : cleaned;
	const n = Number(normalized);
	return Number.isFinite(n) ? n : null;
}

function parsePageNumber(block: string): number | null {
	const m =
		/\bPDF\s+PAGE\s+(\d{1,4})\b/i.exec(block) ??
		/\b(\d{1,3})\s+P\.\s*I\.\s*NO\b/i.exec(block) ??
		/\bSHEET\s+(\d{1,3})\b/i.exec(block);
	if (!m) return null;
	const n = Number(m[1]);
	return Number.isFinite(n) ? n : null;
}

function extractRoadwayLogBlock(text: string): string | null {
	const flat = normalizeWhitespace(text);
	const header =
		/\b(?:\(\s*MILES\s*\)\s*)?(?:LOG\s+ROADWAY|ROADWAY\s+LOG|LOG)\s+WIDTH\b/i.exec(flat) ??
		/\bROADWAY\s+LOG\s+WIDTH\b/i.exec(flat);
	if (!header) return null;

	const tail = flat.slice(Math.max(0, header.index - 120), header.index + 12000);
	const end =
		/\bDETAILED ESTIMATE\b/i.exec(tail)?.index ??
		/\bGENERAL NOTES\b/i.exec(tail)?.index ??
		/\bSCHEDULE OF ITEMS\b/i.exec(tail)?.index ??
		tail.length;
	return tail.slice(0, end);
}

function hasRoadwayLogHeader(text: string): boolean {
	const flat = normalizeWhitespace(text);
	if (/\b(?:LOG\s+ROADWAY|ROADWAY\s+LOG|LOG)\s+WIDTH\b/i.test(flat)) return true;

	const lines = text
		.split(/\n+/)
		.map((line) => normalizeWhitespace(line).toUpperCase())
		.filter(Boolean);
	for (let i = 0; i < lines.length; i++) {
		const windowText = lines.slice(i, i + 4).join(' ');
		if (/\bROADWAY\b/.test(windowText) && /\bLOG\b/.test(windowText) && /\bWIDTH\b/.test(windowText)) {
			return true;
		}
	}
	return false;
}

function extractTrailingWidth(description: string): { description: string; width: number | null } {
	const m = /\s+(\d{2,3})(?:\s+\d{1,4})?$/.exec(description);
	if (!m) return { description, width: null };
	const width = Number(m[1]);
	if (!Number.isFinite(width)) return { description, width: null };
	return {
		description: description.slice(0, m.index).trim(),
		width
	};
}

function classify(description: string): {
	event_type: RoadwayLogEventType;
	confidence: FieldConfidence;
	is_reference: boolean;
} {
	const d = description.toUpperCase();
	const isReference = /\bREFERENCE ONLY\b/.test(d);
	if (/\bBEGIN PROJECT\b/.test(d)) {
		return { event_type: 'project_start', confidence: 'high', is_reference: false };
	}
	if (/\bEND PROJECT\b/.test(d)) {
		return { event_type: 'project_end', confidence: 'high', is_reference: isReference };
	}
	if (/\bWIDTH CHANGE\b/.test(d)) {
		return { event_type: 'width_change', confidence: 'high', is_reference: isReference };
	}
	if (/\b(?:BEGIN|END|CONTINUE|MILLING|RESURFACING|INTERLAYER|SHOULDER|TIE-IN)\b/.test(d)) {
		return { event_type: 'operation_change', confidence: 'medium', is_reference: isReference };
	}
	if (/\b[A-Z0-9 .'-]+(?:ROAD|RD|STREET|ST|DRIVE|DR|LANE|LN|AVENUE|AVE|HIGHWAY|HWY)\b/.test(d)) {
		return {
			event_type: isReference ? 'reference' : 'side_road',
			confidence: 'high',
			is_reference: isReference
		};
	}
	return {
		event_type: isReference ? 'reference' : 'note',
		confidence: isReference ? 'medium' : 'low',
		is_reference: isReference
	};
}

function parseSide(description: string): 'left' | 'right' | null {
	const d = description.toUpperCase();
	if (/\bLEFT\b|\bLT\b/.test(d)) return 'left';
	if (/\bRIGHT\b|\bRT\b/.test(d)) return 'right';
	return null;
}

function parseSurface(description: string): 'paved' | 'unpaved' | null {
	const d = description.toUpperCase();
	if (/\bUNPAVED\b/.test(d)) return 'unpaved';
	if (/\bPAVED\b/.test(d)) return 'paved';
	return null;
}

export function parseRoadwayLogEvents(
	text: string,
	sourceIndex: number | null = null
): ParsedRoadwayLogEvent[] {
	const pageChunks = text.split(/\n\f\n|\f/g).filter((chunk) => chunk.trim().length > 0);
	if (pageChunks.length > 1) {
		const events = pageChunks.flatMap((chunk, index) =>
			parseRoadwayLogBlock(chunk, sourceIndex, index + 1)
		);
		if (events.length > 0) {
			return events.map((event, index) => ({ ...event, sort_order: index }));
		}
	}

	return parseRoadwayLogBlock(text, sourceIndex, null);
}

function parseRoadwayLogBlock(
	text: string,
	sourceIndex: number | null,
	fallbackPageNumber: number | null
): ParsedRoadwayLogEvent[] {
	const rowEvents = parseRoadwayLogRows(text, sourceIndex, fallbackPageNumber);
	if (rowEvents.length > 0) return rowEvents;

	const block = extractRoadwayLogBlock(text);
	if (!block) return [];

	const pageNumber = parsePageNumber(block) ?? fallbackPageNumber;
	const milepostRe = /(?:^|[\s.])(\d{0,2}\.\d{3})\s+/g;
	const matches: Array<{ index: number; token: string; rawToken: string }> = [];
	for (let m = milepostRe.exec(block); m; m = milepostRe.exec(block)) {
		const milepost = parseMilepost(m[1]);
		if (milepost == null) continue;
		matches.push({
			index: m.index + m[0].lastIndexOf(m[1]),
			token: String(milepost.toFixed(3)),
			rawToken: m[1]
		});
	}

	const events: ParsedRoadwayLogEvent[] = [];
	for (let i = 0; i < matches.length; i++) {
		const current = matches[i];
		const milepost = parseMilepost(current.rawToken);
		if (milepost == null) continue;
		const next = matches[i + 1];
		const rawSegment = block
			.slice(current.index, next ? next.index : block.length)
			.replace(/\b\d{1,4}\s+\d+\s+P\.\s*I\.\s*NO:.*$/i, '')
			.trim();
		const withoutMarker = rawSegment.slice(current.rawToken.length).trim();
		if (!withoutMarker) continue;

		const { description, width } = extractTrailingWidth(normalizeWhitespace(withoutMarker));
		if (!description) continue;
		const classified = classify(description);
		events.push({
			source_index: sourceIndex,
			page_number: pageNumber,
			milepost,
			station: stationFromMilepost(milepost),
			event_type: classified.event_type,
			description,
			roadway_width_ft: width,
			side: parseSide(description),
			surface: parseSurface(description),
			is_reference: classified.is_reference,
			confidence: classified.confidence,
			raw_text: normalizeWhitespace(rawSegment),
			sort_order: events.length
		});
	}

	return events;
}

function parseMilepostRow(line: string): { milepost: number; rest: string } | null {
	const m = /^\s*((?:\.\d{1,2}\.\d{3})|(?:\.\d{3})|(?:\d{1,2}\.\d{3}))\b\s*(.*)$/.exec(line);
	if (!m) return null;
	const milepost = parseMilepost(m[1]);
	if (milepost == null) return null;
	return { milepost, rest: m[2]?.trim() ?? '' };
}

function isRoadwayLogBoilerplate(line: string): boolean {
	const normalized = normalizeWhitespace(line);
	if (!normalized) return true;
	if (/^\d{1,4}$/.test(normalized)) return true;
	if (/^\(?MILES\)?$/i.test(normalized)) return true;
	if (/^ROADWAY$/i.test(normalized)) return true;
	if (/^LOG(?:\s+WIDTH)?$/i.test(normalized)) return true;
	if (/^WIDTH$/i.test(normalized)) return true;
	if (/^P\.\s*I\.\s*NO\b/i.test(normalized)) return true;
	if (/^[A-Z ]+\s+COUNTY$/i.test(normalized)) return true;
	return false;
}

function parseRoadwayLogRows(
	text: string,
	sourceIndex: number | null,
	fallbackPageNumber: number | null
): ParsedRoadwayLogEvent[] {
	if (!text.includes('\n') || !hasRoadwayLogHeader(text)) return [];

	const lines = text
		.split(/\n+/)
		.map((line) => normalizeWhitespace(line))
		.filter(Boolean);

	const pageNumber = parsePageNumber(text) ?? fallbackPageNumber;
	const events: ParsedRoadwayLogEvent[] = [];
	let pending: string[] = [];

	for (const line of lines) {
		if (/\b(?:DETAILED ESTIMATE|GENERAL NOTES|SCHEDULE OF ITEMS)\b/i.test(line)) break;

		const milepostRow = parseMilepostRow(line);
		if (!milepostRow) {
			if (!isRoadwayLogBoilerplate(line)) pending.push(line);
			continue;
		}

		const combined = [...pending, milepostRow.rest].filter(Boolean).join(' ');
		pending = [];
		const { description, width } = extractTrailingWidth(normalizeWhitespace(combined));
		if (!description) continue;
		const classified = classify(description);
		events.push({
			source_index: sourceIndex,
			page_number: pageNumber,
			milepost: milepostRow.milepost,
			station: stationFromMilepost(milepostRow.milepost),
			event_type: classified.event_type,
			description,
			roadway_width_ft: width,
			side: parseSide(description),
			surface: parseSurface(description),
			is_reference: classified.is_reference,
			confidence: classified.confidence,
			raw_text: normalizeWhitespace([description, width ?? ''].join(' ')),
			sort_order: events.length
		});
	}

	return events;
}
