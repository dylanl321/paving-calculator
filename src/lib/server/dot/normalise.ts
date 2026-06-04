/**
 * Normaliser functions that map raw DOT API responses to DbDotRoadSegment format.
 * Each function handles the specific field mappings for a given DOT agency.
 */

import type {
	DbDotRoadSegment,
	AldotCpmsRaw,
	TxdotRoadwayRaw,
	GdotGpasRoadRaw,
	FdotRciRaw,
	GeoJsonLineString
} from '$lib/types/dot';

type InsertSegment = Omit<DbDotRoadSegment, 'id' | 'fetched_at' | 'updated_at'>;

/**
 * Normalises ALDOT CPMS raw feature to unified segment format.
 * ALDOT data focuses on project locations and funding, not detailed pavement metrics.
 */
export function normaliseAldot(
	raw: AldotCpmsRaw,
	geometry: GeoJsonLineString | null
): InsertSegment {
	return {
		state_dot: 'AL',
		source: 'aldot',
		external_id: String(raw.OBJECTID),
		road_name: raw.route || null,
		route_id: raw.route || null,
		functional_class: null,
		surface_type: null,
		iri: null,
		pci: null,
		psr: null,
		begin_milepost: null,
		end_milepost: null,
		length_miles: null,
		lanes: null,
		aadt: null,
		district_code: null,
		county_code: null,
		geometry_geojson: geometry ? JSON.stringify(geometry) : null,
		raw_json: JSON.stringify(raw),
		data_year: null
	};
}

/**
 * Normalises TxDOT Roadway Inventory raw feature to unified segment format.
 * TxDOT provides comprehensive roadway data including surface types and AADT.
 */
export function normaliseTxdot(
	raw: TxdotRoadwayRaw,
	geometry: GeoJsonLineString | null
): InsertSegment {
	// Combine surface type information
	const surfaceTypes = [raw.SRF_TYPE, raw.BASE_TP, raw.SURF_TREAT_1, raw.SURF_TREAT_2, raw.SURF_TREAT_3]
		.filter(Boolean)
		.join('; ');

	return {
		state_dot: 'TX',
		source: 'txdot',
		external_id: String(raw.OBJECTID),
		road_name: raw.RTE_NM || null,
		route_id: raw.RTE_NM || null,
		functional_class: raw.F_SYSTEM || null,
		surface_type: surfaceTypes || null,
		iri: null,
		pci: null,
		psr: null,
		begin_milepost: null,
		end_milepost: null,
		length_miles: null,
		lanes: raw.LANES_TOT || null,
		aadt: raw.AADT || null,
		district_code: null,
		county_code: null,
		geometry_geojson: geometry ? JSON.stringify(geometry) : null,
		raw_json: JSON.stringify(raw),
		data_year: null
	};
}

/**
 * Normalises GDOT GPAS Roads raw feature to unified segment format.
 * GDOT provides basic road network topology and route information.
 */
export function normaliseGdot(
	raw: GdotGpasRoadRaw,
	geometry: GeoJsonLineString | null
): InsertSegment {
	return {
		state_dot: 'GA',
		source: 'gdot',
		external_id: String(raw.OBJECTID),
		road_name: raw.ROUTE_NAME || null,
		route_id: raw.ROUTE_ID || null,
		functional_class: null,
		surface_type: null,
		iri: null,
		pci: null,
		psr: null,
		begin_milepost: null,
		end_milepost: null,
		length_miles: null,
		lanes: null,
		aadt: null,
		district_code: raw.DISTRICT || null,
		county_code: raw.COUNTY || null,
		geometry_geojson: geometry ? JSON.stringify(geometry) : null,
		raw_json: JSON.stringify(raw),
		data_year: null
	};
}

/**
 * Normalises FDOT RCI raw feature to unified segment format.
 * FDOT provides detailed roadway characteristics including mileposts and district codes.
 */
export function normaliseFdot(
	raw: FdotRciRaw,
	geometry: GeoJsonLineString | null
): InsertSegment {
	return {
		state_dot: 'FL',
		source: 'fdot',
		external_id: String(raw.OBJECTID),
		road_name: raw.SECT_DS || null,
		route_id: raw.ROADWAY || null,
		functional_class: null,
		surface_type: null,
		iri: null,
		pci: null,
		psr: null,
		begin_milepost: raw.BEGIN_POST ?? null,
		end_milepost: raw.END_POST ?? null,
		length_miles: raw.SECT_NET_LNGTH_NUM ?? null,
		lanes: null,
		aadt: null,
		district_code: raw.MNG_DIST_CD || null,
		county_code: raw.CONTYDOT || null,
		geometry_geojson: geometry ? JSON.stringify(geometry) : null,
		raw_json: JSON.stringify(raw),
		data_year: null
	};
}
