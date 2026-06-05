import { field, type FieldConfidence } from './confidence.js';
import {
	parseGdotDocumentsV2,
	type ParsedBidItem,
	type ParsedGdotJobV2,
	type ParsedProductionMix,
	type ParsedRoadwayLogEvent
} from './parse-gdot.js';
import type { WorkersAi } from './llm-fallback.js';

export const DEFAULT_PROJECT_EXTRACTION_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
export const DEFAULT_PAGE_OCR_MODEL = '@cf/unum/uform-gen2-qwen-500m';

export interface EvidencePage {
	pdf_index: number;
	filename: string;
	page_number: number;
	page_label: string;
	text: string;
	image?: ArrayBuffer;
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

const PROJECT_EXTRACTION_SCHEMA = {
	type: 'object',
	properties: {
		fields: {
			type: 'object',
			additionalProperties: {
				type: 'object',
				properties: {
					value: { type: ['string', 'number', 'null'] },
					confidence: { type: ['number', 'string', 'null'] },
					source_pdf_index: { type: ['number', 'null'] },
					source_filename: { type: ['string', 'null'] },
					source_page: { type: ['number', 'null'] }
				}
			}
		},
		bid_items: { type: 'array', items: { type: 'object' } },
		production_mixes: { type: 'array', items: { type: 'object' } },
		roadway_log_events: { type: 'array', items: { type: 'object' } },
		warnings: { type: 'array', items: { type: 'string' } }
	},
	required: ['fields', 'bid_items', 'production_mixes', 'roadway_log_events', 'warnings']
};

const SYSTEM_PROMPT =
	'You extract construction project setup data from paving PDFs. Return only JSON. ' +
	'Every non-null scalar field and every table row must include source_pdf_index, ' +
	'source_filename, and source_page. Use null when the evidence is not present. ' +
	'Do not invent values. Keep bid_quantity (contract/allotted tons) separate from ' +
	'takeoff_tonnage (production target tons).';

function extractionPrompt(pages: EvidencePage[]): string {
	const evidence = pages
		.map((page) => {
			const text = [page.text, page.ocr_text].filter(Boolean).join('\n');
			return [
				`PDF ${page.pdf_index}: ${page.filename}`,
				`Page ${page.page_number}: ${page.page_label}`,
				text.slice(0, 6000)
			].join('\n');
		})
		.join('\n\n---\n\n')
		.slice(0, 90000);

	return (
		'Fill these fields when present: ' +
		SCALAR_FIELDS.join(', ') +
		'. Also extract bid_items, production_mixes, and roadway_log_events when present. ' +
		'For bid_items use line_number, item_id, description, quantity, unit, unit_price, bid_amount, section, is_alternate, selected. ' +
		'For production_mixes use mix_name, mix_type, unit, bid_quantity, takeoff_tonnage, quantity_per_day, est_days, contract_unit_price. ' +
		'For roadway_log_events use milepost, description, event_type, roadway_width_ft, side, surface, is_reference. ' +
		'Return JSON matching the supplied schema.\n\n' +
		evidence
	);
}

function extractJson(raw: unknown): AiProjectExtraction | null {
	const candidate =
		raw && typeof raw === 'object' && 'response' in raw
			? (raw as { response: unknown }).response
			: raw;

	if (candidate && typeof candidate === 'object') return candidate as AiProjectExtraction;
	if (typeof candidate === 'string') {
		try {
			return JSON.parse(candidate) as AiProjectExtraction;
		} catch {
			const match = /\{[\s\S]*\}/.exec(candidate);
			if (!match) return null;
			try {
				return JSON.parse(match[0]) as AiProjectExtraction;
			} catch {
				return null;
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

function cleanString(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const s = v.trim();
	return s === '' ? null : s;
}

function cleanNumber(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string') {
		const n = Number(v.replace(/[$,\s]/g, ''));
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function valuesAgree(a: unknown, b: unknown): boolean {
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

function asRoadwayEvent(row: AiRoadwayLogEvent): ParsedRoadwayLogEvent | null {
	const src = sourceOf(row);
	if (!src) return null;
	const milepost = cleanNumber(row.milepost);
	const description = cleanString(row.description);
	if (milepost == null || !description) return null;
	return {
		source_index: typeof row.source_pdf_index === 'number' ? row.source_pdf_index : null,
		page_number: typeof row.source_page === 'number' ? row.source_page : null,
		milepost,
		description,
		event_type: cleanString(row.event_type) ?? 'note',
		roadway_width_ft: cleanNumber(row.roadway_width_ft),
		side: row.side === 'left' || row.side === 'right' ? row.side : null,
		surface: row.surface === 'paved' || row.surface === 'unpaved' ? row.surface : null,
		is_reference: row.is_reference === true
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

export async function ocrEvidenceImages(ai: WorkersAi | undefined, pages: EvidencePage[]): Promise<void> {
	if (!ai) return;
	const pagesNeedingOcr = pages.filter((page) => page.image && page.text.trim().length < 80);
	for (const page of pagesNeedingOcr) {
		const bytes = new Uint8Array(page.image!);
		let binary = '';
		for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
		const image = btoa(binary);
		try {
			const raw = await ai.run(DEFAULT_PAGE_OCR_MODEL, {
				image,
				prompt: 'Transcribe all readable text on this construction PDF page. Return text only.',
				max_tokens: 1200
			});
			const text =
				raw && typeof raw === 'object' && 'description' in raw
					? (raw as { description: unknown }).description
					: raw;
			if (typeof text === 'string' && text.trim()) page.ocr_text = text.trim();
		} catch {
			// OCR is best-effort; project extraction can still use selectable text.
		}
	}
}

export async function runAiProjectExtraction(
	ai: WorkersAi | undefined,
	pages: EvidencePage[],
	v2: ParsedGdotJobV2,
	model = DEFAULT_PROJECT_EXTRACTION_MODEL
): Promise<AiExtractionDiagnostic> {
	const started = Date.now();
	if (!ai) {
		return {
			attempted: true,
			applied: false,
			outcome: 'binding-unavailable',
			model: null,
			duration_ms: Date.now() - started,
			reason: 'ai-binding-unavailable'
		};
	}

	try {
		await ocrEvidenceImages(ai, pages);
		const raw = await ai.run(model, {
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: extractionPrompt(pages) }
			],
			response_format: {
				type: 'json_schema',
				json_schema: PROJECT_EXTRACTION_SCHEMA
			}
		});

		const extraction = extractJson(raw);
		if (!extraction) {
			return {
				attempted: true,
				applied: false,
				outcome: 'failed',
				model,
				duration_ms: Date.now() - started,
				reason: 'no-json'
			};
		}

		const applied = mergeAiExtraction(v2, extraction);
		return {
			attempted: true,
			applied,
			outcome: applied ? 'applied' : 'deterministic-fallback',
			model,
			duration_ms: Date.now() - started,
			reason: applied ? 'applied' : 'no-usable-evidence'
		};
	} catch (err) {
		return {
			attempted: true,
			applied: false,
			outcome: 'failed',
			model,
			duration_ms: Date.now() - started,
			reason: err instanceof Error ? err.message : 'ai-extraction-error'
		};
	}
}

export function parseDeterministicFromEvidence(pagesByFile: EvidencePage[][]): ParsedGdotJobV2 {
	const texts = pagesByFile.map((pages) => pages.map((page) => page.text).join('\n\f\n'));
	return parseGdotDocumentsV2(texts);
}
