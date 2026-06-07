/**
 * Client-facing types for the `/api/job-sites/import-pdf` response.
 *
 * The import review page (`dashboard/job-sites/import/+page.svelte`) previously
 * declared these shapes locally AND repeated a near-identical inline type at the
 * `res.json()` cast site. This module is the SINGLE shared source of truth for
 * the response shape so the page imports one {@link ImportPdfResponse} instead
 * of duplicating it.
 *
 * It lives under `$lib/types` (not `$lib/server`) so the client page can import
 * it; it intentionally mirrors the server's `ImportPdfResponse` at the JSON
 * boundary (the server file can't be imported client-side). Structural, not
 * nominal — runtime behaviour is unchanged.
 */

import type { FieldConfidenceMap } from '$lib/utils/review-confidence';

export type { FieldConfidenceMap };

/**
 * Per-field provenance + confidence keyed by dotted field path (e.g.
 * `county.name`, `segments[0].pavement[0].spread_rate_lbs_sy`). First-class
 * replacement for the flat `field_confidence`/`field_source` maps (Phase 4).
 */
export interface FieldMeta {
	confidence: 'high' | 'medium' | 'low';
	source_pages: number[];
	source_file: string | null;
	evidence_type: 'text' | 'vision' | 'ocr' | 'mixed' | null;
}

/**
 * A structured AI-vs-validator disagreement (AI-primary: the AI value is kept).
 * Replaces the brittle warning-prose round-trip the old UI parsed with a regex.
 */
export interface FieldConflict {
	field_path: string;
	ai_value: unknown;
	validator_value: unknown;
	resolution: 'ai' | 'validator' | 'agree' | 'needs_review';
	severity: 'info' | 'warning' | 'error';
}

/**
 * Client-side mirror of the server's `ParsedField<T>` provenance envelope (the
 * server type lives under `$lib/server` and can't be imported into the page).
 * Each pavement scalar arrives wrapped so the review UI can show its confidence
 * + source page; `value` is null when the document never stated it.
 */
export interface ParsedFieldEnvelope<T> {
	value: T | null;
	confidence: 'high' | 'medium' | 'low';
	source: string;
	source_page?: number | null;
	source_file?: string | null;
	evidence_type?: 'text' | 'vision' | 'ocr' | 'mixed' | null;
}

/** Inclusive lower/upper roadway-width band (feet) for a pavement range. */
export interface ImportRoadwayWidthBand {
	min: ParsedFieldEnvelope<number>;
	max: ParsedFieldEnvelope<number>;
}

/**
 * One per-mile-range pavement / typical-section spec carried by a contract
 * segment. The canonical shape (mirrors the server `SegmentPavement`): each
 * scalar is a {@link ParsedFieldEnvelope} with its own citation. Null values
 * render as empty editable fields in review — never fabricated.
 */
export interface ImportSegmentPavement {
	lift_thickness_in: ParsedFieldEnvelope<number>;
	mill_depth_in: ParsedFieldEnvelope<number>;
	spread_rate_lbs_sy: ParsedFieldEnvelope<number>;
	mix: ParsedFieldEnvelope<string>;
	roadway_width_ft: ImportRoadwayWidthBand;
	applies_from_mi: ParsedFieldEnvelope<number>;
	applies_to_mi: ParsedFieldEnvelope<number>;
}

/**
 * One named road-to-pave segment from the structured contract, surfaced to the
 * review UI so its `pavement[]` typical-section ranges can be reviewed/edited.
 * Only the fields the Pavement review section needs are carried.
 */
export interface ImportContractSegment {
	name: string | null;
	kind: string | null;
	length_mi: number | null;
	begin_terminus: string | null;
	end_terminus: string | null;
	pavement: ImportSegmentPavement[];
}

export interface ParsedBidItem {
	line_number: string | null;
	item_id: string | null;
	description: string;
	quantity: number | null;
	unit: string | null;
	unit_price: number | null;
	bid_amount: number | null;
	section: string | null;
	is_alternate: boolean;
	selected: boolean;
}

export interface ParsedMix {
	mix_name: string;
	mix_type: string | null;
	unit: string | null;
	bid_quantity: number | null;
	takeoff_tonnage: number | null;
	quantity_per_day: number | null;
	est_days: number | null;
	contract_unit_price: number | null;
}

export interface ParsedRoadwayLogEvent {
	source_index: number | null;
	page_number: number | null;
	milepost: number;
	station: number;
	event_type: string;
	description: string;
	roadway_width_ft: number | null;
	side: 'left' | 'right' | null;
	surface: 'paved' | 'unpaved' | null;
	is_reference: boolean;
	confidence: 'high' | 'medium' | 'low';
	raw_text: string;
	sort_order: number;
}

export interface PreviewRoadwayLogEvent {
	id: string;
	milepost: number;
	event_type: string;
	description: string;
	roadway_width_ft: number | null;
	is_reference: number;
	confidence: string;
	coordinate_geojson: string | null;
}

export interface DocumentInventory {
	filename: string;
	source_key: string;
	type: string;
	page_count: number;
	pages: Array<{ page_number: number; label: string }>;
	evidence: {
		contract_summary: boolean;
		job_setup: boolean;
		cover_sheet: boolean;
		index: boolean;
		location_sketch: boolean;
		roadway_log: boolean;
		detailed_estimate: boolean;
	};
}

export interface ParsedJob {
	name: string | null;
	job_number: string | null;
	project_number: string | null;
	contract_id: string | null;
	county: string | null;
	county_number: string | null;
	work_type: string | null;
	contract_type: string | null;
	contract_amount: number | null;
	retainage_pct: number | null;
	est_start_date: string | null;
	completion_date: string | null;
	customer_name: string | null;
	customer_address: string | null;
	customer_contact: string | null;
	customer_phone: string | null;
	customer_email: string | null;
	owner_name: string | null;
	owner_address: string | null;
	project_manager: string | null;
	asphalt_supplier: string | null;
	total_length_ft: number | null;
	location_description: string | null;
	route_designation: string | null;
	midpoint_easting: number | null;
	midpoint_northing: number | null;
	midpoint_zone_label: string | null;
	gross_length_mi: number | null;
	begin_terminus: string | null;
	end_terminus: string | null;
	scopes: string[];
	bid_items: ParsedBidItem[];
	production_mixes: ParsedMix[];
	roadway_log_events: ParsedRoadwayLogEvent[];
	detected_documents: string[];
	has_contract_summary: boolean;
	has_job_setup: boolean;
	warnings: string[];
}

export interface ParsedTerminus {
	type: 'intersection' | 'milepost' | 'landmark' | 'raw';
	parsed_roads: string[];
	milepost?: number;
	landmark?: string;
	offsetMiles?: number;
	direction?: string;
	summary: string;
	raw: string;
}

export interface RoutePreview {
	source:
		| 'gdot_lrs'
		| 'gdot_route'
		| 'osm_termini_route'
		| 'osm_overpass'
		| 'geocode'
		| 'county_centroid'
		| 'manual'
		| 'none';
	location_precision: 'route' | 'point' | 'county' | 'none';
	latitude: number | null;
	longitude: number | null;
	waypoints: Array<{ lat: number; lng: number }>;
	county_boundary_geojson?: {
		type: 'Feature';
		properties?: { county?: string };
		geometry: { type: 'Polygon'; coordinates: number[][][] };
	} | null;
	county_bounds?: [[number, number], [number, number]] | null;
	message?: string;
	lookup_warnings?: string[];
	events_anchored?: boolean;
	anchor_message?: string;
	route_length_ft?: number | null;
	expected_length_ft?: number | null;
	projected_log_events?: PreviewRoadwayLogEvent[];
	mapped_segments?: Array<{
		name: string | null;
		geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
		geometry_confidence: 'high' | 'medium' | 'low' | string;
	}>;
	parsed_begin_terminus?: ParsedTerminus | null;
	parsed_end_terminus?: ParsedTerminus | null;
	route_source_detail?: {
		crs: string;
		routeCode: string;
		county?: string;
		mAtMidpoint: number;
		offcenterM: number;
		calibrationOffsetMi: number;
	} | null;
	log_span_ft?: number | null;
}

/** Diagnostic for whether/why the narrow Workers AI gap-fill fallback ran. */
export interface LlmFallbackInfo {
	attempted: boolean;
	applied: boolean;
	reason: string;
	binding_available: boolean;
	outcome: 'applied' | 'not-needed' | 'binding-unavailable' | 'failed';
}

/** Diagnostic for whether/why the (now superseded) flat AI extractor ran. */
export interface AiExtractionInfo {
	attempted: boolean;
	applied: boolean;
	outcome: 'applied' | 'deterministic-fallback' | 'binding-unavailable' | 'failed';
	model: string | null;
	duration_ms: number | null;
	reason: string;
}

export interface DocumentsFoundEntry {
	file_index: number;
	sections: Array<{
		type: string;
		pages: number[];
		startPage: number;
		endPage: number;
		confidence: number;
	}>;
}

export interface ParsingReportInfo {
	detected_type: string | null;
	confidence: number;
	extractable_fields: string[];
	missing_fields: string[];
	suggestions: string[];
	is_supported: boolean;
}

/**
 * The single shared client-side shape of the `/api/job-sites/import-pdf` JSON
 * response. Every field is optional (plus `error`) because the page reads the
 * body defensively before checking `res.ok`. Replaces the duplicated inline
 * `res.json()` cast type in the import page.
 */
export interface ImportPdfResponse {
	parsed?: ParsedJob;
	source_keys?: string[];
	documents?: Array<{ filename: string; source_key: string; type: string }>;
	document_inventory?: DocumentInventory[];
	field_confidence?: FieldConfidenceMap;
	route_preview?: RoutePreview;
	llm_fallback?: LlmFallbackInfo;
	ai_extraction?: AiExtractionInfo;
	document_type?: string;
	classification_confidence?: number;
	classification_description?: string;
	classification_message?: string;
	documents_found?: DocumentsFoundEntry[];
	parsing_report?: ParsingReportInfo;
	field_source?: Record<string, string>;
	parser_duration_ms?: number;
	/** First-class per-field provenance + confidence (Phase 4); keyed by field path. */
	field_meta?: Record<string, FieldMeta>;
	/** Structured AI-vs-validator disagreements (Phase 4); AI value kept. */
	conflicts?: FieldConflict[];
	/**
	 * Structured-contract segments with their per-mile-range `pavement[]`
	 * typical-section specs, surfaced for the Phase 7 Pavement review section.
	 * Empty/absent when the document states no per-segment pavement data.
	 */
	segments?: ImportContractSegment[];
	error?: string;
}
