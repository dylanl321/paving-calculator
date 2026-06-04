/**
 * Unit tests for src/lib/server/dot/normalise.ts
 *
 * Coverage:
 *  - normaliseAldot  (AL)
 *  - normaliseTxdot  (TX)
 *  - normaliseGdot   (GA)
 *  - normaliseFdot   (FL)
 *
 * For each normaliser:
 *  - Happy-path with fully-populated raw object
 *  - Null / undefined / missing optional fields
 *  - Real-world edge cases mirroring GDOT API responses
 *  - County code & route string parsing behaviour
 *  - Geometry present vs. absent
 *  - raw_json round-trip integrity
 */

import { describe, it, expect } from 'vitest';
import {
	normaliseAldot,
	normaliseTxdot,
	normaliseGdot,
	normaliseFdot
} from '../normalise';
import type {
	AldotCpmsRaw,
	TxdotRoadwayRaw,
	GdotGpasRoadRaw,
	FdotRciRaw,
	GeoJsonLineString
} from '$lib/types/dot';

// ─── shared fixtures ──────────────────────────────────────────────────────────

const LINE: GeoJsonLineString = {
	type: 'LineString',
	coordinates: [
		[-84.388, 33.749],
		[-84.392, 33.753]
	]
};

// ─── ALDOT ────────────────────────────────────────────────────────────────────

describe('normaliseAldot', () => {
	const base: AldotCpmsRaw = {
		OBJECTID: 1001,
		route: 'US-280',
		type_of_work: null,
		project_start: null,
		project_completion: null,
		project_cost: null,
		funding_source: null
	};

	it('sets state_dot to AL and source to aldot', () => {
		const result = normaliseAldot(base, null);
		expect(result.state_dot).toBe('AL');
		expect(result.source).toBe('aldot');
	});

	it('maps OBJECTID to external_id as string', () => {
		const result = normaliseAldot(base, null);
		expect(result.external_id).toBe('1001');
	});

	it('maps route to road_name and route_id', () => {
		const result = normaliseAldot(base, LINE);
		expect(result.road_name).toBe('US-280');
		expect(result.route_id).toBe('US-280');
	});

	it('serialises geometry when provided', () => {
		const result = normaliseAldot(base, LINE);
		expect(result.geometry_geojson).toBe(JSON.stringify(LINE));
	});

	it('sets geometry_geojson to null when no geometry', () => {
		const result = normaliseAldot(base, null);
		expect(result.geometry_geojson).toBeNull();
	});

	it('serialises raw_json correctly', () => {
		const result = normaliseAldot(base, null);
		expect(JSON.parse(result.raw_json!)).toEqual(base);
	});

	it('sets pavement metrics (iri, pci, psr) to null — not available in ALDOT', () => {
		const result = normaliseAldot(base, null);
		expect(result.iri).toBeNull();
		expect(result.pci).toBeNull();
		expect(result.psr).toBeNull();
	});

	it('sets road_name and route_id to null when route is falsy empty string', () => {
		const raw: AldotCpmsRaw = { OBJECTID: 2, route: '', type_of_work: null, project_start: null, project_completion: null, project_cost: null, funding_source: null };
		const result = normaliseAldot(raw, null);
		expect(result.road_name).toBeNull();
		expect(result.route_id).toBeNull();
	});

	it('sets road_name and route_id to null when route is null', () => {
		const raw: AldotCpmsRaw = { OBJECTID: 3, route: null as unknown as string, type_of_work: null, project_start: null, project_completion: null, project_cost: null, funding_source: null };
		const result = normaliseAldot(raw, null);
		expect(result.road_name).toBeNull();
		expect(result.route_id).toBeNull();
	});

	it('handles large OBJECTID values without truncation', () => {
		const raw: AldotCpmsRaw = { OBJECTID: 999_999_999, route: 'SR-14', type_of_work: null, project_start: null, project_completion: null, project_cost: null, funding_source: null };
		const result = normaliseAldot(raw, null);
		expect(result.external_id).toBe('999999999');
	});

	it('sets data_year to null — ALDOT does not expose a year field', () => {
		const result = normaliseAldot(base, null);
		expect(result.data_year).toBeNull();
	});

	it('returns all required InsertSegment keys', () => {
		const result = normaliseAldot(base, null);
		const keys = [
			'state_dot', 'source', 'external_id', 'road_name', 'route_id',
			'functional_class', 'surface_type', 'iri', 'pci', 'psr',
			'begin_milepost', 'end_milepost', 'length_miles', 'lanes', 'aadt',
			'district_code', 'county_code', 'geometry_geojson', 'raw_json', 'data_year'
		];
		for (const key of keys) {
			expect(result).toHaveProperty(key);
		}
	});
});

// ─── TxDOT ────────────────────────────────────────────────────────────────────

describe('normaliseTxdot', () => {
	const base: TxdotRoadwayRaw = {
		OBJECTID: 5000,
		RTE_NM: 'IH0010-KG',
		F_SYSTEM: 1,
		SRF_TYPE: 'AC',
		BASE_TP: 'FLEX',
		SURF_TREAT_1: null,
		SURF_TREAT_2: null,
		SURF_TREAT_3: null,
		AADT: 85_000,
		LANES_TOT: 4
	};

	it('sets state_dot to TX and source to txdot', () => {
		const result = normaliseTxdot(base, null);
		expect(result.state_dot).toBe('TX');
		expect(result.source).toBe('txdot');
	});

	it('maps OBJECTID to external_id as string', () => {
		const result = normaliseTxdot(base, null);
		expect(result.external_id).toBe('5000');
	});

	it('maps RTE_NM to road_name and route_id', () => {
		const result = normaliseTxdot(base, null);
		expect(result.road_name).toBe('IH0010-KG');
		expect(result.route_id).toBe('IH0010-KG');
	});

	it('maps F_SYSTEM to functional_class', () => {
		const result = normaliseTxdot(base, null);
		expect(result.functional_class).toBe(1);
	});

	it('concatenates surface type fields with semicolon separator', () => {
		const result = normaliseTxdot(base, null);
		expect(result.surface_type).toBe('AC; FLEX');
	});

	it('includes all non-null surface treatment fields in surface_type', () => {
		const raw: TxdotRoadwayRaw = {
			...base,
			SRF_TYPE: 'AC',
			BASE_TP: 'FLEX',
			SURF_TREAT_1: 'MS',
			SURF_TREAT_2: 'CS',
			SURF_TREAT_3: null
		};
		const result = normaliseTxdot(raw, null);
		expect(result.surface_type).toBe('AC; FLEX; MS; CS');
	});

	it('sets surface_type to null when all surface fields are null', () => {
		const raw: TxdotRoadwayRaw = {
			...base,
			SRF_TYPE: null,
			BASE_TP: null,
			SURF_TREAT_1: null,
			SURF_TREAT_2: null,
			SURF_TREAT_3: null
		};
		const result = normaliseTxdot(raw, null);
		expect(result.surface_type).toBeNull();
	});

	it('maps AADT correctly', () => {
		const result = normaliseTxdot(base, null);
		expect(result.aadt).toBe(85_000);
	});

	it('maps LANES_TOT to lanes', () => {
		const result = normaliseTxdot(base, null);
		expect(result.lanes).toBe(4);
	});

	it('sets road_name and route_id to null when RTE_NM is null', () => {
		const raw: TxdotRoadwayRaw = { ...base, RTE_NM: null };
		const result = normaliseTxdot(raw, null);
		expect(result.road_name).toBeNull();
		expect(result.route_id).toBeNull();
	});

	it('sets functional_class to null when F_SYSTEM is null', () => {
		const raw: TxdotRoadwayRaw = { ...base, F_SYSTEM: null };
		const result = normaliseTxdot(raw, null);
		expect(result.functional_class).toBeNull();
	});

	it('sets aadt to null when AADT is null', () => {
		const raw: TxdotRoadwayRaw = { ...base, AADT: null };
		const result = normaliseTxdot(raw, null);
		expect(result.aadt).toBeNull();
	});

	it('sets lanes to null when LANES_TOT is null', () => {
		const raw: TxdotRoadwayRaw = { ...base, LANES_TOT: null };
		const result = normaliseTxdot(raw, null);
		expect(result.lanes).toBeNull();
	});

	it('serialises geometry when provided', () => {
		const result = normaliseTxdot(base, LINE);
		expect(result.geometry_geojson).toBe(JSON.stringify(LINE));
	});

	it('sets geometry_geojson to null when no geometry', () => {
		const result = normaliseTxdot(base, null);
		expect(result.geometry_geojson).toBeNull();
	});

	it('serialises raw_json and preserves extra fields', () => {
		const raw: TxdotRoadwayRaw = { ...base, EXTRA_FIELD: 'extra' };
		const result = normaliseTxdot(raw, null);
		const parsed = JSON.parse(result.raw_json!);
		expect(parsed.EXTRA_FIELD).toBe('extra');
	});

	it('sets iri, pci, psr to null — not in TxDOT roadway inventory', () => {
		const result = normaliseTxdot(base, null);
		expect(result.iri).toBeNull();
		expect(result.pci).toBeNull();
		expect(result.psr).toBeNull();
	});

	it('handles RTE_NM with special characters (real TxDOT route format)', () => {
		const raw: TxdotRoadwayRaw = { ...base, RTE_NM: 'SH0183-KA' };
		const result = normaliseTxdot(raw, null);
		expect(result.road_name).toBe('SH0183-KA');
	});
});

// ─── GDOT ─────────────────────────────────────────────────────────────────────

describe('normaliseGdot', () => {
	const base: GdotGpasRoadRaw = {
		OBJECTID: 12345,
		ROUTE_ID: 'CR-0001-00',
		ROUTE_NAME: 'PEACHTREE RD',
		COUNTY: '060',
		DISTRICT: '07'
	};

	it('sets state_dot to GA and source to gdot', () => {
		const result = normaliseGdot(base, null);
		expect(result.state_dot).toBe('GA');
		expect(result.source).toBe('gdot');
	});

	it('maps OBJECTID to external_id as string', () => {
		const result = normaliseGdot(base, null);
		expect(result.external_id).toBe('12345');
	});

	it('maps ROUTE_NAME to road_name', () => {
		const result = normaliseGdot(base, null);
		expect(result.road_name).toBe('PEACHTREE RD');
	});

	it('maps ROUTE_ID to route_id', () => {
		const result = normaliseGdot(base, null);
		expect(result.route_id).toBe('CR-0001-00');
	});

	it('maps COUNTY to county_code', () => {
		const result = normaliseGdot(base, null);
		expect(result.county_code).toBe('060');
	});

	it('maps DISTRICT to district_code', () => {
		const result = normaliseGdot(base, null);
		expect(result.district_code).toBe('07');
	});

	it('serialises geometry when provided', () => {
		const result = normaliseGdot(base, LINE);
		expect(result.geometry_geojson).toBe(JSON.stringify(LINE));
	});

	it('sets geometry_geojson to null when no geometry', () => {
		const result = normaliseGdot(base, null);
		expect(result.geometry_geojson).toBeNull();
	});

	it('serialises raw_json correctly', () => {
		const result = normaliseGdot(base, null);
		expect(JSON.parse(result.raw_json!)).toEqual(base);
	});

	it('sets county_code to null when COUNTY is null', () => {
		const raw: GdotGpasRoadRaw = { ...base, COUNTY: null };
		const result = normaliseGdot(raw, null);
		expect(result.county_code).toBeNull();
	});

	it('sets district_code to null when DISTRICT is null', () => {
		const raw: GdotGpasRoadRaw = { ...base, DISTRICT: null };
		const result = normaliseGdot(raw, null);
		expect(result.district_code).toBeNull();
	});

	it('sets road_name to null when ROUTE_NAME is null', () => {
		const raw: GdotGpasRoadRaw = { ...base, ROUTE_NAME: null };
		const result = normaliseGdot(raw, null);
		expect(result.road_name).toBeNull();
	});

	it('sets route_id to null when ROUTE_ID is null', () => {
		const raw: GdotGpasRoadRaw = { ...base, ROUTE_ID: null };
		const result = normaliseGdot(raw, null);
		expect(result.route_id).toBeNull();
	});

	it('sets pavement metrics to null — GDOT per-segment pavement data not public', () => {
		const result = normaliseGdot(base, null);
		expect(result.iri).toBeNull();
		expect(result.pci).toBeNull();
		expect(result.psr).toBeNull();
		expect(result.aadt).toBeNull();
	});

	it('handles real-world GDOT county code edge case: zero-padded 3-digit string', () => {
		const raw: GdotGpasRoadRaw = { ...base, COUNTY: '001' };
		const result = normaliseGdot(raw, null);
		// Should preserve as-is without numeric coercion
		expect(result.county_code).toBe('001');
	});

	it('handles real-world GDOT ROUTE_ID edge cases: interstate format', () => {
		const raw: GdotGpasRoadRaw = { ...base, ROUTE_ID: 'I-285-00', ROUTE_NAME: 'INTERSTATE 285' };
		const result = normaliseGdot(raw, null);
		expect(result.route_id).toBe('I-285-00');
		expect(result.road_name).toBe('INTERSTATE 285');
	});

	it('handles real-world GDOT ROUTE_ID: state route format', () => {
		const raw: GdotGpasRoadRaw = { ...base, ROUTE_ID: 'SR-400-00', ROUTE_NAME: 'STATE ROUTE 400' };
		const result = normaliseGdot(raw, null);
		expect(result.route_id).toBe('SR-400-00');
	});

	it('handles GDOT multi-coordinate geometry correctly', () => {
		const multiLine: GeoJsonLineString = {
			type: 'LineString',
			coordinates: [
				[-84.388, 33.749],
				[-84.390, 33.751],
				[-84.392, 33.753],
				[-84.394, 33.755]
			]
		};
		const result = normaliseGdot(base, multiLine);
		const parsed = JSON.parse(result.geometry_geojson!);
		expect(parsed.type).toBe('LineString');
		expect(parsed.coordinates).toHaveLength(4);
	});

	it('preserves extra GDOT-specific fields in raw_json', () => {
		const raw: GdotGpasRoadRaw = { ...base, EXTRA_GDOT_FIELD: 'extra_value' };
		const result = normaliseGdot(raw, null);
		const parsed = JSON.parse(result.raw_json!);
		expect(parsed.EXTRA_GDOT_FIELD).toBe('extra_value');
	});

	it('handles completely empty optional fields (real-world incomplete GDOT records)', () => {
		const raw: GdotGpasRoadRaw = {
			OBJECTID: 99,
			ROUTE_ID: null,
			ROUTE_NAME: null,
			COUNTY: null,
			DISTRICT: null
		};
		const result = normaliseGdot(raw, null);
		expect(result.external_id).toBe('99');
		expect(result.road_name).toBeNull();
		expect(result.route_id).toBe(null);
		expect(result.county_code).toBeNull();
		expect(result.district_code).toBeNull();
	});

	it('returns all required InsertSegment keys', () => {
		const result = normaliseGdot(base, null);
		const keys = [
			'state_dot', 'source', 'external_id', 'road_name', 'route_id',
			'functional_class', 'surface_type', 'iri', 'pci', 'psr',
			'begin_milepost', 'end_milepost', 'length_miles', 'lanes', 'aadt',
			'district_code', 'county_code', 'geometry_geojson', 'raw_json', 'data_year'
		];
		for (const key of keys) {
			expect(result).toHaveProperty(key);
		}
	});
});

// ─── FDOT ─────────────────────────────────────────────────────────────────────

describe('normaliseFdot', () => {
	const base: FdotRciRaw = {
		OBJECTID: 88001,
		ROADWAY: '87099000',
		CONTYDOT: '87',
		MNG_DIST_CD: '04',
		SECT_DS: 'SR-528 BEACHLINE EXPY',
		BEGIN_POST: 0.0,
		END_POST: 4.5,
		SECT_NET_LNGTH_NUM: 4.5,
		TRANSYS_CLS_CD: 'SHS',
		ST_HWY_SYS_CD: 'SHS',
		Shape__Length: 7241.3
	};

	it('sets state_dot to FL and source to fdot', () => {
		const result = normaliseFdot(base, null);
		expect(result.state_dot).toBe('FL');
		expect(result.source).toBe('fdot');
	});

	it('maps OBJECTID to external_id as string', () => {
		const result = normaliseFdot(base, null);
		expect(result.external_id).toBe('88001');
	});

	it('maps SECT_DS to road_name', () => {
		const result = normaliseFdot(base, null);
		expect(result.road_name).toBe('SR-528 BEACHLINE EXPY');
	});

	it('maps ROADWAY to route_id', () => {
		const result = normaliseFdot(base, null);
		expect(result.route_id).toBe('87099000');
	});

	it('maps CONTYDOT to county_code', () => {
		const result = normaliseFdot(base, null);
		expect(result.county_code).toBe('87');
	});

	it('maps MNG_DIST_CD to district_code', () => {
		const result = normaliseFdot(base, null);
		expect(result.district_code).toBe('04');
	});

	it('maps BEGIN_POST to begin_milepost', () => {
		const result = normaliseFdot(base, null);
		expect(result.begin_milepost).toBe(0.0);
	});

	it('maps END_POST to end_milepost', () => {
		const result = normaliseFdot(base, null);
		expect(result.end_milepost).toBe(4.5);
	});

	it('maps SECT_NET_LNGTH_NUM to length_miles', () => {
		const result = normaliseFdot(base, null);
		expect(result.length_miles).toBe(4.5);
	});

	it('serialises geometry when provided', () => {
		const result = normaliseFdot(base, LINE);
		expect(result.geometry_geojson).toBe(JSON.stringify(LINE));
	});

	it('sets geometry_geojson to null when no geometry', () => {
		const result = normaliseFdot(base, null);
		expect(result.geometry_geojson).toBeNull();
	});

	it('serialises raw_json correctly', () => {
		const result = normaliseFdot(base, null);
		expect(JSON.parse(result.raw_json!)).toEqual(base);
	});

	it('sets road_name to null when SECT_DS is null', () => {
		const raw: FdotRciRaw = { ...base, SECT_DS: null };
		const result = normaliseFdot(raw, null);
		expect(result.road_name).toBeNull();
	});

	it('sets route_id to null when ROADWAY is null', () => {
		const raw: FdotRciRaw = { ...base, ROADWAY: null };
		const result = normaliseFdot(raw, null);
		expect(result.route_id).toBeNull();
	});

	it('sets county_code to null when CONTYDOT is null', () => {
		const raw: FdotRciRaw = { ...base, CONTYDOT: null };
		const result = normaliseFdot(raw, null);
		expect(result.county_code).toBeNull();
	});

	it('sets district_code to null when MNG_DIST_CD is null', () => {
		const raw: FdotRciRaw = { ...base, MNG_DIST_CD: null };
		const result = normaliseFdot(raw, null);
		expect(result.district_code).toBeNull();
	});

	it('sets begin_milepost to null when BEGIN_POST is null', () => {
		const raw: FdotRciRaw = { ...base, BEGIN_POST: null };
		const result = normaliseFdot(raw, null);
		expect(result.begin_milepost).toBeNull();
	});

	it('sets end_milepost to null when END_POST is null', () => {
		const raw: FdotRciRaw = { ...base, END_POST: null };
		const result = normaliseFdot(raw, null);
		expect(result.end_milepost).toBeNull();
	});

	it('sets length_miles to null when SECT_NET_LNGTH_NUM is null', () => {
		const raw: FdotRciRaw = { ...base, SECT_NET_LNGTH_NUM: null };
		const result = normaliseFdot(raw, null);
		expect(result.length_miles).toBeNull();
	});

	it('handles begin_milepost of 0 correctly (falsy but valid)', () => {
		const raw: FdotRciRaw = { ...base, BEGIN_POST: 0 };
		const result = normaliseFdot(raw, null);
		// 0 is a valid milepost — should NOT be treated as null
		expect(result.begin_milepost).toBe(0);
	});

	it('handles ROADWAY 8-char CC+RRR+SSS format correctly', () => {
		// Real FDOT format: 2-char county code + 3-char route + 3-char section
		const raw: FdotRciRaw = { ...base, ROADWAY: '12000100' };
		const result = normaliseFdot(raw, null);
		expect(result.route_id).toBe('12000100');
	});

	it('handles district codes 01 through 07 (all valid FDOT districts)', () => {
		const districts = ['01', '02', '03', '04', '05', '06', '07'];
		for (const dist of districts) {
			const raw: FdotRciRaw = { ...base, MNG_DIST_CD: dist };
			const result = normaliseFdot(raw, null);
			expect(result.district_code).toBe(dist);
		}
	});

	it('sets iri, pci, psr to null — not in FDOT RCI per-segment data', () => {
		const result = normaliseFdot(base, null);
		expect(result.iri).toBeNull();
		expect(result.pci).toBeNull();
		expect(result.psr).toBeNull();
	});

	it('handles completely null optional fields (sparse FDOT record)', () => {
		const raw: FdotRciRaw = {
			OBJECTID: 777,
			ROADWAY: null,
			CONTYDOT: null,
			MNG_DIST_CD: null,
			SECT_DS: null,
			BEGIN_POST: null,
			END_POST: null,
			SECT_NET_LNGTH_NUM: null,
			TRANSYS_CLS_CD: null,
			ST_HWY_SYS_CD: null,
			Shape__Length: null
		};
		const result = normaliseFdot(raw, null);
		expect(result.external_id).toBe('777');
		expect(result.road_name).toBeNull();
		expect(result.route_id).toBeNull();
		expect(result.county_code).toBeNull();
		expect(result.district_code).toBeNull();
		expect(result.begin_milepost).toBeNull();
		expect(result.end_milepost).toBeNull();
		expect(result.length_miles).toBeNull();
	});

	it('returns all required InsertSegment keys', () => {
		const result = normaliseFdot(base, null);
		const keys = [
			'state_dot', 'source', 'external_id', 'road_name', 'route_id',
			'functional_class', 'surface_type', 'iri', 'pci', 'psr',
			'begin_milepost', 'end_milepost', 'length_miles', 'lanes', 'aadt',
			'district_code', 'county_code', 'geometry_geojson', 'raw_json', 'data_year'
		];
		for (const key of keys) {
			expect(result).toHaveProperty(key);
		}
	});
});
