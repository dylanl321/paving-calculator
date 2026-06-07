import { describe, expect, it } from 'vitest';
import type { D1Database } from '../../../cloudflare';
import {
	insertRoadSection,
	insertPavementStructure,
	collectPavementRows,
	representativeOf,
	segmentHasGeometry,
	type RoadSectionInsert
} from '../import-road-sections.js';
import type { ImportSegment, SegmentPavementRow } from '../import-segments.js';

/**
 * Regression for the post-import "Location & Route + work zones empty" bug.
 *
 * Root cause (commit 46b3bc5): the import review screen began POSTing
 * pavement-only segments (typical-section specs WITHOUT geometry) to
 * `from-import`, which made the server take the multi-segment branch and SKIP
 * the single-route resolution that writes the route waypoints, slices stationed
 * road_sections, and anchors the roadway-log markers. The created project lost
 * its route + sections + work zones.
 *
 * These tests pin the two invariants the fix relies on:
 *  1. Geometry is NEVER lost — even when the optional pavement columns
 *     (migration 0079) are absent on a lagging remote D1, the road_sections row
 *     (with its geometry_geojson) is still written via the core-only retry.
 *  2. A failed child-pavement insert (migration 0080 not applied) degrades
 *     gracefully and CANNOT abort the section/route persistence.
 *  3. Pavement-only segments are reduced to spec rows applied additively, and
 *     are correctly recognized as geometry-less so they don't hijack the route.
 */

/** A minimal fake D1 that records every statement + binding, and can be told to
 * throw `no such column`/`no such table` on the FIRST matching statement. */
function fakeDb(opts?: { failOn?: RegExp; failError?: string }) {
	const runs: Array<{ sql: string; binds: unknown[] }> = [];
	let firstAttempt = true;
	const db = {
		prepare(sql: string) {
			return {
				bind(...binds: unknown[]) {
					return {
						async run() {
							if (opts?.failOn && opts.failOn.test(sql) && firstAttempt) {
								firstAttempt = false;
								throw new Error(opts.failError ?? 'D1_ERROR: no such column: x');
							}
							runs.push({ sql, binds });
							return { success: true };
						}
					};
				}
			};
		}
	} as unknown as D1Database;
	return { db, runs };
}

const GEOJSON = JSON.stringify({ type: 'LineString', coordinates: [[-84.2, 32.5], [-84.21, 32.51]] });

function sectionRow(overrides: Partial<RoadSectionInsert> = {}): RoadSectionInsert {
	return {
		id: 'sec_test',
		job_site_id: 'js_1',
		name: 'Resurfacing 1',
		lane: '1',
		station_start: 0,
		station_end: 12.5,
		status: 'active',
		geometry_geojson: GEOJSON,
		planned_length_ft: 1250,
		production_mix_id: null,
		segment_group: null,
		treatment: 'resurfacing',
		measure_axis: null,
		begin_terminus: null,
		end_terminus: null,
		geometry_confidence: null,
		target_thickness_in: 1.5,
		target_spread_rate: 165,
		mill_depth_in: 1.5,
		width_ft: 48,
		notes: null,
		sort_order: 0,
		created_at: 1000,
		updated_at: 1000,
		...overrides
	};
}

describe('insertRoadSection — geometry is never lost on a lagging D1', () => {
	it('writes the full row (all pavement columns) when migration 0079 is applied', async () => {
		const { db, runs } = fakeDb();
		await insertRoadSection(db, sectionRow());
		expect(runs).toHaveLength(1);
		// The full insert carries the denormalized pavement columns AND geometry.
		expect(runs[0].sql).toMatch(/target_thickness_in/);
		expect(runs[0].binds).toContain(GEOJSON);
		expect(runs[0].binds).toContain(165);
	});

	it('retries core-only WITHOUT losing geometry when the 0079 columns are absent', async () => {
		// Simulate the deploy-ordering trap: the full insert hits `no such column`
		// (target_thickness_in etc. not yet applied to the shared remote D1).
		const { db, runs } = fakeDb({
			failOn: /target_thickness_in/,
			failError: 'D1_ERROR: no such column: target_thickness_in'
		});
		await insertRoadSection(db, sectionRow());

		// Exactly one row was actually written (the core-only retry).
		expect(runs).toHaveLength(1);
		// The retry insert is the core-column variant (no pavement columns)...
		expect(runs[0].sql).not.toMatch(/target_thickness_in/);
		// ...but it STILL persists the route geometry — the whole point.
		expect(runs[0].binds).toContain(GEOJSON);
		// And the section identity/stationing survive.
		expect(runs[0].binds).toContain('sec_test');
		expect(runs[0].binds).toContain(12.5);
	});

	it('rethrows a non-column error (does not silently swallow real failures)', async () => {
		const { db } = fakeDb({ failOn: /INSERT INTO road_sections/, failError: 'D1_ERROR: disk I/O error' });
		await expect(insertRoadSection(db, sectionRow())).rejects.toThrow(/disk I\/O/);
	});
});

describe('insertPavementStructure — degrades gracefully, never aborts the import', () => {
	const pavement: SegmentPavementRow[] = [
		{
			applies_from_mi: 0,
			applies_to_mi: 2.85,
			lift_thickness_in: 1.5,
			mill_depth_in: 1.5,
			spread_rate_lbs_sy: 165,
			width_ft_min: 48,
			width_ft_max: 48,
			mix: '12.5 mm SUPERPAVE GP 2',
			source_page: 10,
			confidence: 'high',
			sort_order: 0
		}
	];

	it('writes child rows when the pavement_structure table exists', async () => {
		const { db, runs } = fakeDb();
		let n = 0;
		const written = await insertPavementStructure(db, 'sec_test', pavement, 1000, () => `pav_${n++}`);
		expect(written).toBe(1);
		expect(runs).toHaveLength(1);
		expect(runs[0].sql).toMatch(/INSERT INTO pavement_structure/);
		expect(runs[0].binds).toContain(165);
	});

	it('returns 0 (no throw) when the pavement_structure table is missing', async () => {
		const { db, runs } = fakeDb({
			failOn: /pavement_structure/,
			failError: 'D1_ERROR: no such table: pavement_structure'
		});
		// Must NOT throw — a missing table can't be allowed to 500 the import and
		// take the route/section writes down with it.
		const written = await insertPavementStructure(db, 'sec_test', pavement, 1000);
		expect(written).toBe(0);
		expect(runs).toHaveLength(0);
	});

	it('returns 0 for empty pavement (no statements)', async () => {
		const { db, runs } = fakeDb();
		expect(await insertPavementStructure(db, 'sec_test', [], 1000)).toBe(0);
		expect(runs).toHaveLength(0);
	});
});

describe('pavement-only segments do not hijack the route path', () => {
	// What the import review screen actually sends today: segments carrying
	// per-mile-range pavement specs but NO geometry.
	const pavementOnlySegments: ImportSegment[] = [
		{
			name: 'NB/SB UNDIVIDED COMMON SECTION',
			kind: 'mainline',
			length_mi: 2.86,
			begin_terminus: 'SR 122',
			end_terminus: 'CR 218',
			pavement: [
				{
					lift_thickness_in: 1.5,
					mill_depth_in: 1.5,
					spread_rate_lbs_sy: 165,
					mix: '12.5 mm SUPERPAVE GP 2',
					width_ft_min: 48,
					width_ft_max: 48,
					applies_from_mi: 0,
					applies_to_mi: 2.85,
					source_page: 10,
					confidence: 'high'
				}
			]
		}
	];

	it('recognizes pavement-only segments as geometry-less (route path stays authoritative)', () => {
		expect(pavementOnlySegments.every((s) => !segmentHasGeometry(s))).toBe(true);
	});

	it('collectPavementRows extracts the specs so they apply additively to route sections', () => {
		const rows = collectPavementRows(pavementOnlySegments);
		expect(rows).toHaveLength(1);
		expect(rows[0].spread_rate_lbs_sy).toBe(165);
		expect(rows[0].mix).toBe('12.5 mm SUPERPAVE GP 2');
		expect(rows[0].mill_depth_in).toBe(1.5);
	});

	it('dedupes identical specs stated by multiple pavement-only segments', () => {
		const dup = collectPavementRows([pavementOnlySegments[0], { ...pavementOnlySegments[0], name: 'Dup' }]);
		expect(dup).toHaveLength(1);
	});

	it('representativeOf picks the widest-mile-range spec for the denormalized defaults', () => {
		const rows: SegmentPavementRow[] = [
			{ applies_from_mi: 0, applies_to_mi: 0.3, lift_thickness_in: null, mill_depth_in: null, spread_rate_lbs_sy: 132, width_ft_min: 24, width_ft_max: 24, mix: '9.5 mm', source_page: null, confidence: null, sort_order: 0 },
			{ applies_from_mi: 0.3, applies_to_mi: 2.85, lift_thickness_in: 1.5, mill_depth_in: 1.5, spread_rate_lbs_sy: 165, width_ft_min: 48, width_ft_max: 48, mix: '12.5 mm', source_page: null, confidence: null, sort_order: 1 }
		];
		expect(representativeOf(rows)?.spread_rate_lbs_sy).toBe(165);
		expect(representativeOf([])).toBeNull();
	});
});
