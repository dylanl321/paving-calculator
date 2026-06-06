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
					'events'
				]
			}
		},
		bid_items: { type: 'array', items: { type: 'object' } },
		production_mixes: { type: 'array', items: { type: 'object' } },
		warnings: { type: 'array', items: { type: 'string' } }
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
