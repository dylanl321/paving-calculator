/**
 * LLM contract structurer — the LLM-PRIMARY stage of the PDF import pipeline.
 *
 * A single stronger Workers AI model OWNS turning classified, page-labeled
 * evidence text into ONE strict {@link StructuredContract} (multi-segment),
 * which deterministic code then validates and maps to geometry. This supersedes
 * the old flat-field-supplement approach: the model produces the whole sections
 * structure, not just a handful of scalar gap-fills.
 *
 * Constraints baked into the prompt (handoff section 2 + fixture-derived rules):
 *  - STRUCTURE ONLY. Never compute coordinates, project miles, or lengths the
 *    document doesn't state. Copy values verbatim; null when absent.
 *  - A project is N DISCONNECTED segments. Split multi-street and multi-section
 *    documents into one segment per named road.
 *  - A milepost RESET starts a NEW segment with its own axis; never merge axes.
 *  - "(CONTINUED)" page headers are page breaks of the SAME section — do not split.
 *  - Multi-road log lines explode into multiple side_roads[] at one measure.
 *  - width_change events carry width_ft.
 *  - Keep bid_quantity (allotted) separate from takeoff_tonnage (target).
 *  - Ignore OCR-garbled typical-section pages; prefer the clean roadway-log table.
 *
 * temp 0, `response_format: json_schema` with STRUCTURED_CONTRACT_SCHEMA. Robust
 * JSON extraction reuses the shared balanced-brace parser + the model-response
 * unwrapping already in ai-project-extractor.ts (no duplication).
 *
 * Best-effort: any model error, "JSON Mode couldn't be met", missing binding,
 * or unusable JSON returns a diagnostic with `outcome: 'failed' | ...` and a
 * null contract, so the caller falls back to the deterministic regex result.
 */

import { field, type FieldConfidence, type ParsedField, type FieldCitation, type EvidenceType } from './confidence.js';
import type { WorkersAi } from './llm-fallback.js';
import {
	type EvidencePage,
	evidenceText,
	extractBalancedJsonObject,
	cleanNumber,
	cleanString
} from './ai-project-extractor.js';
import { PRIMARY_LLM_MODEL, FALLBACK_MODELS, VISION_MAX_IMAGE_COUNT, VISION_MAX_IMAGE_BYTES } from './llm-config.js';
import {
	type BedrockConfig,
	type BedrockImage,
	bedrockSystemPrompt,
	bedrockImageFormat,
	runBedrockStructure
} from './bedrock-structurer.js';
import {
	STRUCTURED_CONTRACT_SCHEMA,
	SEGMENT_KINDS,
	SEGMENT_TREATMENTS,
	SEGMENT_EVENT_TYPES,
	type StructuredContract,
	type FlatStructuredContract,
	type FlatFieldCitation,
	type FlatSegment,
	type FlatSegmentEvent,
	type FlatSegmentPavement,
	type FlatSideRoad,
	type ContractSegment,
	type SegmentEvent,
	type SegmentPavement,
	type SideRoad,
	type SegmentKind,
	type SegmentTreatment,
	type SegmentEventType,
	type MeasureAxis
} from './structured-contract.js';
import type { ParsedBidItem, ParsedProductionMix } from './parse-gdot.js';

// --------------------------------------------------------------------------
// Diagnostic
// --------------------------------------------------------------------------

export interface StructureContractDiagnostic {
	attempted: boolean;
	applied: boolean;
	outcome: 'applied' | 'binding-unavailable' | 'no-json' | 'failed';
	/** Which engine produced (or attempted) the result. */
	engine: 'bedrock' | 'workers-ai' | null;
	model: string | null;
	duration_ms: number;
	reason: string;
	/** Number of segments the structurer produced (0 when it did not apply). */
	segment_count: number;
}

export interface StructureContractResult {
	contract: StructuredContract | null;
	diagnostic: StructureContractDiagnostic;
}

// --------------------------------------------------------------------------
// Prompt
// --------------------------------------------------------------------------

/**
 * Base system prompt for the paving-contract structurer. Exported so the
 * `paving-contract-v1` extraction profile can own it without duplication.
 */
export const STRUCTURE_SYSTEM_PROMPT =
	'You convert messy Georgia paving contract / plan / roadway-log text into ONE strict JSON object. ' +
	'You STRUCTURE ONLY: copy values that appear in the text verbatim. NEVER compute, infer, or invent ' +
	'coordinates, project mileposts, or lengths that the document does not explicitly state. Use null for ' +
	'anything absent — never guess.\n' +
	'A project is N DISCONNECTED segments (separate named roads), not one continuous route. Output one ' +
	'entry in segments[] per named road to pave.\n' +
	'RULES:\n' +
	'- A milepost that RESETS to a smaller value (e.g. a ramp restarting at 0.000) begins a NEW segment ' +
	'with its own measure_axis. Never merge two milepost axes into one segment.\n' +
	'- A page header containing "(CONTINUED)" is a page break of the SAME section — keep it in the same ' +
	'segment, do not start a new one.\n' +
	'- A single log line that names multiple cross-streets (e.g. "WOODROW WILSON DR, LT ... GORNTO RD. RT") ' +
	'must be EXPLODED into multiple side_roads[] entries at that one measure.\n' +
	'- width_change events MUST carry width_ft (e.g. a 48->60->48 transition across turn lanes).\n' +
	'- State-route / ramp segments use measure_axis "project_mile"; local streets use measure_axis "none" ' +
	'and have no measures.\n' +
	'- Group segments by funding program when stated (e.g. LMIG, LRA) in the group field.\n' +
	'- Map each segment kind to one of: mainline, ramp, divided, local_street. Map each treatment to one of: ' +
	'overlay, resurfacing, restripe_only, milling, patching, reconstruction, other.\n' +
	'- Keep bid_quantity (contract/allotted tons) separate from takeoff_tonnage (production target tons).\n' +
	'- route.designation is the FULL route token verbatim (e.g. "SR 7 ALT"); route.kind is the class only ("SR"); route.number is the number only ("7"). Do not put "7 ALT" in number.\n' +
	'- For bid_items use EXACTLY these keys: line_number, item_id (the pay-item code, e.g. "402-4510"), description, quantity, unit, unit_price, bid_amount, section, is_alternate, selected. Do NOT use item_number or extension.\n' +
	'- For production_mixes use EXACTLY these keys: mix_name, mix_type, unit, bid_quantity, takeoff_tonnage, quantity_per_day, est_days, contract_unit_price.\n' +
	'- EXTRACT typical-section / pavement data into each segment\'s pavement[] and CITE its source page. A typical section like "THIS TYPICAL SECTION APPLIES FROM LOG 0.000 TO 2.850 ... RESURFACE FULL WIDTH WITH 165 LBS PER SQUARE YARD ... 12.5 mm SUPERPAVE ... MILL VARIABLE DEPTH (1.5 IN TYPICAL)" becomes one pavement entry: spread_rate_lbs_sy 165, mix "12.5 mm SUPERPAVE GP 2", mill_depth_in 1.5, roadway_width_ft { min, max } when a width is stated, applies_from_mi 0.000, applies_to_mi 2.850. When BOTH a typical-section page AND a clean roadway-log restatement give the same spec, PREFER the clean roadway-log restatement (the typical-section page is often OCR-garbled) but still cite the page you read. Copy values verbatim; use null for any field the document does not state and NEVER invent a thickness, spread, mill depth, width, or mile range.\n' +
	'- midpoint is the plan State Plane mid-point as printed; copy easting/northing/zone_label verbatim and ' +
	'do NOT reproject. Return null midpoint when none is printed.\n' +
	'- OPTIONALLY include a top-level "citations" object mapping a field path (e.g. "county.name", ' +
	'"route.designation", "gross_length_mi", "segments[0].length_mi") to { source_page, source_file, ' +
	'evidence_type } recording WHERE you read the value. Omit a field path when you are unsure of the page; ' +
	'NEVER invent a page number. evidence_type is one of "text", "vision", "ocr", "mixed".\n' +
	'Return ONLY the JSON object, no prose, no Markdown fences.';

/**
 * Build the user prompt for a set of page-labeled evidence pages. Exported so
 * the `paving-contract-v1` extraction profile reuses it without duplication.
 */
export function buildStructureUserPrompt(pages: EvidencePage[]): string {
	return (
		'Structure the following Georgia paving document into the StructuredContract JSON schema. ' +
		'Produce one segment per named road; explode multi-road lines into side_roads[]; treat milepost ' +
		'resets as new segments; keep "(CONTINUED)" pages in the same segment. ' +
		'Fill route (null for local-street contracts), county, midpoint (null when absent), gross_length_mi, ' +
		'segments[] (including each segment\'s pavement[] typical-section specs when stated), bid_items[], ' +
		'production_mixes[], and warnings[]. Use null for any absent field.\n\n' +
		'Document evidence (page-labeled):\n\n' +
		evidenceText(pages, 7000, 60000)
	);
}

// --------------------------------------------------------------------------
// Model response unwrapping + JSON extraction (reuses shared brace parser)
// --------------------------------------------------------------------------

function looksLikeContract(parsed: Record<string, unknown>): boolean {
	return 'segments' in parsed || 'county' in parsed || 'route' in parsed || 'gross_length_mi' in parsed;
}

/** Pull a FlatStructuredContract out of the various model response shapes
 * (also used by tests to feed a raw Bedrock JSON response through the same path). */
export function extractFlatContract(raw: unknown): FlatStructuredContract | null {
	if (raw == null) return null;

	if (typeof raw === 'string') {
		try {
			const direct = JSON.parse(raw) as Record<string, unknown>;
			if (direct && typeof direct === 'object' && looksLikeContract(direct)) {
				return direct as FlatStructuredContract;
			}
		} catch {
			// fall through to balanced-brace scan
		}
		return extractBalancedJsonObject<FlatStructuredContract>(raw, looksLikeContract);
	}

	if (typeof raw !== 'object') return null;

	const obj = raw as Record<string, unknown>;
	if (looksLikeContract(obj)) return obj as FlatStructuredContract;

	// Common Workers AI envelopes.
	const directCandidates = [obj.response, obj.result, obj.output, obj.text, obj.generated_text];
	for (const candidate of directCandidates) {
		const parsed = extractFlatContract(candidate);
		if (parsed) return parsed;
	}

	const choices = obj.choices;
	if (Array.isArray(choices)) {
		for (const choice of choices) {
			const parsed = extractFlatContract(choice);
			if (parsed) return parsed;
			if (choice && typeof choice === 'object') {
				const message = (choice as Record<string, unknown>).message;
				const messageParsed = extractFlatContract(message);
				if (messageParsed) return messageParsed;
				if (message && typeof message === 'object') {
					const contentParsed = extractFlatContract((message as Record<string, unknown>).content);
					if (contentParsed) return contentParsed;
				}
			}
		}
	}

	return null;
}

// --------------------------------------------------------------------------
// Flat -> ParsedField<T> wrapping (the structurer adds provenance after parse)
// --------------------------------------------------------------------------

const SRC = 'llm-structurer';

const EVIDENCE_TYPES: readonly EvidenceType[] = ['text', 'vision', 'ocr', 'mixed'];

/**
 * Normalize a model-supplied flat citation into a {@link FieldCitation}, or
 * undefined when it carries no usable provenance. Tolerant of stray strings /
 * out-of-range evidence types (drops what it can't map rather than throwing).
 */
function normalizeCitation(raw: FlatFieldCitation | undefined): FieldCitation | undefined {
	if (raw == null) return undefined;
	const page = cleanNumber(raw.source_page);
	const file = cleanString(raw.source_file);
	const evidenceRaw = cleanString(raw.evidence_type)?.toLowerCase();
	const evidence = EVIDENCE_TYPES.find((t) => t === evidenceRaw) ?? null;
	if (page == null && file == null && evidence == null) return undefined;
	return {
		source_page: page,
		source_file: file,
		evidence_type: evidence
	};
}

/**
 * A path-keyed lookup over the model's parallel `citations` map. Returns the
 * citation for a field path (e.g. "county.name") or undefined when the model did
 * not cite it. Built once per contract so the wrap helpers stay pure.
 */
type CitationResolver = (path: string) => FieldCitation | undefined;

function buildCitationResolver(flat: FlatStructuredContract): CitationResolver {
	const map = flat.citations;
	if (map == null || typeof map !== 'object') return () => undefined;
	const cache = new Map<string, FieldCitation | undefined>();
	return (path: string) => {
		if (cache.has(path)) return cache.get(path);
		const resolved = normalizeCitation(map[path]);
		cache.set(path, resolved);
		return resolved;
	};
}

function fieldFromString(
	value: string | null | undefined,
	citation?: FieldCitation
): ParsedField<string> {
	const v = cleanString(value);
	return v == null ? field.missing<string>(SRC, citation) : field.medium(v, SRC, undefined, citation);
}

function fieldFromNumber(
	value: number | null | undefined,
	citation?: FieldCitation
): ParsedField<number> {
	const v = cleanNumber(value);
	return v == null ? field.missing<number>(SRC, citation) : field.medium(v, SRC, undefined, citation);
}

function fieldFromEnum<T extends string>(
	value: string | null | undefined,
	allowed: readonly T[],
	citation?: FieldCitation
): ParsedField<T> {
	const v = cleanString(value);
	if (v == null) return field.missing<T>(SRC, citation);
	const lower = v.toLowerCase();
	const match = allowed.find((a) => a.toLowerCase() === lower);
	return match
		? field.medium(match, SRC, undefined, citation)
		: field.low(v as T, `${SRC}:unmapped`, undefined, citation);
}

function wrapSideRoad(raw: FlatSideRoad, cite: CitationResolver, path: string): SideRoad {
	return {
		name: fieldFromString(raw.name, cite(`${path}.name`)),
		side: fieldFromString(raw.side, cite(`${path}.side`))
	};
}

function wrapEvent(raw: FlatSegmentEvent, cite: CitationResolver, path: string): SegmentEvent {
	return {
		type: fieldFromEnum<SegmentEventType>(raw.type, SEGMENT_EVENT_TYPES, cite(`${path}.type`)),
		measure: fieldFromNumber(raw.measure, cite(`${path}.measure`)),
		text: fieldFromString(raw.text, cite(`${path}.text`)),
		width_ft: fieldFromNumber(raw.width_ft, cite(`${path}.width_ft`)),
		side_roads: Array.isArray(raw.side_roads)
			? raw.side_roads.map((sr, i) => wrapSideRoad(sr, cite, `${path}.side_roads[${i}]`))
			: []
	};
}

/**
 * Wrap one flat pavement / typical-section entry into the citation-carrying
 * {@link SegmentPavement}. Pure; null any field the model omitted. This is the
 * canonical pavement shape Phase 6 persistence + Phase 7 UI build against.
 */
function wrapPavement(raw: FlatSegmentPavement, cite: CitationResolver, path: string): SegmentPavement {
	const width = raw.roadway_width_ft ?? null;
	return {
		lift_thickness_in: fieldFromNumber(raw.lift_thickness_in, cite(`${path}.lift_thickness_in`)),
		mill_depth_in: fieldFromNumber(raw.mill_depth_in, cite(`${path}.mill_depth_in`)),
		spread_rate_lbs_sy: fieldFromNumber(raw.spread_rate_lbs_sy, cite(`${path}.spread_rate_lbs_sy`)),
		mix: fieldFromString(raw.mix, cite(`${path}.mix`)),
		roadway_width_ft: {
			min: fieldFromNumber(width?.min, cite(`${path}.roadway_width_ft.min`)),
			max: fieldFromNumber(width?.max, cite(`${path}.roadway_width_ft.max`))
		},
		applies_from_mi: fieldFromNumber(raw.applies_from_mi, cite(`${path}.applies_from_mi`)),
		applies_to_mi: fieldFromNumber(raw.applies_to_mi, cite(`${path}.applies_to_mi`))
	};
}

function wrapSegment(raw: FlatSegment, cite: CitationResolver, path: string): ContractSegment {
	const axisRaw = cleanString(raw.measure_axis);
	const axis: MeasureAxis =
		axisRaw && axisRaw.toLowerCase() === 'project_mile' ? 'project_mile' : 'none';
	return {
		name: fieldFromString(raw.name, cite(`${path}.name`)),
		kind: fieldFromEnum<SegmentKind>(raw.kind, SEGMENT_KINDS, cite(`${path}.kind`)),
		group: fieldFromString(raw.group, cite(`${path}.group`)),
		treatment: fieldFromEnum<SegmentTreatment>(raw.treatment, SEGMENT_TREATMENTS, cite(`${path}.treatment`)),
		length_mi: fieldFromNumber(raw.length_mi, cite(`${path}.length_mi`)),
		begin_terminus: fieldFromString(raw.begin_terminus, cite(`${path}.begin_terminus`)),
		end_terminus: fieldFromString(raw.end_terminus, cite(`${path}.end_terminus`)),
		measure_axis: field.medium(axis, SRC, undefined, cite(`${path}.measure_axis`)),
		events: Array.isArray(raw.events)
			? raw.events.map((e, i) => wrapEvent(e, cite, `${path}.events[${i}]`))
			: [],
		pavement: Array.isArray(raw.pavement)
			? raw.pavement.map((p, i) => wrapPavement(p, cite, `${path}.pavement[${i}]`))
			: []
	};
}

function wrapBidItem(raw: Partial<ParsedBidItem>): ParsedBidItem | null {
	// Tolerate common alias keys a model may emit instead of our canonical names
	// (e.g. Bedrock returned item_number/extension). Read through a loose record.
	const r = raw as Record<string, unknown>;
	const pick = (...keys: string[]): unknown => {
		for (const k of keys) {
			if (r[k] != null && r[k] !== '') return r[k];
		}
		return undefined;
	};
	const description = cleanString(pick('description', 'desc', 'item_description'));
	if (!description) return null;
	return {
		line_number: cleanString(pick('line_number', 'line', 'line_no')),
		item_id: cleanString(pick('item_id', 'item_number', 'item_no', 'item_code', 'pay_item')),
		description,
		quantity: cleanNumber(pick('quantity', 'qty')),
		unit: cleanString(pick('unit', 'uom')),
		unit_price: cleanNumber(pick('unit_price', 'unitPrice', 'price')),
		bid_amount: cleanNumber(pick('bid_amount', 'extension', 'extension_price', 'amount', 'extended_price')),
		section: cleanString(pick('section')),
		is_alternate: pick('is_alternate', 'alternate') === true,
		selected: pick('selected') !== false
	};
}

function wrapProductionMix(raw: Partial<ParsedProductionMix>): ParsedProductionMix | null {
	const r = raw as Record<string, unknown>;
	const pick = (...keys: string[]): unknown => {
		for (const k of keys) {
			if (r[k] != null && r[k] !== '') return r[k];
		}
		return undefined;
	};
	const mixName = cleanString(pick('mix_name', 'name', 'mix'));
	if (!mixName) return null;
	return {
		mix_name: mixName,
		mix_type: cleanString(pick('mix_type', 'type')),
		unit: cleanString(pick('unit', 'uom')),
		bid_quantity: cleanNumber(pick('bid_quantity', 'allotted', 'bid_qty', 'contract_quantity')),
		takeoff_tonnage: cleanNumber(pick('takeoff_tonnage', 'target', 'takeoff', 'target_tonnage')),
		quantity_per_day: cleanNumber(pick('quantity_per_day', 'qty_per_day', 'daily_quantity')),
		est_days: cleanNumber(pick('est_days', 'estimated_days', 'days')),
		contract_unit_price: cleanNumber(pick('contract_unit_price', 'unit_price', 'price'))
	};
}

/**
 * Deterministically wrap the model's flat output into the provenance-carrying
 * StructuredContract. Pure (no I/O) so it is unit-testable without the binding.
 */
export function wrapFlatContract(flat: FlatStructuredContract): StructuredContract {
	const cite = buildCitationResolver(flat);

	const routeRaw = flat.route;
	const route =
		routeRaw && (routeRaw.designation || routeRaw.kind || routeRaw.number)
			? {
					designation: fieldFromString(routeRaw.designation, cite('route.designation')),
					kind: fieldFromString(routeRaw.kind, cite('route.kind')),
					number: fieldFromString(routeRaw.number, cite('route.number'))
				}
			: null;

	const midpointRaw = flat.midpoint;
	const easting = cleanNumber(midpointRaw?.easting);
	const northing = cleanNumber(midpointRaw?.northing);
	const midpoint =
		midpointRaw && (easting != null || northing != null)
			? {
					easting: fieldFromNumber(midpointRaw.easting, cite('midpoint.easting')),
					northing: fieldFromNumber(midpointRaw.northing, cite('midpoint.northing')),
					zone_label: fieldFromString(midpointRaw.zone_label, cite('midpoint.zone_label'))
				}
			: null;

	const warnings = Array.isArray(flat.warnings)
		? flat.warnings.map((w) => cleanString(w)).filter((w): w is string => w != null)
		: [];

	return {
		route,
		county: {
			name: fieldFromString(flat.county?.name, cite('county.name')),
			fips: fieldFromString(flat.county?.fips, cite('county.fips'))
		},
		midpoint,
		gross_length_mi: fieldFromNumber(flat.gross_length_mi, cite('gross_length_mi')),
		segments: Array.isArray(flat.segments)
			? flat.segments.map((s, i) => wrapSegment(s, cite, `segments[${i}]`))
			: [],
		bid_items: Array.isArray(flat.bid_items)
			? flat.bid_items.map(wrapBidItem).filter((x): x is ParsedBidItem => x != null)
			: [],
		production_mixes: Array.isArray(flat.production_mixes)
			? flat.production_mixes
					.map(wrapProductionMix)
					.filter((x): x is ParsedProductionMix => x != null)
			: [],
		warnings
	};
}

// --------------------------------------------------------------------------
// Model invocation
// --------------------------------------------------------------------------

/** Reject if a promise doesn't settle within `ms`, so one slow model call
 * can't stall the whole import. Workers AI's binding doesn't accept an
 * AbortSignal, so we bound it with a race instead. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
		)
	]);
}

async function runStructureModel(
	ai: WorkersAi,
	model: string,
	pages: EvidencePage[],
	timeoutMs: number
): Promise<unknown> {
	return withTimeout(
		ai.run(model, {
			messages: [
				{ role: 'system', content: STRUCTURE_SYSTEM_PROMPT },
				{ role: 'user', content: buildStructureUserPrompt(pages) }
			],
			temperature: 0,
			max_tokens: 4096,
			response_format: {
				type: 'json_schema',
				json_schema: STRUCTURED_CONTRACT_SCHEMA
			}
		}),
		timeoutMs,
		`structurer:${model}`
	);
}

/** Run the Bedrock primary structurer. Returns a result on success, or null to
 * signal the caller should fall through to the Workers AI chain (logged). */
async function tryBedrockStructure(
	bedrock: BedrockConfig,
	pages: EvidencePage[],
	startedAt: number,
	timeoutMs: number,
	images: readonly BedrockImage[]
): Promise<StructureContractResult | null> {
	const bedrockStarted = Date.now();
	try {
		const raw = await runBedrockStructure(
			bedrock,
			bedrockSystemPrompt(STRUCTURE_SYSTEM_PROMPT, STRUCTURED_CONTRACT_SCHEMA),
			buildStructureUserPrompt(pages),
			AbortSignal.timeout(timeoutMs),
			images
		);
		const flat = extractFlatContract(raw);
		if (!flat) {
			console.log(
				JSON.stringify({
					event: 'pdf_structure_contract',
					engine: 'bedrock',
					outcome: 'no-json',
					model: bedrock.model,
					model_ms: Date.now() - bedrockStarted,
					pages: pages.length,
					images: images.length
				})
			);
			return null; // fall through to Workers AI
		}
		const contract = wrapFlatContract(flat);
		console.log(
			JSON.stringify({
				event: 'pdf_structure_contract',
				engine: 'bedrock',
				outcome: 'applied',
				model: bedrock.model,
				model_ms: Date.now() - bedrockStarted,
				duration_ms: Date.now() - startedAt,
				pages: pages.length,
				images: images.length,
				segment_count: contract.segments.length
			})
		);
		return {
			contract,
			diagnostic: {
				attempted: true,
				applied: true,
				outcome: 'applied',
				engine: 'bedrock',
				model: bedrock.model,
				duration_ms: Date.now() - startedAt,
				reason: 'applied',
				segment_count: contract.segments.length
			}
		};
	} catch (err) {
		const reason = err instanceof Error ? err.message : 'bedrock-error';
		console.log(
			JSON.stringify({
				event: 'pdf_structure_contract',
				engine: 'bedrock',
				outcome: 'error',
				model: bedrock.model,
				model_ms: Date.now() - bedrockStarted,
				error: reason
			})
		);
		return null; // fall through to Workers AI
	}
}

export interface StructureContractOptions {
	/** Bedrock primary engine config; when present it is tried before Workers AI. */
	bedrock?: BedrockConfig | null;
	/** Workers AI model chain (defaults to primary + documented fallbacks). */
	models?: readonly string[];
	/** Per-model timeout (also bounds the Bedrock call). */
	perModelTimeoutMs?: number;
	/**
	 * Profile-selected diagram / low-text pages whose client-rendered image bytes
	 * should be sent to Bedrock as vision content blocks (hybrid text+vision,
	 * Phase 2). Bedrock-only: the Workers AI fallback path ignores these. Each
	 * page contributes one image when it has `image` bytes and a mappable MIME.
	 */
	visionPages?: readonly EvidencePage[];
}

/**
 * Build the bounded {@link BedrockImage} list from profile-selected vision pages.
 * Drops pages with no image bytes, an unsupported MIME, or oversized bytes, and
 * caps the count for the token budget. Pure; safe to call with an empty list.
 */
function buildVisionImages(pages: readonly EvidencePage[] | undefined): BedrockImage[] {
	if (!pages || pages.length === 0) return [];
	const images: BedrockImage[] = [];
	for (const p of pages) {
		if (images.length >= VISION_MAX_IMAGE_COUNT) break;
		const bytes = p.image;
		if (!bytes || bytes.byteLength === 0 || bytes.byteLength > VISION_MAX_IMAGE_BYTES) continue;
		const mime = p.image_mime_type ?? 'image/jpeg';
		if (!bedrockImageFormat(mime)) continue;
		images.push({ bytes, mime_type: mime });
	}
	return images;
}

/**
 * Run the contract structurer over page-labeled evidence. Tries AWS Bedrock
 * (Claude Sonnet 4) FIRST when configured — it reliably satisfies the strict
 * multi-segment schema — then falls back to the Workers AI JSON-Mode chain
 * (Kimi -> Llama) on a missing key / error / no-json. Returns the
 * StructuredContract + a diagnostic.
 *
 * @param ai      Workers AI binding (undefined under local dev -> fallback skipped).
 * @param pages   Page-labeled evidence (reuse EvidencePage from the extractor).
 * @param options Bedrock config + Workers AI chain/timeout overrides.
 */
export async function structureContract(
	ai: WorkersAi | undefined,
	pages: EvidencePage[],
	options: StructureContractOptions = {}
): Promise<StructureContractResult> {
	const started = Date.now();
	const models = options.models ?? [PRIMARY_LLM_MODEL, ...FALLBACK_MODELS];
	const perModelTimeoutMs = options.perModelTimeoutMs ?? 90000;
	const visionImages = buildVisionImages(options.visionPages);

	// 1. Bedrock primary (when a key is configured).
	if (options.bedrock) {
		const bedrockResult = await tryBedrockStructure(
			options.bedrock,
			pages,
			started,
			perModelTimeoutMs,
			visionImages
		);
		if (bedrockResult) return bedrockResult;
		// else: logged, fall through to Workers AI below.
	}

	// 2. Workers AI fallback chain.
	if (!ai) {
		return {
			contract: null,
			diagnostic: {
				attempted: true,
				applied: false,
				outcome: 'binding-unavailable',
				engine: options.bedrock ? 'bedrock' : 'workers-ai',
				model: null,
				duration_ms: Date.now() - started,
				reason: options.bedrock ? 'bedrock-failed-and-no-ai-binding' : 'ai-binding-unavailable',
				segment_count: 0
			}
		};
	}

	let lastReason = 'no-json';
	for (const model of models) {
		const modelStarted = Date.now();
		try {
			const raw = await runStructureModel(ai, model, pages, perModelTimeoutMs);
			const flat = extractFlatContract(raw);
			if (!flat) {
				lastReason = 'no-json';
				console.log(
					JSON.stringify({
						event: 'pdf_structure_contract',
						engine: 'workers-ai',
						outcome: 'no-json',
						model,
						model_ms: Date.now() - modelStarted,
						pages: pages.length
					})
				);
				continue; // try the next model in the chain
			}
			const contract = wrapFlatContract(flat);
			console.log(
				JSON.stringify({
					event: 'pdf_structure_contract',
					engine: 'workers-ai',
					outcome: 'applied',
					model,
					model_ms: Date.now() - modelStarted,
					duration_ms: Date.now() - started,
					pages: pages.length,
					segment_count: contract.segments.length
				})
			);
			return {
				contract,
				diagnostic: {
					attempted: true,
					applied: true,
					outcome: 'applied',
					engine: 'workers-ai',
					model,
					duration_ms: Date.now() - started,
					reason: 'applied',
					segment_count: contract.segments.length
				}
			};
		} catch (err) {
			// Includes a per-model timeout, the documented "JSON Mode couldn't be
			// met" error, and the Free-plan daily Neuron wall — try the next model.
			lastReason = err instanceof Error ? err.message : 'llm-error';
			console.log(
				JSON.stringify({
					event: 'pdf_structure_contract',
					engine: 'workers-ai',
					outcome: 'error',
					model,
					model_ms: Date.now() - modelStarted,
					error: lastReason
				})
			);
		}
	}

	return {
		contract: null,
		diagnostic: {
			attempted: true,
			applied: false,
			outcome: lastReason === 'no-json' ? 'no-json' : 'failed',
			engine: 'workers-ai',
			model: models[0] ?? null,
			duration_ms: Date.now() - started,
			reason: lastReason,
			segment_count: 0
		}
	};
}

/** Convenience: confidence rank helper re-used by the cross-check stage. */
export const CONFIDENCE_RANK: Record<FieldConfidence, number> = { high: 2, medium: 1, low: 0 };
