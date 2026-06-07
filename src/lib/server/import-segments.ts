/**
 * Pure mapping from imported multi-segment data to road_sections rows.
 *
 * A PDF-imported project can contain N physically-disconnected segments (a
 * MultiLineString): e.g. a City LMIG list of several separate streets, or a
 * GDOT mainline + a ramp on its own milepost axis. Each segment becomes one
 * road_sections row carrying its funding/scope grouping, treatment, source
 * termini, measure-axis kind, and snapped-geometry confidence.
 *
 * This module is intentionally free of D1/auth/platform so the segment->row
 * mapping (independent stationing, group/treatment passthrough) is unit
 * testable without the AI binding or a database.
 */
import { constant } from '$lib/config';
import { haversineMeters, metersToFeet } from '$lib/services/mapUtils';

export interface ImportLineGeom {
	type: 'LineString';
	coordinates: [number, number][]; // [lng, lat]
}

/**
 * One per-mile-range pavement / typical-section spec carried by an import
 * segment. The structured contract's {@link SegmentPavement} carries each scalar
 * as a `ParsedField<T>` confidence envelope WITH a per-field citation; the import
 * page flattens those to plain values + a single source page / confidence before
 * handing them to this pure layer. Every field is optional and nullable: an
 * absent typical-section value stays null (never invented).
 */
export interface ImportSegmentPavement {
	lift_thickness_in?: number | null;
	mill_depth_in?: number | null;
	spread_rate_lbs_sy?: number | null;
	mix?: string | null;
	width_ft_min?: number | null;
	width_ft_max?: number | null;
	applies_from_mi?: number | null;
	applies_to_mi?: number | null;
	source_page?: number | null;
	confidence?: 'high' | 'medium' | 'low' | null;
}

export interface ImportSegment {
	name: string;
	kind?: 'mainline' | 'ramp' | 'divided' | 'local_street' | null;
	group?: string | null;
	treatment?: string | null;
	measure_axis?: 'project_mile' | 'none' | null;
	begin_terminus?: string | null;
	end_terminus?: string | null;
	length_mi?: number | null;
	geometry?: ImportLineGeom | null;
	geometry_confidence?: 'high' | 'medium' | 'low' | null;
	production_mix_id?: string | null;
	/**
	 * Per-mile-range pavement / typical-section specs for this segment. Empty
	 * when the document states no typical-section data. The child
	 * pavement_structure rows are the single source of truth; the denormalized
	 * road_sections columns are derived from these (see {@link buildSegmentRows}).
	 */
	pavement?: ImportSegmentPavement[] | null;
}

/** One cleaned pavement_structure child row built from an import segment's
 * pavement[] (sans id/road_section_id/timestamps). Plain scalars; null when the
 * document did not state the value. */
export interface SegmentPavementRow {
	applies_from_mi: number | null;
	applies_to_mi: number | null;
	lift_thickness_in: number | null;
	mill_depth_in: number | null;
	spread_rate_lbs_sy: number | null;
	width_ft_min: number | null;
	width_ft_max: number | null;
	mix: string | null;
	source_page: number | null;
	confidence: 'high' | 'medium' | 'low' | null;
	sort_order: number;
}

/** A road_sections row built from an import segment (sans id/timestamps). */
export interface SegmentRow {
	name: string;
	lane: string;
	station_start: number | null;
	station_end: number | null;
	status: 'active';
	geometry_geojson: ImportLineGeom | null;
	planned_length_ft: number | null;
	production_mix_id: string | null;
	segment_group: string | null;
	treatment: string | null;
	measure_axis: 'project_mile' | 'none' | null;
	begin_terminus: string | null;
	end_terminus: string | null;
	geometry_confidence: 'high' | 'medium' | 'low' | null;
	sort_order: number;
	/**
	 * Child pavement_structure rows — the single source of truth for per-mile-
	 * range specs. One entry per stated typical-section spec; empty when the
	 * document carried none.
	 */
	pavement: SegmentPavementRow[];
	/**
	 * Denormalized convenience defaults DERIVED from `pavement` (the section's
	 * representative/predominant spec). Null when no pavement spec is present.
	 * These are never edited independently — they mirror the child rows.
	 */
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	mill_depth_in: number | null;
	width_ft: number | null;
}

const FT_PER_MILE = () => constant('CONST.FT_PER_MILE');
const FT_PER_STATION = () => constant('CONST.FT_PER_STATION');

function nullableStr(v: unknown): string | null {
	if (v == null) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
}

function finiteNum(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function hasGeometry(geom: ImportLineGeom | null | undefined): geom is ImportLineGeom {
	return !!geom && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2;
}

/** Total length (ft) of a [lng,lat] LineString. */
export function lineLengthFt(line: ImportLineGeom): number {
	let ft = 0;
	for (let i = 0; i < line.coordinates.length - 1; i++) {
		const [lng1, lat1] = line.coordinates[i];
		const [lng2, lat2] = line.coordinates[i + 1];
		ft += metersToFeet(haversineMeters(lat1, lng1, lat2, lng2));
	}
	return ft;
}

/** Centroid {lat,lng} of a [lng,lat] LineString, or null when empty. */
export function lineCentroid(line: ImportLineGeom): { lat: number; lng: number } | null {
	const coords = line.coordinates;
	if (!coords.length) return null;
	let sx = 0;
	let sy = 0;
	for (const [lng, lat] of coords) {
		sx += lng;
		sy += lat;
	}
	return { lat: sy / coords.length, lng: sx / coords.length };
}

/**
 * Build the cleaned pavement_structure child rows for one segment from its raw
 * `pavement[]`. Each scalar is normalized to a finite number / non-empty string
 * or null — absent typical-section values stay null (never invented). Order is
 * preserved as the document stated the ranges.
 */
function buildPavementRows(pavement: ImportSegmentPavement[] | null | undefined): SegmentPavementRow[] {
	if (!Array.isArray(pavement)) return [];
	const rows: SegmentPavementRow[] = [];
	for (let i = 0; i < pavement.length; i++) {
		const p = pavement[i];
		if (p == null || typeof p !== 'object') continue;
		const row: SegmentPavementRow = {
			applies_from_mi: finiteNum(p.applies_from_mi),
			applies_to_mi: finiteNum(p.applies_to_mi),
			lift_thickness_in: finiteNum(p.lift_thickness_in),
			mill_depth_in: finiteNum(p.mill_depth_in),
			spread_rate_lbs_sy: finiteNum(p.spread_rate_lbs_sy),
			width_ft_min: finiteNum(p.width_ft_min),
			width_ft_max: finiteNum(p.width_ft_max),
			mix: nullableStr(p.mix),
			source_page: finiteNum(p.source_page),
			confidence: normalizeConfidence(p.confidence),
			sort_order: rows.length
		};
		// Drop a wholly-empty entry: a pavement row with no stated values is noise,
		// not a real spec to persist.
		const hasAnyValue =
			row.applies_from_mi != null ||
			row.applies_to_mi != null ||
			row.lift_thickness_in != null ||
			row.mill_depth_in != null ||
			row.spread_rate_lbs_sy != null ||
			row.width_ft_min != null ||
			row.width_ft_max != null ||
			row.mix != null;
		if (hasAnyValue) rows.push(row);
	}
	return rows;
}

/** Inclusive mile-range coverage of a pavement row, or 0 when not stated. */
function pavementCoverageMi(row: SegmentPavementRow): number {
	if (row.applies_from_mi == null || row.applies_to_mi == null) return 0;
	const span = row.applies_to_mi - row.applies_from_mi;
	return Number.isFinite(span) && span > 0 ? span : 0;
}

/**
 * Pick the section's representative/predominant pavement spec: the row covering
 * the longest mile range (the spec that applies to most of the segment), falling
 * back to the first stated row when no range is given. Returns null for an empty
 * pavement[]. The denormalized road_sections defaults are derived from this row.
 */
function representativePavement(rows: SegmentPavementRow[]): SegmentPavementRow | null {
	if (!rows.length) return null;
	let best = rows[0];
	let bestCoverage = pavementCoverageMi(best);
	for (let i = 1; i < rows.length; i++) {
		const coverage = pavementCoverageMi(rows[i]);
		if (coverage > bestCoverage) {
			best = rows[i];
			bestCoverage = coverage;
		}
	}
	return best;
}

/**
 * Derive the road_sections denormalized width default from a representative
 * pavement row: prefer the band minimum (the controlling/typical width), falling
 * back to the maximum when only it is stated.
 */
function representativeWidthFt(row: SegmentPavementRow | null): number | null {
	if (!row) return null;
	return row.width_ft_min ?? row.width_ft_max ?? null;
}

/**
 * Map N import segments to road_sections row shapes. Each segment is its OWN
 * axis starting at station 0 (disconnected segments share no route). Segments
 * without a usable name are dropped. Length is taken from length_mi when
 * present, else measured from the geometry. Each row carries its child
 * pavement_structure rows (the single source of truth) plus the denormalized
 * defaults derived from the representative spec.
 */
export function buildSegmentRows(segments: ImportSegment[]): SegmentRow[] {
	const rows: SegmentRow[] = [];
	for (let i = 0; i < segments.length; i++) {
		const seg = segments[i];
		const name = nullableStr(seg.name);
		if (!name) continue;
		const geometry = hasGeometry(seg.geometry) ? seg.geometry : null;
		const lengthMi = finiteNum(seg.length_mi);
		const plannedFt =
			lengthMi != null ? lengthMi * FT_PER_MILE() : geometry ? lineLengthFt(geometry) : null;
		const stationEnd = plannedFt != null ? plannedFt / FT_PER_STATION() : null;
		const measureAxis = nullableStr(seg.measure_axis);
		const pavement = buildPavementRows(seg.pavement);
		const rep = representativePavement(pavement);
		rows.push({
			name,
			lane: '1',
			station_start: stationEnd != null ? 0 : null,
			station_end: stationEnd,
			status: 'active',
			geometry_geojson: geometry,
			planned_length_ft: plannedFt,
			production_mix_id: nullableStr(seg.production_mix_id),
			segment_group: nullableStr(seg.group),
			treatment: nullableStr(seg.treatment),
			measure_axis:
				measureAxis === 'project_mile' || measureAxis === 'none' ? measureAxis : null,
			begin_terminus: nullableStr(seg.begin_terminus),
			end_terminus: nullableStr(seg.end_terminus),
			geometry_confidence: normalizeConfidence(seg.geometry_confidence),
			sort_order: i,
			pavement,
			target_thickness_in: rep?.lift_thickness_in ?? null,
			target_spread_rate: rep?.spread_rate_lbs_sy ?? null,
			mill_depth_in: rep?.mill_depth_in ?? null,
			width_ft: representativeWidthFt(rep)
		});
	}
	return rows;
}

function normalizeConfidence(v: unknown): 'high' | 'medium' | 'low' | null {
	const s = nullableStr(v);
	return s === 'high' || s === 'medium' || s === 'low' ? s : null;
}
