/**
 * The strict, single multi-section contract schema produced by the LLM
 * structurer and consumed by the deterministic validate + map stages.
 *
 * One schema fits BOTH document families:
 *  - GDOT state-route roadway-log PDFs  -> mainline/ramp segments with a
 *    `project_mile` measure axis (e.g. an NB/SB common section + a ramp whose
 *    milepost resets to 0).
 *  - Local-street LMIG/LRA contracts (e.g. the City of Butler PDF) -> N
 *    physically disconnected `local_street` segments, `measure_axis: none`,
 *    grouped by funding program (LMIG/LRA).
 *
 * CRITICAL modelling decision: a project is N DISCONNECTED segments (a
 * MultiLineString), NOT one continuous route. Each segment is one named road to
 * pave and is mapped to geometry independently.
 *
 * Provenance: scalar fields reuse {@link ParsedField}<T> (value + confidence +
 * source) from confidence.ts. The matching JSON Schema (for Workers AI
 * `response_format: json_schema`) is intentionally a FLATTER shape than the TS
 * interface — small models structure flat fields more reliably than nested
 * provenance envelopes, so the structurer wraps the model's flat output into
 * ParsedField<T> deterministically after parsing.
 */

import type { ParsedField } from './confidence.js';
import type { ParsedBidItem, ParsedProductionMix } from './parse-gdot.js';

// --------------------------------------------------------------------------
// Enumerations
// --------------------------------------------------------------------------

/** Kind of road carried by a segment. */
export type SegmentKind = 'mainline' | 'ramp' | 'divided' | 'local_street';

/** Surface treatment applied to a segment. */
export type SegmentTreatment =
	| 'overlay'
	| 'resurfacing'
	| 'restripe_only'
	| 'milling'
	| 'patching'
	| 'reconstruction'
	| 'other';

/**
 * Measure axis a segment is stationed along.
 *  - 'project_mile' — GDOT roadway-log milepost axis (state routes/ramps).
 *  - 'none'         — local streets have no project-mile axis.
 */
export type MeasureAxis = 'project_mile' | 'none';

/** Type of a per-segment roadway-log event. */
export type SegmentEventType =
	| 'project_start'
	| 'project_end'
	| 'side_road'
	| 'width_change'
	| 'operation_change'
	| 'reference';

// --------------------------------------------------------------------------
// Sub-structures
// --------------------------------------------------------------------------

/** Route designation, when the contract is a numbered state/US/interstate route. */
export interface ContractRoute {
	/** Compact designation, e.g. "SR 7 ALT", "I-85", "US 23", "CR 124". */
	designation: ParsedField<string>;
	/** Route kind token, e.g. "SR" | "US" | "I" | "CR" | "SR ALT". */
	kind: ParsedField<string>;
	/** Numeric route token, e.g. "7", "85", "23". */
	number: ParsedField<string>;
}

export interface ContractCounty {
	name: ParsedField<string>;
	/** County FIPS / GDOT county number when present. */
	fips: ParsedField<string>;
}

/**
 * Plan mid-point coordinate in State Plane (as printed on the plan). The zone
 * label is reported verbatim — it can LIE (a "WEST ZONE" pin that is actually
 * GA East), so the deterministic CRS cross-check in ga-state-plane.ts decides
 * the real zone. The structurer NEVER reprojects.
 */
export interface ContractMidpoint {
	easting: ParsedField<number>;
	northing: ParsedField<number>;
	zone_label: ParsedField<string>;
}

/**
 * One named side-road / cross-street referenced at a single measure. A
 * multi-road log line (e.g. "WOODROW WILSON DR, LT ... GORNTO RD. RT") is
 * EXPLODED into multiple entries — each road gets its own SideRoad.
 */
export interface SideRoad {
	name: ParsedField<string>;
	/** Approach side, when stated. */
	side: ParsedField<string>;
}

/**
 * Inclusive lower/upper roadway-width band for a pavement applicability range,
 * in feet. A typical section / roadway log often states a width RANGE (e.g.
 * "VARIABLE 48–60 FT"); both bounds are independent {@link ParsedField}s so a
 * single fixed width simply repeats min===max.
 */
export interface RoadwayWidthBand {
	min: ParsedField<number>;
	max: ParsedField<number>;
}

/**
 * One pavement / typical-section specification that applies over a (possibly
 * partial) mile range of a segment. THE CANONICAL pavement shape consumed by the
 * persistence (Phase 6) and review UI (Phase 7) layers — keep it stable.
 *
 * A typical section like "THIS TYPICAL SECTION APPLIES FROM LOG 0.000 TO 2.850 …
 * RESURFACE FULL WIDTH WITH 165 LBS PER SQUARE YARD … 12.5 mm SUPERPAVE … MILL
 * VARIABLE DEPTH (1.5 IN TYPICAL)" maps to ONE of these:
 *  - `lift_thickness_in`   — overlay lift thickness in inches (derived from the
 *    spread rate when only the spread is stated, e.g. 165 lbs/SY ≈ 1.5 in).
 *  - `mill_depth_in`       — milling depth in inches (the "VARIABLE 1.5 IN" mill).
 *  - `spread_rate_lbs_sy`  — asphalt spread rate in lbs per square yard (165).
 *  - `mix`                 — the mix designation verbatim ("12.5 mm SUPERPAVE GP 2").
 *  - `roadway_width_ft`    — the applicable roadway width band (min/max), feet.
 *  - `applies_from_mi` / `applies_to_mi` — the project-mile range this spec
 *    covers (a range may cover only PART of a segment, hence pavement[] is
 *    SEGMENT-level, not project-level).
 *
 * Every scalar is a {@link ParsedField} WITH a per-field citation (source_page /
 * source_file / evidence_type) so the review UI can show "from Page 10 (Typical
 * Section), text". Never invented — null when the document does not state it.
 */
export interface SegmentPavement {
	lift_thickness_in: ParsedField<number>;
	mill_depth_in: ParsedField<number>;
	spread_rate_lbs_sy: ParsedField<number>;
	mix: ParsedField<string>;
	roadway_width_ft: RoadwayWidthBand;
	applies_from_mi: ParsedField<number>;
	applies_to_mi: ParsedField<number>;
}

/**
 * A roadway-log event on a segment. Mirrors handoff section 9: each event has a
 * measure (project mile, null for local streets), a text description, an
 * optional width (for width_change), and an optional exploded list of side
 * roads (for side_road / reference events that name cross-streets).
 */
export interface SegmentEvent {
	type: ParsedField<SegmentEventType>;
	/** Project-mile measure for this event; null on a `none` axis. */
	measure: ParsedField<number>;
	text: ParsedField<string>;
	/** Roadway width in feet (carried by width_change events). */
	width_ft: ParsedField<number>;
	/** Cross-streets named at this measure (multi-road lines exploded). */
	side_roads: SideRoad[];
}

/**
 * One named road to pave. The generalization of "section". A project is a list
 * of these, each mapped to its own centerline.
 */
export interface ContractSegment {
	name: ParsedField<string>;
	kind: ParsedField<SegmentKind>;
	/** Funding program / scope grouping label (e.g. "LMIG", "LRA"). */
	group: ParsedField<string>;
	treatment: ParsedField<SegmentTreatment>;
	length_mi: ParsedField<number>;
	begin_terminus: ParsedField<string>;
	end_terminus: ParsedField<string>;
	measure_axis: ParsedField<MeasureAxis>;
	events: SegmentEvent[];
	/**
	 * Per-mile-range pavement / typical-section specs for this segment. A single
	 * segment can carry MORE than one entry when its typical section changes over
	 * its length (the `applies_from_mi`/`applies_to_mi` ranges partition it).
	 * Empty when the document states no typical-section data.
	 */
	pavement: SegmentPavement[];
}

// --------------------------------------------------------------------------
// Top-level contract
// --------------------------------------------------------------------------

export interface StructuredContract {
	/** Numbered route, or null for local-street contracts. */
	route: ContractRoute | null;
	county: ContractCounty;
	/** Plan mid-point, or null when no State Plane pin is printed. */
	midpoint: ContractMidpoint | null;
	gross_length_mi: ParsedField<number>;
	/** N disconnected segments — a MultiLineString of named roads. */
	segments: ContractSegment[];
	/** Contract bid items (reused shape from parse-gdot.ts). */
	bid_items: ParsedBidItem[];
	/** Asphalt production mixes (reused shape from parse-gdot.ts). */
	production_mixes: ParsedProductionMix[];
	/** Non-fatal validation/structuring notes for the user. */
	warnings: string[];
}

// --------------------------------------------------------------------------
// JSON Schema for Workers AI `response_format: { type: 'json_schema' }`
// --------------------------------------------------------------------------

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };

/**
 * Flat JSON Schema the model is asked to fill. Deliberately flatter than the TS
 * interface (no per-field provenance envelope): the structurer wraps these flat
 * values into ParsedField<T> afterwards. The model is told (in the prompt) to
 * use null for anything absent and to NEVER compute coordinates/measures.
 */
export const STRUCTURED_CONTRACT_SCHEMA = {
	type: 'object',
	properties: {
		route: {
			type: ['object', 'null'],
			description:
				'Numbered route, or null for local-street contracts. "designation" is the FULL route token exactly as written (e.g. "SR 7 ALT", "I-85", "US 23"); "kind" is the route class only (e.g. "SR", "I", "US"); "number" is the numeric token only (e.g. "7", "85").',
			properties: {
				designation: nullableString,
				kind: nullableString,
				number: nullableString
			}
		},
		county: {
			type: 'object',
			properties: {
				name: nullableString,
				fips: nullableString
			}
		},
		midpoint: {
			type: ['object', 'null'],
			properties: {
				easting: nullableNumber,
				northing: nullableNumber,
				zone_label: nullableString
			}
		},
		gross_length_mi: nullableNumber,
		segments: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: nullableString,
					kind: { type: ['string', 'null'], enum: ['mainline', 'ramp', 'divided', 'local_street', null] },
					group: nullableString,
					treatment: nullableString,
					length_mi: nullableNumber,
					begin_terminus: nullableString,
					end_terminus: nullableString,
					measure_axis: { type: ['string', 'null'], enum: ['project_mile', 'none', null] },
					events: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								type: {
									type: ['string', 'null'],
									enum: [
										'project_start',
										'project_end',
										'side_road',
										'width_change',
										'operation_change',
										'reference',
										null
									]
								},
								measure: nullableNumber,
								text: nullableString,
								width_ft: nullableNumber,
								side_roads: {
									type: 'array',
									items: {
										type: 'object',
										properties: {
											name: nullableString,
											side: nullableString
										}
									}
								}
							},
							required: ['type', 'measure', 'text', 'width_ft', 'side_roads']
						}
					},
					pavement: {
						type: 'array',
						description:
							'Per-mile-range pavement / typical-section specs that apply over this segment. Copy values from the Typical Section page or the roadway-log restatement verbatim; null any field the document does not state. lift_thickness_in is the overlay lift thickness in inches; mill_depth_in is the milling depth in inches; spread_rate_lbs_sy is the asphalt spread rate in pounds per square yard (e.g. 165); mix is the mix designation verbatim (e.g. "12.5 mm SUPERPAVE GP 2"); roadway_width_ft is the applicable width band { min, max } in feet (repeat the value in both when a single width); applies_from_mi / applies_to_mi are the project-mile range this spec covers (e.g. 0.000 and 2.850).',
						items: {
							type: 'object',
							properties: {
								lift_thickness_in: nullableNumber,
								mill_depth_in: nullableNumber,
								spread_rate_lbs_sy: nullableNumber,
								mix: nullableString,
								roadway_width_ft: {
									type: ['object', 'null'],
									properties: {
										min: nullableNumber,
										max: nullableNumber
									}
								},
								applies_from_mi: nullableNumber,
								applies_to_mi: nullableNumber
							},
							required: [
								'lift_thickness_in',
								'mill_depth_in',
								'spread_rate_lbs_sy',
								'mix',
								'roadway_width_ft',
								'applies_from_mi',
								'applies_to_mi'
							]
						}
					}
				},
				required: [
					'name',
					'kind',
					'group',
					'treatment',
					'length_mi',
					'begin_terminus',
					'end_terminus',
					'measure_axis',
					'events',
					'pavement'
				]
			}
		},
		bid_items: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					line_number: nullableString,
					item_id: nullableString,
					description: nullableString,
					quantity: nullableNumber,
					unit: nullableString,
					unit_price: nullableNumber,
					bid_amount: nullableNumber,
					section: nullableString,
					is_alternate: { type: ['boolean', 'null'] },
					selected: { type: ['boolean', 'null'] }
				},
				required: ['item_id', 'description', 'quantity', 'unit', 'unit_price', 'bid_amount']
			}
		},
		production_mixes: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					mix_name: nullableString,
					mix_type: nullableString,
					unit: nullableString,
					bid_quantity: nullableNumber,
					takeoff_tonnage: nullableNumber,
					quantity_per_day: nullableNumber,
					est_days: nullableNumber,
					contract_unit_price: nullableNumber
				},
				required: ['mix_name']
			}
		},
		warnings: { type: 'array', items: { type: 'string' } },
		citations: {
			type: ['object', 'null'],
			description:
				'OPTIONAL per-field citations keyed by field path (e.g. "county.name", "route.designation", "gross_length_mi"). Each value is { source_page, source_file, evidence_type } recording WHERE in the document the value was read. Omit a field path when its source page is unknown; never invent a page number.',
			additionalProperties: {
				type: 'object',
				properties: {
					source_page: nullableNumber,
					source_file: nullableString,
					evidence_type: nullableString
				}
			}
		}
	},
	required: ['route', 'county', 'midpoint', 'gross_length_mi', 'segments', 'bid_items', 'production_mixes', 'warnings']
} as const;

// --------------------------------------------------------------------------
// Flat (model-output) mirror of the schema — the shape produced before wrapping
// --------------------------------------------------------------------------

export interface FlatSideRoad {
	name?: string | null;
	side?: string | null;
}

export interface FlatSegmentEvent {
	type?: string | null;
	measure?: number | null;
	text?: string | null;
	width_ft?: number | null;
	side_roads?: FlatSideRoad[] | null;
}

export interface FlatRoadwayWidthBand {
	min?: number | null;
	max?: number | null;
}

export interface FlatSegmentPavement {
	lift_thickness_in?: number | null;
	mill_depth_in?: number | null;
	spread_rate_lbs_sy?: number | null;
	mix?: string | null;
	roadway_width_ft?: FlatRoadwayWidthBand | null;
	applies_from_mi?: number | null;
	applies_to_mi?: number | null;
}

export interface FlatSegment {
	name?: string | null;
	kind?: string | null;
	group?: string | null;
	treatment?: string | null;
	length_mi?: number | null;
	begin_terminus?: string | null;
	end_terminus?: string | null;
	measure_axis?: string | null;
	events?: FlatSegmentEvent[] | null;
	pavement?: FlatSegmentPavement[] | null;
}

/**
 * A per-field citation envelope the model MAY return in the parallel `citations`
 * map (keyed by field path, e.g. "county.name", "gross_length_mi"). Optional and
 * backward-compatible: a model that returns no citations map still parses, and
 * each field defaults to an undefined citation.
 */
export interface FlatFieldCitation {
	source_page?: number | null;
	source_file?: string | null;
	evidence_type?: string | null;
}

export interface FlatStructuredContract {
	route?: { designation?: string | null; kind?: string | null; number?: string | null } | null;
	county?: { name?: string | null; fips?: string | null } | null;
	midpoint?: { easting?: number | null; northing?: number | null; zone_label?: string | null } | null;
	gross_length_mi?: number | null;
	segments?: FlatSegment[] | null;
	bid_items?: Array<Partial<ParsedBidItem>> | null;
	production_mixes?: Array<Partial<ParsedProductionMix>> | null;
	warnings?: string[] | null;
	/**
	 * OPTIONAL parallel citation map keyed by field path (e.g. "county.name",
	 * "route.designation", "gross_length_mi"). The structurer reads each field's
	 * citation from here instead of blanket-stamping a constant source. Absent on
	 * legacy/Workers-AI responses, in which case fields carry no citation.
	 */
	citations?: Record<string, FlatFieldCitation> | null;
}

export const SEGMENT_KINDS: readonly SegmentKind[] = ['mainline', 'ramp', 'divided', 'local_street'];
export const SEGMENT_TREATMENTS: readonly SegmentTreatment[] = [
	'overlay',
	'resurfacing',
	'restripe_only',
	'milling',
	'patching',
	'reconstruction',
	'other'
];
export const SEGMENT_EVENT_TYPES: readonly SegmentEventType[] = [
	'project_start',
	'project_end',
	'side_road',
	'width_change',
	'operation_change',
	'reference'
];
