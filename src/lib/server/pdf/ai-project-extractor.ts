import { field, type FieldConfidence } from './confidence.js';
import {
	parseGdotDocumentsV2,
	type ParsedBidItem,
	type ParsedGdotJobV2,
	type ParsedProductionMix,
	type ParsedRoadwayLogEvent
} from './parse-gdot.js';
import type { WorkersAi } from './llm-fallback.js';
import { PRIMARY_LLM_MODEL, PAGE_OCR_MODEL } from './llm-config.js';

export const DEFAULT_PROJECT_EXTRACTION_MODEL = PRIMARY_LLM_MODEL;
export const DEFAULT_PAGE_OCR_MODEL = PAGE_OCR_MODEL;

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

const SCALAR_EXTRACTION_SCHEMA = {
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
		warnings: { type: 'array', items: { type: 'string' } }
	},
	required: ['fields', 'warnings']
};

const ITEM_EXTRACTION_SCHEMA = {
	type: 'object',
	properties: {
		bid_items: { type: 'array', items: { type: 'object' } },
		production_mixes: { type: 'array', items: { type: 'object' } },
		warnings: { type: 'array', items: { type: 'string' } }
	},
	required: ['bid_items', 'production_mixes', 'warnings']
};

const ROADWAY_EXTRACTION_SCHEMA = {
	type: 'object',
	properties: {
		roadway_log_events: { type: 'array', items: { type: 'object' } },
		warnings: { type: 'array', items: { type: 'string' } }
	},
	required: ['roadway_log_events', 'warnings']
};

const SYSTEM_PROMPT =
	'You extract construction project setup data from paving PDFs. Return only JSON. ' +
	'Every non-null scalar field and every table row must include source_pdf_index, ' +
	'source_filename, and source_page. Use null when the evidence is not present. ' +
	'Do not invent values. Keep bid_quantity (contract/allotted tons) separate from ' +
	'takeoff_tonnage (production target tons).';

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

function scalarExtractionPrompt(pages: EvidencePage[]): string {
	return (
		'Fill these fields when present: ' +
		SCALAR_FIELDS.join(', ') +
		'. Return a top-level JSON object with exactly these keys: fields, warnings. ' +
		'The fields object maps each field name to { value, confidence, source_pdf_index, source_filename, source_page }. ' +
		'Every non-null field must include source evidence. Do not return bid_items, production_mixes, or roadway_log_events. ' +
		'Do not wrap the result in Markdown.\n\n' +
		evidenceText(pages)
	);
}

function itemExtractionPrompt(pages: EvidencePage[]): string {
	return (
		'Extract only contract bid item rows and asphalt production mix rows from these paving pages. ' +
		'For bid_items use line_number, item_id, description, quantity, unit, unit_price, bid_amount, section, is_alternate, selected. ' +
		'For production_mixes use mix_name, mix_type, unit, bid_quantity, takeoff_tonnage, quantity_per_day, est_days, contract_unit_price. ' +
		'Every row must include source_pdf_index, source_filename, and source_page. ' +
		'Keep bid_quantity (contract/allotted tons) separate from takeoff_tonnage (production target tons). ' +
		'Return a top-level JSON object with exactly these keys: bid_items, production_mixes, warnings. ' +
		'Use an empty array when no rows are present. Do not return scalar fields or roadway_log_events. ' +
		'Do not wrap the result in Markdown.\n\n' +
		evidenceText(pages, 7000, 50000)
	);
}

function roadwayExtractionPrompt(pages: EvidencePage[]): string {
	return (
		'Extract only roadway log rows/events from these paving pages. ' +
		'For roadway_log_events use milepost, description, event_type, roadway_width_ft, side, surface, is_reference. ' +
		'Every row must include source_pdf_index, source_filename, and source_page. ' +
		'Return a top-level JSON object with exactly these keys: roadway_log_events, warnings. ' +
		'Use an empty array when no rows are present. Do not return scalar fields, bid_items, or production_mixes. ' +
		'Do not wrap the result in Markdown.\n\n' +
		evidenceText(pages, 7000, 50000)
	);
}

function targetedPages(pages: EvidencePage[], pattern: RegExp): EvidencePage[] {
	const matches = pages.filter((page) => pattern.test(`${page.page_label}\n${page.text}\n${page.ocr_text ?? ''}`));
	return matches.length > 0 ? matches : pages;
}

function parseJsonString(text: string): AiProjectExtraction | null {
	try {
		return JSON.parse(text) as AiProjectExtraction;
	} catch {
		const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
		if (fenced?.[1]) {
			try {
				return JSON.parse(fenced[1]) as AiProjectExtraction;
			} catch {
				const parsed = parseBalancedJsonObject(fenced[1]);
				if (parsed) return parsed;
			}
		}
		return parseBalancedJsonObject(text);
	}
}

/**
 * Generic balanced-brace JSON-object extractor: scans `text` for the first
 * top-level `{...}` whose braces balance (string-aware) and that JSON.parses to
 * an object accepted by `accept`. Shared by the project extractor and the
 * contract structurer so the brace-walking logic lives in one place.
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

function parseBalancedJsonObject(text: string): AiProjectExtraction | null {
	return extractBalancedJsonObject<AiProjectExtraction>(
		text,
		(parsed) => 'fields' in parsed || 'bid_items' in parsed || 'production_mixes' in parsed
	);
}

function extractJson(raw: unknown): AiProjectExtraction | null {
	if (raw == null) return null;
	if (typeof raw === 'string') return parseJsonString(raw);
	if (typeof raw !== 'object') return null;

	const obj = raw as Record<string, unknown>;
	if ('fields' in obj || 'bid_items' in obj || 'production_mixes' in obj) {
		return obj as AiProjectExtraction;
	}

	const directCandidates = [
		obj.response,
		obj.result,
		obj.output,
		obj.text,
		obj.description,
		obj.generated_text
	];
	for (const candidate of directCandidates) {
		const parsed = extractJson(candidate);
		if (parsed) return parsed;
	}

	const choices = obj.choices;
	if (Array.isArray(choices)) {
		for (const choice of choices) {
			const parsed = extractJson(choice);
			if (parsed) return parsed;
			if (choice && typeof choice === 'object') {
				const message = (choice as Record<string, unknown>).message;
				const messageParsed = extractJson(message);
				if (messageParsed) return messageParsed;
				if (message && typeof message === 'object') {
					const contentParsed = extractJson((message as Record<string, unknown>).content);
					if (contentParsed) return contentParsed;
				}
			}
		}
	}

	return null;
}

function describeAiResponse(raw: unknown): string {
	if (raw == null) return 'null';
	if (typeof raw === 'string') return `string:${raw.length}`;
	if (typeof raw !== 'object') return typeof raw;

	const obj = raw as Record<string, unknown>;
	const keys = Object.keys(obj).slice(0, 8).join(',');
	const parts = [`object{${keys}}`];
	for (const key of ['response', 'result', 'output', 'text', 'description', 'generated_text']) {
		if (key in obj) {
			const value = obj[key];
			parts.push(`${key}:${typeof value}${typeof value === 'string' ? `:${value.length}` : ''}`);
		}
	}
	if (Array.isArray(obj.choices)) parts.push(`choices:${obj.choices.length}`);
	return parts.join(' ');
}

async function runProjectModel(
	ai: WorkersAi,
	model: string,
	prompt: string,
	responseFormat: Record<string, unknown>,
	maxTokens = 2048
): Promise<unknown> {
	return ai.run(model, {
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: prompt }
		],
		temperature: 0.1,
		max_tokens: maxTokens,
		response_format: responseFormat
	});
}

function combineExtractions(parts: AiProjectExtraction[]): AiProjectExtraction {
	return {
		fields: Object.assign({}, ...parts.map((part) => part.fields ?? {})),
		bid_items: parts.flatMap((part) => part.bid_items ?? []),
		production_mixes: parts.flatMap((part) => part.production_mixes ?? []),
		roadway_log_events: parts.flatMap((part) => part.roadway_log_events ?? []),
		warnings: parts.flatMap((part) => part.warnings ?? [])
	};
}

async function runTargetedExtraction(
	ai: WorkersAi,
	model: string,
	prompt: string,
	schema: Record<string, unknown>,
	maxTokens: number
): Promise<{ extraction: AiProjectExtraction | null; schemaShape: string; retryShape: string }> {
	const raw = await runProjectModel(
		ai,
		model,
		prompt,
		{
			type: 'json_schema',
			json_schema: schema
		},
		maxTokens
	);

	let extraction = extractJson(raw);
	let retryShape = '';
	if (!extraction) {
		const retryRaw = await runProjectModel(ai, model, prompt, { type: 'json_object' }, maxTokens);
		extraction = extractJson(retryRaw);
		retryShape = describeAiResponse(retryRaw);
	}

	return {
		extraction,
		schemaShape: describeAiResponse(raw),
		retryShape
	};
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
		const itemPages = targetedPages(
			pages,
			/SCHEDULE OF ITEMS|CONTRACT SCHEDULE|PROPOSAL\s+LINE\s+NUMBER|UNIT PRICE\s+BID AMOUNT|DETAILED ESTIMATE|PRODUCTION GOALS|PAVING SECTIONS|BID QUANTIT/i
		);
		const roadwayPages = targetedPages(
			pages,
			/ROADWAY\s+LOG|\bLOG\b.*WIDTH|ROADWAY\s+[\s\S]{0,80}\bLOG\s+WIDTH|TYPICAL SECTION/i
		);
		const runs = [
			await runTargetedExtraction(ai, model, scalarExtractionPrompt(pages), SCALAR_EXTRACTION_SCHEMA, 2048),
			await runTargetedExtraction(ai, model, itemExtractionPrompt(itemPages), ITEM_EXTRACTION_SCHEMA, 3072),
			await runTargetedExtraction(ai, model, roadwayExtractionPrompt(roadwayPages), ROADWAY_EXTRACTION_SCHEMA, 3072)
		];

		const extractions = runs
			.map((run) => run.extraction)
			.filter((extraction): extraction is AiProjectExtraction => extraction != null);

		if (extractions.length === 0) {
			console.log(
				JSON.stringify({
					event: 'pdf_ai_extraction_no_json',
					model,
					pages: pages.length,
					text_chars: pages.reduce((sum, page) => sum + page.text.length + (page.ocr_text?.length ?? 0), 0),
					image_pages: pages.filter((page) => page.image != null).length,
					scalar_schema_response_shape: runs[0].schemaShape,
					scalar_retry_response_shape: runs[0].retryShape,
					item_schema_response_shape: runs[1].schemaShape,
					item_retry_response_shape: runs[1].retryShape,
					roadway_schema_response_shape: runs[2].schemaShape,
					roadway_retry_response_shape: runs[2].retryShape
				})
			);
			return {
				attempted: true,
				applied: false,
				outcome: 'failed',
				model,
				duration_ms: Date.now() - started,
				reason: 'no-json:all-staged-extractions'
			};
		}

		const extraction = combineExtractions(extractions);
		if (extractions.length < runs.length) {
			console.log(
				JSON.stringify({
					event: 'pdf_ai_extraction_partial_json',
					model,
					pages: pages.length,
					applied_stages: extractions.length,
					failed_stages: runs.length - extractions.length,
					scalar_response_shape: runs[0].extraction ? 'parsed' : `${runs[0].schemaShape};retry:${runs[0].retryShape}`,
					item_response_shape: runs[1].extraction ? 'parsed' : `${runs[1].schemaShape};retry:${runs[1].retryShape}`,
					roadway_response_shape: runs[2].extraction ? 'parsed' : `${runs[2].schemaShape};retry:${runs[2].retryShape}`
				})
			);
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
		console.log(
			JSON.stringify({
				event: 'pdf_ai_extraction_error',
				model,
				pages: pages.length,
				text_chars: pages.reduce((sum, page) => sum + page.text.length + (page.ocr_text?.length ?? 0), 0),
				image_pages: pages.filter((page) => page.image != null).length,
				error: err instanceof Error ? err.message : String(err)
			})
		);
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
