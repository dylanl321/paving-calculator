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

import { field, type FieldConfidence, type ParsedField } from './confidence.js';
import type { WorkersAi } from './llm-fallback.js';
import {
	type EvidencePage,
	evidenceText,
	extractBalancedJsonObject,
	cleanNumber,
	cleanString
} from './ai-project-extractor.js';
import { PRIMARY_LLM_MODEL, FALLBACK_MODELS } from './llm-config.js';
import {
	STRUCTURED_CONTRACT_SCHEMA,
	SEGMENT_KINDS,
	SEGMENT_TREATMENTS,
	SEGMENT_EVENT_TYPES,
	type StructuredContract,
	type FlatStructuredContract,
	type FlatSegment,
	type FlatSegmentEvent,
	type FlatSideRoad,
	type ContractSegment,
	type SegmentEvent,
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

const SYSTEM_PROMPT =
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
	'- Ignore OCR-garbled typical-section pages; prefer the clean roadway-log table.\n' +
	'- midpoint is the plan State Plane mid-point as printed; copy easting/northing/zone_label verbatim and ' +
	'do NOT reproject. Return null midpoint when none is printed.\n' +
	'Return ONLY the JSON object, no prose, no Markdown fences.';

function userPrompt(pages: EvidencePage[]): string {
	return (
		'Structure the following Georgia paving document into the StructuredContract JSON schema. ' +
		'Produce one segment per named road; explode multi-road lines into side_roads[]; treat milepost ' +
		'resets as new segments; keep "(CONTINUED)" pages in the same segment. ' +
		'Fill route (null for local-street contracts), county, midpoint (null when absent), gross_length_mi, ' +
		'segments[], bid_items[], production_mixes[], and warnings[]. Use null for any absent field.\n\n' +
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

/** Pull a FlatStructuredContract out of the various Workers AI response shapes. */
function extractFlatContract(raw: unknown): FlatStructuredContract | null {
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

function fieldFromString(value: string | null | undefined): ParsedField<string> {
	const v = cleanString(value);
	return v == null ? field.missing<string>(SRC) : field.medium(v, SRC);
}

function fieldFromNumber(value: number | null | undefined): ParsedField<number> {
	const v = cleanNumber(value);
	return v == null ? field.missing<number>(SRC) : field.medium(v, SRC);
}

function fieldFromEnum<T extends string>(
	value: string | null | undefined,
	allowed: readonly T[]
): ParsedField<T> {
	const v = cleanString(value);
	if (v == null) return field.missing<T>(SRC);
	const lower = v.toLowerCase();
	const match = allowed.find((a) => a.toLowerCase() === lower);
	return match ? field.medium(match, SRC) : field.low(v as T, `${SRC}:unmapped`);
}

function wrapSideRoad(raw: FlatSideRoad): SideRoad {
	return {
		name: fieldFromString(raw.name),
		side: fieldFromString(raw.side)
	};
}

function wrapEvent(raw: FlatSegmentEvent): SegmentEvent {
	return {
		type: fieldFromEnum<SegmentEventType>(raw.type, SEGMENT_EVENT_TYPES),
		measure: fieldFromNumber(raw.measure),
		text: fieldFromString(raw.text),
		width_ft: fieldFromNumber(raw.width_ft),
		side_roads: Array.isArray(raw.side_roads) ? raw.side_roads.map(wrapSideRoad) : []
	};
}

function wrapSegment(raw: FlatSegment): ContractSegment {
	const axisRaw = cleanString(raw.measure_axis);
	const axis: MeasureAxis =
		axisRaw && axisRaw.toLowerCase() === 'project_mile' ? 'project_mile' : 'none';
	return {
		name: fieldFromString(raw.name),
		kind: fieldFromEnum<SegmentKind>(raw.kind, SEGMENT_KINDS),
		group: fieldFromString(raw.group),
		treatment: fieldFromEnum<SegmentTreatment>(raw.treatment, SEGMENT_TREATMENTS),
		length_mi: fieldFromNumber(raw.length_mi),
		begin_terminus: fieldFromString(raw.begin_terminus),
		end_terminus: fieldFromString(raw.end_terminus),
		measure_axis: field.medium(axis, SRC),
		events: Array.isArray(raw.events) ? raw.events.map(wrapEvent) : []
	};
}

function wrapBidItem(raw: Partial<ParsedBidItem>): ParsedBidItem | null {
	const description = cleanString(raw.description);
	if (!description) return null;
	return {
		line_number: cleanString(raw.line_number),
		item_id: cleanString(raw.item_id),
		description,
		quantity: cleanNumber(raw.quantity),
		unit: cleanString(raw.unit),
		unit_price: cleanNumber(raw.unit_price),
		bid_amount: cleanNumber(raw.bid_amount),
		section: cleanString(raw.section),
		is_alternate: raw.is_alternate === true,
		selected: raw.selected !== false
	};
}

function wrapProductionMix(raw: Partial<ParsedProductionMix>): ParsedProductionMix | null {
	const mixName = cleanString(raw.mix_name);
	if (!mixName) return null;
	return {
		mix_name: mixName,
		mix_type: cleanString(raw.mix_type),
		unit: cleanString(raw.unit),
		bid_quantity: cleanNumber(raw.bid_quantity),
		takeoff_tonnage: cleanNumber(raw.takeoff_tonnage),
		quantity_per_day: cleanNumber(raw.quantity_per_day),
		est_days: cleanNumber(raw.est_days),
		contract_unit_price: cleanNumber(raw.contract_unit_price)
	};
}

/**
 * Deterministically wrap the model's flat output into the provenance-carrying
 * StructuredContract. Pure (no I/O) so it is unit-testable without the binding.
 */
export function wrapFlatContract(flat: FlatStructuredContract): StructuredContract {
	const routeRaw = flat.route;
	const route =
		routeRaw && (routeRaw.designation || routeRaw.kind || routeRaw.number)
			? {
					designation: fieldFromString(routeRaw.designation),
					kind: fieldFromString(routeRaw.kind),
					number: fieldFromString(routeRaw.number)
				}
			: null;

	const midpointRaw = flat.midpoint;
	const easting = cleanNumber(midpointRaw?.easting);
	const northing = cleanNumber(midpointRaw?.northing);
	const midpoint =
		midpointRaw && (easting != null || northing != null)
			? {
					easting: fieldFromNumber(midpointRaw.easting),
					northing: fieldFromNumber(midpointRaw.northing),
					zone_label: fieldFromString(midpointRaw.zone_label)
				}
			: null;

	const warnings = Array.isArray(flat.warnings)
		? flat.warnings.map((w) => cleanString(w)).filter((w): w is string => w != null)
		: [];

	return {
		route,
		county: {
			name: fieldFromString(flat.county?.name),
			fips: fieldFromString(flat.county?.fips)
		},
		midpoint,
		gross_length_mi: fieldFromNumber(flat.gross_length_mi),
		segments: Array.isArray(flat.segments) ? flat.segments.map(wrapSegment) : [],
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

async function runStructureModel(
	ai: WorkersAi,
	model: string,
	pages: EvidencePage[]
): Promise<unknown> {
	return ai.run(model, {
		messages: [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: userPrompt(pages) }
		],
		temperature: 0,
		max_tokens: 4096,
		response_format: {
			type: 'json_schema',
			json_schema: STRUCTURED_CONTRACT_SCHEMA
		}
	});
}

/**
 * Run the LLM contract structurer over page-labeled evidence. Tries the primary
 * JSON-Mode model, then the documented fallback chain when a model errors or
 * returns no usable JSON. Returns the StructuredContract + a diagnostic.
 *
 * @param ai     Workers AI binding (undefined under local dev -> not attempted).
 * @param pages  Page-labeled evidence (reuse EvidencePage from the extractor).
 * @param models Override model chain (defaults to primary + documented fallbacks).
 */
export async function structureContract(
	ai: WorkersAi | undefined,
	pages: EvidencePage[],
	models: readonly string[] = [PRIMARY_LLM_MODEL, ...FALLBACK_MODELS]
): Promise<StructureContractResult> {
	const started = Date.now();
	if (!ai) {
		return {
			contract: null,
			diagnostic: {
				attempted: true,
				applied: false,
				outcome: 'binding-unavailable',
				model: null,
				duration_ms: Date.now() - started,
				reason: 'ai-binding-unavailable',
				segment_count: 0
			}
		};
	}

	let lastReason = 'no-json';
	for (const model of models) {
		try {
			const raw = await runStructureModel(ai, model, pages);
			const flat = extractFlatContract(raw);
			if (!flat) {
				lastReason = 'no-json';
				continue; // try the next model in the chain
			}
			const contract = wrapFlatContract(flat);
			return {
				contract,
				diagnostic: {
					attempted: true,
					applied: true,
					outcome: 'applied',
					model,
					duration_ms: Date.now() - started,
					reason: 'applied',
					segment_count: contract.segments.length
				}
			};
		} catch (err) {
			// Includes the documented "JSON Mode couldn't be met" error and the
			// Free-plan daily Neuron wall — try the next model, then degrade.
			lastReason = err instanceof Error ? err.message : 'llm-error';
		}
	}

	return {
		contract: null,
		diagnostic: {
			attempted: true,
			applied: false,
			outcome: lastReason === 'no-json' ? 'no-json' : 'failed',
			model: models[0] ?? null,
			duration_ms: Date.now() - started,
			reason: lastReason,
			segment_count: 0
		}
	};
}

/** Convenience: confidence rank helper re-used by the cross-check stage. */
export const CONFIDENCE_RANK: Record<FieldConfidence, number> = { high: 2, medium: 1, low: 0 };
