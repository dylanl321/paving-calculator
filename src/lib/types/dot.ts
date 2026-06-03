/**
 * Multi-state DOT road data — unified TypeScript types.
 *
 * Supports ALDOT (AL), TxDOT (TX), GDOT (GA), FDOT (FL) and any future state DOT.
 * All external data is normalised into DotRoadSegment before being stored in D1.
 *
 * Sources researched:
 *   ALDOT — ArcGIS FeatureServer (no auth) + FHWA HPMS 2018
 *   TxDOT — ArcGIS FeatureServer (no auth, 133-field roadway inventory)
 *   GDOT  — Enterprise GIS ArcGIS REST (roads/interstates confirmed; pavement condition not public)
 *   FDOT  — ArcGIS FeatureServer + FTP shapefiles (HPMS weekly)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Discriminators
// ─────────────────────────────────────────────────────────────────────────────

/** 2-letter USPS state code for supported DOT agencies. */
export type StateDot = 'AL' | 'TX' | 'GA' | 'FL' | string; // open for future states

/**
 * Short identifier for the data source/agency.
 * - aldot      Alabama DOT ArcGIS FeatureServer
 * - txdot      Texas DOT ArcGIS FeatureServer
 * - gdot       Georgia DOT Enterprise GIS
 * - fdot       Florida DOT ArcGIS FeatureServer / FTP shapefiles
 * - fhwa_hpms  Federal HPMS 2018 (geo.dot.gov, no-auth vintage)
 */
export type DotSource = 'aldot' | 'txdot' | 'gdot' | 'fdot' | 'fhwa_hpms' | string;

// ─────────────────────────────────────────────────────────────────────────────
// D1 row interfaces (snake_case, mirrors SQL schema)
// ─────────────────────────────────────────────────────────────────────────────

/** Raw D1 row from `dot_road_segments`. */
export interface DbDotRoadSegment {
  id: string;
  state_dot: StateDot;
  source: DotSource;
  external_id: string;
  road_name: string | null;
  route_id: string | null;
  /** FHWA functional classification: 1=Interstate, 2=Other Freeway, 3=Other Principal Arterial, ... */
  functional_class: number | null;
  surface_type: string | null;
  /** International Roughness Index (in/mi or m/km, depending on source) */
  iri: number | null;
  /** Pavement Condition Index 0–100 (not currently public for GDOT or FDOT per-segment) */
  pci: number | null;
  /** Present Serviceability Rating 0–5 (FHWA HPMS field) */
  psr: number | null;
  begin_milepost: number | null;
  end_milepost: number | null;
  length_miles: number | null;
  lanes: number | null;
  aadt: number | null;
  /** DOT district code (agency-specific, e.g. FDOT MNG_DIST_CD '01'–'07') */
  district_code: string | null;
  /** County code: FIPS 5-digit or agency-specific */
  county_code: string | null;
  /** GeoJSON LineString (WGS84) or null if geometry not available */
  geometry_geojson: string | null;
  /** Full raw JSON from source API for future re-parsing */
  raw_json: string | null;
  /** Year the source dataset represents (e.g. 2018 for FHWA HPMS 2018) */
  data_year: number | null;
  fetched_at: number;
  updated_at: number;
}

/** Raw D1 row from `dot_sync_log`. */
export interface DbDotSyncLog {
  id: string;
  state_dot: StateDot;
  source: DotSource;
  status: 'success' | 'partial' | 'failed';
  records_upserted: number;
  error_message: string | null;
  synced_at: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Augmented road_sections interface (extends existing DbRoadSection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extends the existing road_sections row with optional DOT linkage columns
 * added in migration 0042_dot_road_data.
 *
 * These columns are nullable — existing rows will have null until explicitly linked.
 */
export interface DbRoadSectionWithDot {
  id: string;
  job_site_id: string;
  name: string;
  lane: string;
  station_start: number | null;
  station_end: number | null;
  status: 'active' | 'completed' | 'skipped';
  geometry_geojson: string | null;
  notes: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  // DOT linkage (new in 0042)
  state_dot: StateDot | null;
  external_segment_id: string | null;
  dot_source: DotSource | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Application-layer types (camelCase, used in SvelteKit routes/stores)
// ─────────────────────────────────────────────────────────────────────────────

/** Application-layer representation of a DOT road segment. */
export interface DotRoadSegment {
  id: string;
  stateDot: StateDot;
  source: DotSource;
  externalId: string;
  roadName: string | null;
  routeId: string | null;
  functionalClass: number | null;
  surfaceType: string | null;
  iri: number | null;
  pci: number | null;
  psr: number | null;
  beginMilepost: number | null;
  endMilepost: number | null;
  lengthMiles: number | null;
  lanes: number | null;
  aadt: number | null;
  districtCode: string | null;
  countyCode: string | null;
  geometry: GeoJsonLineString | null;
  dataYear: number | null;
  fetchedAt: number;
  updatedAt: number;
}

/** Minimal GeoJSON LineString (WGS84). */
export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat] pairs
}

/** Result of a DOT data sync operation. */
export interface DotSyncResult {
  stateDot: StateDot;
  source: DotSource;
  status: 'success' | 'partial' | 'failed';
  recordsUpserted: number;
  errorMessage: string | null;
  syncedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Source-specific field maps (documentation of raw API field -> unified field)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ALDOT CPMS_Project_Location field mapping.
 * Source: https://services.arcgis.com/LZzQi3xDiclG6XvQ/arcgis/rest/services/CPMS_Project_Location/FeatureServer/0
 */
export interface AldotCpmsRaw {
  OBJECTID: number;
  type_of_work: string | null;
  route: string | null;
  project_start: string | null;
  project_completion: string | null;
  project_cost: number | null;
  funding_source: string | null;
  [key: string]: unknown;
}

/**
 * TxDOT Roadway Inventory field mapping.
 * Source: https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadway_Inventory/FeatureServer/0
 * 133 fields total; only paving-relevant subset listed here.
 */
export interface TxdotRoadwayRaw {
  OBJECTID: number;
  RTE_NM: string | null;       // route name
  F_SYSTEM: number | null;     // functional system (FHWA classification)
  SRF_TYPE: string | null;     // surface type code
  BASE_TP: string | null;      // base type
  SURF_TREAT_1: string | null; // surface treatment 1
  SURF_TREAT_2: string | null; // surface treatment 2
  SURF_TREAT_3: string | null; // surface treatment 3
  AADT: number | null;
  LANES_TOT: number | null;
  [key: string]: unknown;
}

/**
 * GDOT GPAS Roads & Highways (layer 5) field mapping.
 * Source: https://enterprisegis.dot.ga.gov/hosting/rest/services/GPAS/GPAS/MapServer/5/query
 */
export interface GdotGpasRoadRaw {
  OBJECTID: number;
  ROUTE_ID: string | null;
  ROUTE_NAME: string | null;
  COUNTY: string | null;
  DISTRICT: string | null;
  [key: string]: unknown;
}

/**
 * FDOT RCI FEAT_RCIT110 field mapping (primary road network).
 * Source: https://services1.arcgis.com/O1JpcwDW8sjYuddV/ArcGIS/rest/services/FEAT_RCIT110_OVERALL_DESC/FeatureServer/0
 */
export interface FdotRciRaw {
  OBJECTID: number;
  ROADWAY: string | null;       // 8-char CC+RRR+SSS route code
  CONTYDOT: string | null;      // 2-char county DOT code
  MNG_DIST_CD: string | null;   // managing district '01'–'07'
  SECT_DS: string | null;       // section description / road name
  BEGIN_POST: number | null;    // begin milepost
  END_POST: number | null;      // end milepost
  SECT_NET_LNGTH_NUM: number | null; // segment length in miles
  TRANSYS_CLS_CD: string | null;
  ST_HWY_SYS_CD: string | null;
  Shape__Length: number | null; // geometry length in meters (UTM)
  [key: string]: unknown;
}

/**
 * FHWA HPMS 2018 field mapping.
 * Source: https://geo.dot.gov/server/rest/services/Hosted/{State}_2018_PR/FeatureServer/0
 */
export interface FhwaHpmsRaw {
  OBJECTID: number;
  IRI: number | null;
  PSR: number | null;
  surface_type: string | null;
  AADT: number | null;
  f_system: number | null;
  route_id: string | null;
  through_lanes: number | null;
  structure_type: string | null;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normaliser function signatures (to be implemented in src/lib/server/dot/)
// ─────────────────────────────────────────────────────────────────────────────

/** Maps an ALDOT CPMS raw feature to the unified insert shape. */
export type AldotNormaliser = (
  raw: AldotCpmsRaw,
  geometry: GeoJsonLineString | null
) => Omit<DbDotRoadSegment, 'id' | 'fetched_at' | 'updated_at'>;

/** Maps a TxDOT roadway inventory raw feature to the unified insert shape. */
export type TxdotNormaliser = (
  raw: TxdotRoadwayRaw,
  geometry: GeoJsonLineString | null
) => Omit<DbDotRoadSegment, 'id' | 'fetched_at' | 'updated_at'>;

/** Maps a GDOT GPAS roads raw feature to the unified insert shape. */
export type GdotNormaliser = (
  raw: GdotGpasRoadRaw,
  geometry: GeoJsonLineString | null
) => Omit<DbDotRoadSegment, 'id' | 'fetched_at' | 'updated_at'>;

/** Maps an FDOT RCI raw feature to the unified insert shape. */
export type FdotNormaliser = (
  raw: FdotRciRaw,
  geometry: GeoJsonLineString | null
) => Omit<DbDotRoadSegment, 'id' | 'fetched_at' | 'updated_at'>;

/** Maps an FHWA HPMS raw feature to the unified insert shape. */
export type FhwaHpmsNormaliser = (
  stateDot: StateDot,
  raw: FhwaHpmsRaw,
  geometry: GeoJsonLineString | null
) => Omit<DbDotRoadSegment, 'id' | 'fetched_at' | 'updated_at'>;
