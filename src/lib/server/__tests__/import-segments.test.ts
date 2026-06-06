import { describe, expect, it } from 'vitest';
import { buildSegmentRows, type ImportSegment } from '../import-segments.js';

/**
 * Multi-segment import regression. A PDF-imported project can be N physically
 * disconnected segments (a MultiLineString): the two real fixtures are
 *  - City of Butler LMIG (25169): 7 separate streets, grouped LMIG (5) / LRA (2)
 *  - GDOT SR 7 ALT (25186): one route but 2 milepost-reset sections (mainline + ramp)
 * Each segment must map to its own road_sections row with its own station axis
 * (every segment starts at station 0 - they share no route).
 */

// A short [lng,lat] line near Butler, GA (geometry value is irrelevant to the
// mapping logic under test; only that it is a >=2-point LineString).
function line(lng: number, lat: number): ImportSegment['geometry'] {
	return { type: 'LineString', coordinates: [[lng, lat], [lng + 0.001, lat + 0.001]] };
}

const BUTLER_SEGMENTS: ImportSegment[] = [
	{ name: 'Marshall Street', kind: 'local_street', group: 'LMIG', treatment: 'overlay', measure_axis: 'none', length_mi: 0.09, geometry: line(-84.23, 32.55), geometry_confidence: 'medium' },
	{ name: 'Bell Street', kind: 'local_street', group: 'LMIG', treatment: 'restripe_only', measure_axis: 'none', length_mi: 0.2, geometry: line(-84.24, 32.56), geometry_confidence: 'low' },
	{ name: 'East Venus Street', kind: 'local_street', group: 'LMIG', treatment: 'restripe_only', measure_axis: 'none', length_mi: 0.23, geometry: line(-84.25, 32.55), geometry_confidence: 'low' },
	{ name: 'Kings Lane', kind: 'local_street', group: 'LMIG', treatment: 'overlay', measure_axis: 'none', length_mi: 0.24, geometry: line(-84.26, 32.54), geometry_confidence: 'low' },
	{ name: 'Gloria Street', kind: 'local_street', group: 'LMIG', treatment: 'restripe_only', measure_axis: 'none', length_mi: 0.21, geometry: line(-84.25, 32.56), geometry_confidence: 'medium' },
	{ name: 'Marshall Street South', kind: 'local_street', group: 'LRA', treatment: 'overlay', measure_axis: 'none', length_mi: 0.15, geometry: line(-84.23, 32.53), geometry_confidence: 'medium' },
	{ name: 'Sandy Run', kind: 'local_street', group: 'LRA', treatment: 'overlay', measure_axis: 'none', length_mi: 0.14, geometry: line(-84.22, 32.52), geometry_confidence: 'low' }
];

const SR7ALT_SEGMENTS: ImportSegment[] = [
	{ name: 'NB/SB UNDIVIDED COMMON SECTION', kind: 'mainline', group: 'GDOT', treatment: 'resurfacing', measure_axis: 'project_mile', length_mi: 2.86, geometry: line(-83.28, 30.83), geometry_confidence: 'high' },
	{ name: 'SOUTHBOUND DIVIDED RAMP FROM SR 7', kind: 'ramp', group: 'GDOT', treatment: 'resurfacing', measure_axis: 'project_mile', length_mi: 0.06, geometry: line(-83.29, 30.84), geometry_confidence: 'high' }
];

describe('multi-segment import → road_sections rows', () => {
	it('Butler LMIG: 7 disconnected local_street rows grouped 5 LMIG / 2 LRA', () => {
		const rows = buildSegmentRows(BUTLER_SEGMENTS);

		expect(rows).toHaveLength(7);
		expect(rows.filter((r) => r.segment_group === 'LMIG')).toHaveLength(5);
		expect(rows.filter((r) => r.segment_group === 'LRA')).toHaveLength(2);

		// Treatments carry through (overlay vs restripe_only).
		expect(rows.filter((r) => r.treatment === 'restripe_only')).toHaveLength(3);
		expect(rows.filter((r) => r.treatment === 'overlay')).toHaveLength(4);

		// Each segment is its own axis: every row starts at station 0.
		for (const r of rows) {
			expect(r.measure_axis).toBe('none');
			expect(r.station_start).toBe(0);
			expect(r.station_end).not.toBeNull();
			expect(r.station_end! > 0).toBe(true);
		}

		// Doc order preserved.
		expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
		expect(rows[0].name).toBe('Marshall Street');
		expect(rows[5].name).toBe('Marshall Street South');

		// Low-confidence geometry is preserved (never dropped/fabricated).
		expect(rows.find((r) => r.name === 'Bell Street')!.geometry_confidence).toBe('low');
	});

	it('SR 7 ALT: 2 rows (mainline + ramp) each on its own station-0 axis', () => {
		const rows = buildSegmentRows(SR7ALT_SEGMENTS);

		expect(rows).toHaveLength(2);
		expect(rows[0].name).toContain('COMMON SECTION');
		expect(rows[1].name).toContain('RAMP');

		// Independent axes: the ramp does NOT continue the mainline's stationing.
		for (const r of rows) {
			expect(r.measure_axis).toBe('project_mile');
			expect(r.station_start).toBe(0);
		}
		// Mainline (2.86 mi) is much longer than the ramp (0.06 mi).
		expect(rows[0].station_end! > rows[1].station_end!).toBe(true);
	});

	it('length_mi drives planned_length_ft (5280 ft/mi)', () => {
		const rows = buildSegmentRows([SR7ALT_SEGMENTS[1]]); // 0.06 mi ramp
		expect(rows[0].planned_length_ft).toBeCloseTo(0.06 * 5280, 5);
	});

	it('drops nameless segments and normalizes unknown confidence to null', () => {
		const rows = buildSegmentRows([
			{ name: '   ', group: 'LMIG' },
			{ name: 'Real Street', group: 'LMIG', geometry_confidence: 'bogus' as never, geometry: line(-84.2, 32.5) }
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe('Real Street');
		expect(rows[0].geometry_confidence).toBeNull();
	});

	it('no geometry and no length_mi → null stationing (no fabricated axis)', () => {
		const rows = buildSegmentRows([{ name: 'Unmappable St', group: 'LMIG' }]);
		expect(rows).toHaveLength(1);
		expect(rows[0].station_start).toBeNull();
		expect(rows[0].station_end).toBeNull();
		expect(rows[0].planned_length_ft).toBeNull();
		expect(rows[0].geometry_geojson).toBeNull();
	});
});
