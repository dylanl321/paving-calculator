import { field, type FieldConfidence } from './confidence.js';
import {
	parseGdotDocumentsV2,
	type ParsedBidItem,
	type ParsedGdotJobV2,
	type ParsedProductionMix
} from './parse-gdot.js';
import type { ParsedRoadwayLogEvent, RoadwayLogEventType } from './roadway-log.js';
import { stationFromMilepost } from './roadway-log.js';

export interface EvidencePage {
	pdf_index: number;
	filename: string;
	page_number: number;
	page_label: string;
	text: string;
	image?: ArrayBuffer;
	/** Browser MIME of `image` (e.g. `image/jpeg`); used to pick the Bedrock vision format token. */
	image_mime_type?: string;
	ocr_text?: string;
}

export interface AiExtractionDiagnostic {
	attempted: boolean;
	applied: boolean;
	outcome: 'applied' | 'deterministic-fallback' | 'binding-unavailable' | 'failed';
	model: string | null;
	duration_ms: number | null;
	reason: string;
}

interface AiField<T> {
	value?: T | null;
	confidence?: string | number | null;
	source_pdf_index?: number | null;
	source_filename?: string | null;
	source_page?: number | null;
}

interface AiProjectExtraction {
	fields?: Record<string, AiField<unknown>>;
	bid_items?: AiBidItem[];
	production_mixes?: AiProductionMix[];
	roadway_log_events?: AiRoadwayLogEvent[];
	warnings?: string[];
}

interface AiBidItem extends Partial<ParsedBidItem> {
	source_pdf_index?: number | null;
	source_filename?: string | null;
	source_page?: number | null;
}

interface AiProductionMix extends Partial<ParsedProductionMix> {
	source_pdf_index?: number | null;
	source_filename?: string | null;
	source_page?: number | null;
}

interface AiRoadwayLogEvent extends Partial<ParsedRoadwayLogEvent> {
	source_pdf_index?: number | null;
	source_filename?: string | null;
	source_page?: number | null;
}

const SCALAR_FIELDS = [
	'name',
	'job_number',
	'project_number',
	'contract_id',
	'county',
	'county_number',
	'work_type',
	'contract_type',
	'contract_amount',
	'retainage_pct',
	'est_start_date',
	'completion_date',
	'customer_name',
	'customer_address',
	'customer_contact',
	'customer_phone',
	'customer_email',
	'owner_name',
	'owner_address',
	'project_manager',
	'asphalt_supplier',
	'total_length_ft',
	'location_description',
	'route_designation',
	'midpoint_easting',
	'midpoint_northing',
	'midpoint_zone_label',
	'gross_length_mi',
	'begin_terminus',
	'end_terminus'
] as const;

type ScalarKey = (typeof SCALAR_FIELDS)[number];

const NUMERIC_FIELDS = new Set<ScalarKey>([
	'contract_amount',
	'retainage_pct',
	'total_length_ft',
	'midpoint_easting',
	'midpoint_northing',
	'gross_length_mi'
]);

const ROUTE_CRITICAL_FIELDS = new Set<ScalarKey>([
	'county',
	'route_designation',
	'location_description',
	'begin_terminus',
	'end_terminus',
	'total_length_ft',
	'gross_length_mi'
]);

export function evidenceText(pages: EvidencePage[], perPageChars = 4000, totalChars = 50000): string {
	const evidence = pages
		.map((page) => {
			const text = [page.text, page.ocr_text].filter(Boolean).join('\n');
			return [
				`PDF ${page.pdf_index}: ${page.filename}`,
				`Page ${page.page_number}: ${page.page_label}`,
				text.slice(0, perPageChars)
			].join('\n');
		})
		.join('\n\n---\n\n')
		.slice(0, totalChars);

	return evidence;
}

/**
 * Generic balanced-brace JSON-object extractor: scans `text` for the first
 * top-level `{...}` whose braces balance (string-aware) and that JSON.parses to
 * an object accepted by `accept`. Shared by the contract structurer so the
 * brace-walking logic lives in one place.
 *
 * @param text   Raw model output that may have prose/markdown around the JSON.
 * @param accept Predicate that returns true when the parsed object is the shape
 *               the caller wants (lets two callers reuse the same walker).
 */
export function extractBalancedJsonObject<T>(
	text: string,
	accept: (parsed: Record<string, unknown>) => boolean
): T | null {
	for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
		let depth = 0;
		let inString = false;
		let escaped = false;

		for (let i = start; i < text.length; i++) {
			const ch = text[i];
			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (ch === '\\') {
					escaped = true;
				} else if (ch === '"') {
					inString = false;
				}
				continue;
			}

			if (ch === '"') {
				inString = true;
			} else if (ch === '{') {
				depth += 1;
			} else if (ch === '}') {
				depth -= 1;
				if (depth === 0) {
					const candidate = text.slice(start, i + 1);
					try {
						const parsed = JSON.parse(candidate) as unknown;
						if (parsed && typeof parsed === 'object' && accept(parsed as Record<string, unknown>)) {
							return parsed as T;
						}
					} catch {
						break;
					}
				}
			}
		}
	}
	return null;
}

function sourceOf(f: AiField<unknown> | { source_filename?: string | null; source_page?: number | null }): string | null {
	if (!f.source_filename || typeof f.source_page !== 'number') return null;
	return `ai:${f.source_filename}:p${f.source_page}`;
}

function confidenceOf(raw: AiField<unknown>, hasSource: boolean): FieldConfidence {
	if (!hasSource) return 'low';
	if (typeof raw.confidence === 'number') {
		if (raw.confidence >= 0.85) return 'medium';
		if (raw.confidence >= 0.55) return 'medium';
		return 'low';
	}
	if (typeof raw.confidence === 'string') {
		const c = raw.confidence.toLowerCase();
		if (c.includes('low')) return 'low';
		return 'medium';
	}
	return 'medium';
}

export function cleanString(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const s = v.trim();
	return s === '' ? null : s;
}

export function cleanNumber(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string') {
		const n = Number(v.replace(/[$,\s]/g, ''));
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

export function valuesAgree(a: unknown, b: unknown): boolean {
	if (a == null || b == null) return false;
	if (typeof a === 'number' || typeof b === 'number') {
		const an = cleanNumber(a);
		const bn = cleanNumber(b);
		if (an == null || bn == null) return false;
		return Math.abs(an - bn) <= Math.max(0.01, Math.abs(an) * 0.001);
	}
	return String(a).replace(/\s+/g, ' ').trim().toLowerCase() ===
		String(b).replace(/\s+/g, ' ').trim().toLowerCase();
}

function setAiScalar(v2: ParsedGdotJobV2, key: ScalarKey, raw: AiField<unknown>): boolean {
	const src = sourceOf(raw);
	const hasSource = src != null;
	const value = NUMERIC_FIELDS.has(key) ? cleanNumber(raw.value) : cleanString(raw.value);
	if (value == null) return false;

	const current = v2[key];
	const aiField = confidenceOf(raw, hasSource) === 'low'
		? field.low(value as never, src ?? 'ai:no-source')
		: field.medium(value as never, src ?? 'ai:no-source');

	if (current.value == null || current.confidence === 'low') {
		v2[key] = aiField as never;
		return hasSource;
	}

	if (valuesAgree(current.value, value)) {
		v2[key] = field.high(current.value as never, `deterministic+${src ?? 'ai:no-source'}`) as never;
		return hasSource;
	}

	const reason = `${key} differs between deterministic parser (${current.value}) and AI (${value}); deterministic value retained.`;
	if (ROUTE_CRITICAL_FIELDS.has(key) || current.confidence === 'high') {
		if (!v2.warnings.includes(reason)) v2.warnings.push(reason);
		return false;
	}

	v2[key] = aiField as never;
	return hasSource;
}

function asBidItem(row: AiBidItem): ParsedBidItem | null {
	const src = sourceOf(row);
	if (!src) return null;
	const description = cleanString(row.description);
	if (!description) return null;
	return {
		line_number: cleanString(row.line_number),
		item_id: cleanString(row.item_id),
		description,
		quantity: cleanNumber(row.quantity),
		unit: cleanString(row.unit),
		unit_price: cleanNumber(row.unit_price),
		bid_amount: cleanNumber(row.bid_amount),
		section: cleanString(row.section),
		is_alternate: row.is_alternate === true,
		selected: row.selected !== false
	};
}

function asProductionMix(row: AiProductionMix): ParsedProductionMix | null {
	const src = sourceOf(row);
	if (!src) return null;
	const mixName = cleanString(row.mix_name);
	if (!mixName) return null;
	return {
		mix_name: mixName,
		mix_type: cleanString(row.mix_type),
		unit: cleanString(row.unit),
		bid_quantity: cleanNumber(row.bid_quantity),
		takeoff_tonnage: cleanNumber(row.takeoff_tonnage),
		quantity_per_day: cleanNumber(row.quantity_per_day),
		est_days: cleanNumber(row.est_days),
		contract_unit_price: cleanNumber(row.contract_unit_price)
	};
}

function asRoadwayEvent(row: AiRoadwayLogEvent, index: number): ParsedRoadwayLogEvent | null {
	const src = sourceOf(row);
	if (!src) return null;
	const milepost = cleanNumber(row.milepost);
	const description = cleanString(row.description);
	if (milepost == null || !description) return null;
	const eventType = cleanString(row.event_type);
	const ROADWAY_LOG_EVENT_TYPES: RoadwayLogEventType[] = [
		'project_start',
		'project_end',
		'operation_change',
		'width_change',
		'side_road',
		'reference',
		'note'
	];
	return {
		source_index: typeof row.source_pdf_index === 'number' ? row.source_pdf_index : null,
		page_number: typeof row.source_page === 'number' ? row.source_page : null,
		milepost,
		station: stationFromMilepost(milepost),
		event_type: ROADWAY_LOG_EVENT_TYPES.includes(eventType as RoadwayLogEventType)
			? (eventType as RoadwayLogEventType)
			: 'note',
		description,
		roadway_width_ft: cleanNumber(row.roadway_width_ft),
		side: row.side === 'left' || row.side === 'right' ? row.side : null,
		surface: row.surface === 'paved' || row.surface === 'unpaved' ? row.surface : null,
		is_reference: row.is_reference === true,
		confidence: 'medium',
		raw_text: description,
		sort_order: index
	};
}

export function mergeAiExtraction(v2: ParsedGdotJobV2, extraction: AiProjectExtraction): boolean {
	let applied = false;
	for (const key of SCALAR_FIELDS) {
		const raw = extraction.fields?.[key];
		if (raw && setAiScalar(v2, key, raw)) applied = true;
	}

	const aiBidItems = (extraction.bid_items ?? []).map(asBidItem).filter((x): x is ParsedBidItem => x != null);
	if (v2.bid_items.length === 0 && aiBidItems.length > 0) {
		v2.bid_items = aiBidItems.map((it) => ({ ...it, confidence: 'medium' }));
		applied = true;
	}

	const aiMixes = (extraction.production_mixes ?? []).map(asProductionMix).filter((x): x is ParsedProductionMix => x != null);
	if (v2.production_mixes.length === 0 && aiMixes.length > 0) {
		v2.production_mixes = aiMixes.map((mix) => ({ ...mix, confidence: 'medium' }));
		applied = true;
	}

	const aiEvents = (extraction.roadway_log_events ?? [])
		.map(asRoadwayEvent)
		.filter((x): x is ParsedRoadwayLogEvent => x != null);
	if (v2.roadway_log_events.length === 0 && aiEvents.length > 0) {
		v2.roadway_log_events = aiEvents;
		applied = true;
	}

	for (const warning of extraction.warnings ?? []) {
		const w = cleanString(warning);
		if (w && !v2.warnings.includes(w)) v2.warnings.push(w);
	}

	return applied;
}

export function parseDeterministicFromEvidence(pagesByFile: EvidencePage[][]): ParsedGdotJobV2 {
	const texts = pagesByFile.map((pages) => pages.map((page) => page.text).join('\n\f\n'));
	return parseGdotDocumentsV2(texts);
}
