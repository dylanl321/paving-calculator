/**
 * D1 persistence helpers for PDF-import road_sections + pavement_structure rows.
 *
 * Extracted from `routes/api/job-sites/from-import/+server.ts` so the
 * deploy-ordering safety guards are unit-testable with a fake D1 (no auth /
 * platform / SvelteKit needed). The single invariant these helpers protect:
 *
 *   The route geometry is NEVER lost. If the optional pavement columns
 *   (migration 0079) or the pavement_structure table (migration 0080) are not
 *   yet applied on a lagging remote D1, the road_sections row — including its
 *   `geometry_geojson` — must still be written, and a failed child-pavement
 *   insert must NOT abort the section/route persistence.
 *
 * The page-level regression that motivated this: pavement-only import segments
 * (typical-section specs WITHOUT geometry) were hijacking the single-route
 * path, leaving the created project with no route, no sections, and no work
 * zones. The fix keeps the route path authoritative and applies pavement
 * additively via these helpers (see `collectPavementRows` / `representativeOf`).
 */
import type { D1Database } from '../../cloudflare';
import { buildSegmentRows, type ImportSegment, type SegmentPavementRow } from './import-segments';

/** A road_sections row ready for insert (ids/timestamps already resolved). */
export interface RoadSectionInsert {
	id: string;
	job_site_id: string;
	name: string;
	lane: string;
	station_start: number | null;
	station_end: number | null;
	status: string;
	geometry_geojson: string | null;
	planned_length_ft: number | null;
	production_mix_id: string | null;
	segment_group: string | null;
	treatment: string | null;
	measure_axis: string | null;
	begin_terminus: string | null;
	end_terminus: string | null;
	geometry_confidence: string | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	mill_depth_in: number | null;
	width_ft: number | null;
	notes: string | null;
	sort_order: number;
	created_at: number;
	updated_at: number;
}

/**
 * Insert one road_sections row, including the multi-segment columns added in
 * migration 0078 (segment_group/treatment/measure_axis/termini/geometry_confidence)
 * and the denormalized pavement defaults added in migration 0079
 * (target_thickness_in/target_spread_rate/mill_depth_in/width_ft).
 * Mirrors the upsertJobSiteConfig core/optional split: if the optional columns
 * don't exist yet on the shared remote D1 (migration not applied), retry with
 * only the core columns — which STILL include `geometry_geojson` — so the import
 * succeeds and the route geometry is never lost.
 */
export async function insertRoadSection(db: D1Database, row: RoadSectionInsert): Promise<void> {
	try {
		await db
			.prepare(
				`INSERT INTO road_sections
				(id, job_site_id, name, lane, station_start, station_end, status, geometry_geojson,
				 planned_length_ft, production_mix_id, segment_group, treatment, measure_axis,
				 begin_terminus, end_terminus, geometry_confidence,
				 target_thickness_in, target_spread_rate, mill_depth_in, width_ft,
				 notes, sort_order, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				row.id,
				row.job_site_id,
				row.name,
				row.lane,
				row.station_start,
				row.station_end,
				row.status,
				row.geometry_geojson,
				row.planned_length_ft,
				row.production_mix_id,
				row.segment_group,
				row.treatment,
				row.measure_axis,
				row.begin_terminus,
				row.end_terminus,
				row.geometry_confidence,
				row.target_thickness_in,
				row.target_spread_rate,
				row.mill_depth_in,
				row.width_ft,
				row.notes,
				row.sort_order,
				row.created_at,
				row.updated_at
			)
			.run();
	} catch (err) {
		// Optional columns may not exist yet on a lagging DB; retry core-only.
		// The core insert STILL carries geometry_geojson — geometry is never lost.
		if (!/no such column/i.test(String(err))) throw err;
		await db
			.prepare(
				`INSERT INTO road_sections
				(id, job_site_id, name, lane, station_start, station_end, status, geometry_geojson,
				 notes, sort_order, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				row.id,
				row.job_site_id,
				row.name,
				row.lane,
				row.station_start,
				row.station_end,
				row.status,
				row.geometry_geojson,
				row.notes,
				row.sort_order,
				row.created_at,
				row.updated_at
			)
			.run();
	}
}

/**
 * Insert the pavement_structure child rows for one road_sections row. This child
 * table is the single source of truth for per-mile-range specs. Wrapped so a
 * lagging remote D1 (migration 0080 not yet applied) can't 500 the import: a
 * missing table/column degrades to "no child rows persisted" while the
 * denormalized road_sections defaults still carry the representative spec.
 * Returns the number of child rows written.
 */
export async function insertPavementStructure(
	db: D1Database,
	roadSectionId: string,
	pavement: SegmentPavementRow[],
	now: number,
	makeId: () => string = () => 'pav_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
): Promise<number> {
	if (!pavement.length) return 0;
	let written = 0;
	for (const p of pavement) {
		try {
			await db
				.prepare(
					`INSERT INTO pavement_structure
					(id, road_section_id, applies_from_mi, applies_to_mi, lift_thickness_in,
					 mill_depth_in, spread_rate_lbs_sy, width_ft_min, width_ft_max, mix,
					 source_page, confidence, sort_order, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.bind(
					makeId(),
					roadSectionId,
					p.applies_from_mi,
					p.applies_to_mi,
					p.lift_thickness_in,
					p.mill_depth_in,
					p.spread_rate_lbs_sy,
					p.width_ft_min,
					p.width_ft_max,
					p.mix,
					p.source_page,
					p.confidence,
					p.sort_order,
					now,
					now
				)
				.run();
			written++;
		} catch (err) {
			// Table/column may not exist yet on a lagging remote D1; the
			// denormalized road_sections defaults still carry the representative
			// spec, so skip child persistence rather than fail the whole import.
			if (!/no such (table|column)/i.test(String(err))) throw err;
			break;
		}
	}
	return written;
}

/**
 * Collect the per-mile-range pavement specs from pavement-only import segments
 * (segments the review screen sends carrying typical-section data but NO
 * geometry). These can't form their own road_sections rows (no geometry), so
 * their specs are applied additively to the single-route sections. Deduped by
 * content so two segments stating the same spec don't double up. Built on the
 * pure `buildSegmentRows` so the same cleaning/validation runs.
 */
export function collectPavementRows(segments: ImportSegment[]): SegmentPavementRow[] {
	const rows: SegmentPavementRow[] = [];
	const seen = new Set<string>();
	for (const segRow of buildSegmentRows(segments)) {
		for (const p of segRow.pavement) {
			const key = JSON.stringify([
				p.applies_from_mi,
				p.applies_to_mi,
				p.lift_thickness_in,
				p.mill_depth_in,
				p.spread_rate_lbs_sy,
				p.width_ft_min,
				p.width_ft_max,
				p.mix
			]);
			if (seen.has(key)) continue;
			seen.add(key);
			rows.push({ ...p, sort_order: rows.length });
		}
	}
	return rows;
}

/**
 * Pick the representative (widest-mile-range) pavement spec from a flat list, to
 * derive the denormalized road_sections defaults. Mirrors the per-segment
 * `representativePavement` in import-segments; kept here because the single-
 * route sections aren't built from a single segment.
 */
export function representativeOf(rows: SegmentPavementRow[]): SegmentPavementRow | null {
	if (!rows.length) return null;
	const coverage = (r: SegmentPavementRow) =>
		r.applies_from_mi != null && r.applies_to_mi != null && r.applies_to_mi > r.applies_from_mi
			? r.applies_to_mi - r.applies_from_mi
			: 0;
	let best = rows[0];
	for (let i = 1; i < rows.length; i++) {
		if (coverage(rows[i]) > coverage(best)) best = rows[i];
	}
	return best;
}

/** Whether an import segment carries a usable (>=2-point) geometry. */
export function segmentHasGeometry(seg: ImportSegment): boolean {
	return !!(
		seg.geometry &&
		Array.isArray(seg.geometry.coordinates) &&
		seg.geometry.coordinates.length >= 2
	);
}
