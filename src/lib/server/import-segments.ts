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
 * Map N import segments to road_sections row shapes. Each segment is its OWN
 * axis starting at station 0 (disconnected segments share no route). Segments
 * without a usable name are dropped. Length is taken from length_mi when
 * present, else measured from the geometry.
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
			sort_order: i
		});
	}
	return rows;
}

function normalizeConfidence(v: unknown): 'high' | 'medium' | 'low' | null {
	const s = nullableStr(v);
	return s === 'high' || s === 'medium' || s === 'low' ? s : null;
}
