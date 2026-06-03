# ALDOT & TxDOT Data Sources / APIs
## Integration Research Document

_Last probed: 2026-06-03. All HTTP status codes are from live curl probes._

---

## Summary

| Agency | Best Data Source | Auth | Format | IRI/Pavement Condition Available |
|---|---|---|---|---|
| ALDOT | FHWA HPMS 2018 + ArcGIS Online (registerw_ALDOT) | None | JSON/GeoJSON/Shapefile | IRI via HPMS 2018 only |
| TxDOT | ArcGIS REST (KTcxiTD9dsQw4r7Z) | None | JSON/GeoJSON/Shapefile/CSV | Surface type/base/thickness public; IRI via FHWA HPMS 2018 |

Both agencies expose their road network data through ArcGIS FeatureServer REST APIs with no authentication. Neither exposes a real-time pavement condition index (PCI) publicly.

---

## ALDOT (Alabama DOT)

### Agency Overview
- Main site: https://www.dot.state.al.us/ (HTTP 200, HTML only)
- GIS subdomains (gis.dot.state.al.us, maps.dot.state.al.us): **DNS failure — decommissioned**
- Pavement bureau page: **removed** (dot.state.al.us/bureaus/Materials/pavement/index.html returns "Page Not Found")

### Primary Data Source: ALDOT ArcGIS Online

**Base URL:** https://services.arcgis.com/LZzQi3xDiclG6XvQ/arcgis/rest/services/

**Auth:** None required
**Rate limits:** None documented
**Formats:** JSON, GeoJSON, Shapefile, KML, FileGDB
**Status:** HTTP 200 on all 10 public services

#### Available Services

| Service | Description | Key Fields |
|---|---|---|
| CPMS_Project_Location | Construction project locations | type_of_work, route, project_start, project_completion, project_cost, funding_source |
| Federal_Aid_and_Map_21 | LRS linear reference routes | RID, Fed_Funding |
| ALDOT_Mile_Marker | Mile markers | marker_id, route, milepoint |
| Mile_Marker | Road mileage reference points | -- |
| Milepoint | Route linear referencing | -- |
| Milepost | Milepost markers | -- |
| District_Area_Boundaries | ALDOT district admin boundaries | district_id, district_name |
| Regions | ALDOT regions | region_id |
| CountyBoundary | Alabama county boundaries | county_name, FIPS |
| Area_Boundary | Planning area boundaries | -- |

#### Query Pattern
```
https://services.arcgis.com/LZzQi3xDiclG6XvQ/arcgis/rest/services/{ServiceName}/FeatureServer/0/query
  ?where=1%3D1
  &outFields=*
  &f=json
```

#### CPMS_Project_Location -- Most Relevant for Paving Crews

The construction project locations service (CPMS) is the most relevant for PaveRate use cases. It tracks resurfacing, overlay, and pavement rehabilitation projects with:
- `type_of_work` -- project classification (includes resurfacing/paving types)
- `route` -- state route identifier
- `project_start` / `project_completion` -- schedule dates
- `project_cost` -- dollar amount
- `funding_source` -- federal vs. state funding

Geometry: polylines along road segments.

### Secondary Source: FHWA HPMS 2018 (Alabama)

**Base URL:** https://geo.dot.gov/server/rest/services/Hosted/Alabama_2018_PR/FeatureServer/0

**Auth:** None (2018 data; 2019-2023 returns HTTP 499 "Token Required")
**Rate limits:** None documented
**Format:** ArcGIS FeatureServer JSON; also downloadable as Shapefile, GeoJSON, CSV, SQLite, KML

#### Key Pavement Fields
| Field | Description |
|---|---|
| IRI | International Roughness Index (primary pavement condition metric) |
| PSR | Present Serviceability Rating |
| surface_type | Pavement surface classification |
| AADT | Annual Average Daily Traffic |
| f_system | Functional highway system classification |
| route_id | Route identifier |
| through_lanes | Number of through lanes |
| structure_type | Pavement structure type |

#### Query Example
```
https://geo.dot.gov/server/rest/services/Hosted/Alabama_2018_PR/FeatureServer/0/query
  ?where=1%3D1
  &outFields=IRI,PSR,surface_type,AADT,f_system,route_id
  &f=json
```

#### Limitations
- Data is 2018 vintage -- pavement conditions will be stale
- Newer HPMS data (2019-2023) requires a geo.dot.gov API token (federal credentialed access)
- HPMS is a federal reporting dataset, not a real-time sensor feed

### Terms of Service / Constraints
- ArcGIS Online public services: standard Esri public use terms; no commercial use restrictions explicitly stated
- FHWA geo.dot.gov: federal public data; disclaimer "not for navigation or safety-critical use"
- No rate limits published for either source; use standard HTTP etiquette (respect Retry-After)

---

## TxDOT (Texas DOT)

### Agency Overview
- Main site: https://www.txdot.gov/ (HTTP 200, HTML navigation portal)
- Pavement management page: **HTTP 404** (removed/restructured)
- GIS Open Data Hub: https://gis-txdot.opendata.arcgis.com/ (HTTP 200, fully functional)

### Primary Data Source: TxDOT ArcGIS REST Services

**Base URL:** https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/

**Auth:** None required
**Rate limits:** None documented
**Formats:** JSON, GeoJSON, Shapefile, CSV, KML
**Status:** HTTP 200; 683 total FeatureServer services; 106+ road/pavement-relevant
**Machine-readable catalog:** https://gis-txdot.opendata.arcgis.com/api/feed/dcat-us/1.1.json (236 datasets, DCAT-US 1.1 format)

#### Top Pavement-Relevant Services

| Service Name | Description | Key Fields |
|---|---|---|
| TxDOT_Roadway_Inventory | Full TX road network, 133 fields | SRF_TYPE, BASE_TP, SURF_TREAT_CODE/THICK/YEAR, FLEX_ESAL, RIGID_ESAL, LANE_WIDTH, NUM_LANES, RB_WID, ADT_CUR, TRK_AADT_PCT, HPMSID |
| Roadway_Inventory_2023 | 2023 snapshot | same as above |
| TxDOT_Roadway_Inventory_2012..2019 | Historical annual snapshots | same fields, vintage data |
| TxDOT_Roadbed_Surface | Surface type per segment (HPMS-required) | SRFC_TYPE |
| TxDOT_Roadbed_Base | Base pavement type | BASE_TP |
| TxDOT_Base_Thickness | Pavement base thickness | BASE_THICK |
| PavementProfile_ReferencePoints | Pavement cross-section, 81 fields | surface/shoulder widths, paving flags |
| RPAM_CountySurfaceAdjustmentFactors | Road Pavement Asset Mgmt county factors | county, adjustment_factor |
| RPAM_ODP_Access_Control_Lines | RPAM access control lines | -- |
| TxDOT_Outside_Shoulder | Shoulder type/width | SHLD_TYPE, SHLD_WID |
| TxDOT_Inside_Shoulder | Inside shoulder | SHLD_TYPE, SHLD_WID |
| TxDOT_Roadway_Inventory_OnSystem | On-system routes only | same fields |
| TxDOT_Bridges_SNBI | Bridge condition (SNBI ratings) | BRIDGE_ID, CONDITION_RATING |
| TxDOT_AADT | Annual Average Daily Traffic | AADT_CUR, YEAR |
| TxDOT_Truck_Percent | Truck traffic percentage | TRK_PCT |
| TxDOT_Congestion | Congestion measures | -- |
| TxDOT_Top_100_Congested_Roadways | Top congested routes | RANK, DELAY_HRS |

#### Key Field Reference (TxDOT_Roadway_Inventory)

```
SRF_TYPE           Surface type code (AC = asphalt concrete, PCC = Portland cement, etc.)
BASE_TP            Base type (flex/rigid)
SURF_TREAT_CODE    Surface treatment (seal coat, overlay, etc.)
SURF_TREAT_THICK   Treatment thickness (inches)
SURF_TREAT_YEAR    Year of last treatment
FLEX_ESAL          Flexible pavement equivalent single axle loads
RIGID_ESAL         Rigid pavement ESAL
LANE_WIDTH         Width of travel lanes
NUM_LANES          Number of through lanes
RB_WID             Roadbed width
ADT_CUR            Current annual average daily traffic
TRK_AADT_PCT       Truck percentage of AADT
HPMSID             Cross-reference to FHWA HPMS record
```

#### Query Pattern
```
https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/{ServiceName}/FeatureServer/0/query
  ?where=county_name='HARRIS'
  &outFields=SRF_TYPE,BASE_TP,SURF_TREAT_YEAR,ADT_CUR,NUM_LANES
  &returnGeometry=true
  &geometryType=esriGeometryPolyline
  &f=json
```

#### Spatial Filter (bounding box) Pattern
```
https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadway_Inventory/FeatureServer/0/query
  ?geometry=-97.8,30.2,-97.6,30.4
  &geometryType=esriGeometryEnvelope
  &spatialRel=esriSpatialRelIntersects
  &outFields=*
  &f=json
```

### Secondary Source: FHWA HPMS 2018 (Texas)

**Base URL:** https://geo.dot.gov/server/rest/services/Hosted/Texas_2018_PR/FeatureServer/0

**Auth:** None (same 2018 public vintage as Alabama)
**Rate limits:** None documented
**Format:** ArcGIS FeatureServer; Shapefile/GeoJSON/CSV/SQLite downloads available

#### Key Fields
| Field | Description |
|---|---|
| IRI | International Roughness Index (primary roughness metric) |
| PSR | Present Serviceability Rating |
| surface_type | HPMS surface classification |
| through_lanes | Number of through lanes |
| speed_limit | Posted speed limit |
| AADT | Annual Average Daily Traffic |
| AADT_COMBINATION | Combination truck AADT |
| AADT_SINGLE_UNIT | Single-unit truck AADT |
| f_system | Functional system classification |
| NHS | National Highway System flag |
| route_id | Route identifier |
| begin_point / end_point | Linear referencing mileposts |

#### Query Example
```
https://geo.dot.gov/server/rest/services/Hosted/Texas_2018_PR/FeatureServer/0/query
  ?where=f_system=1
  &outFields=IRI,PSR,surface_type,AADT,route_id,begin_point,end_point
  &f=json
```

### Machine-Readable Catalog

The DCAT-US catalog at https://gis-txdot.opendata.arcgis.com/api/feed/dcat-us/1.1.json provides 236 datasets in standard catalog format. Each entry includes:
- `landingPage` URL
- `distribution` array with download links (GeoJSON, CSV, Shapefile, KML)
- `description` with field definitions
- `modified` timestamp for freshness checking

This is the best programmatic entry point for discovering new datasets as TxDOT publishes them.

### Terms of Service / Constraints
- TxDOT ArcGIS public services: Esri public use terms; TxDOT data described as public domain on the hub
- FHWA geo.dot.gov: federal public data; no navigation disclaimer
- No published rate limits; standard HTTP etiquette applies
- TxDOT does NOT publicly expose a standalone PCI (Pavement Condition Index) or current IRI -- internal RPAM system exists but is not public-facing

---

## FHWA HPMS -- Cross-Agency Notes

The Highway Performance Monitoring System (HPMS) is the federal standard for state DOT pavement reporting. Both Alabama and Texas submit data annually.

**Data vintage publicly available without auth:** 2018 (confirmed via geo.dot.gov)
**Newer vintages (2019-2023):** geo.dot.gov returns HTTP 499 "Token Required" -- requires a federal credentialed account
**URL pattern for all states:**
```
https://geo.dot.gov/server/rest/services/Hosted/{State}_{Year}_PR/FeatureServer/0
```

Examples:
```
Alabama 2018: https://geo.dot.gov/server/rest/services/Hosted/Alabama_2018_PR/FeatureServer/0
Texas 2018:   https://geo.dot.gov/server/rest/services/Hosted/Texas_2018_PR/FeatureServer/0
```

IRI thresholds (FHWA, NHS roads): under 95 in/mile = good, 95-170 = fair, over 170 = poor.

---

## Integration Recommendations

### For PaveRate -- Immediate Use

1. **TxDOT_Roadway_Inventory** is production-ready: live ArcGIS REST, no auth, 133 fields including surface type, treatment history, AADT. Recommended for Texas job lookup by route/county.

2. **ALDOT CPMS_Project_Location** is production-ready: live ArcGIS REST, no auth. Best for tracking resurfacing projects in Alabama by route/district.

3. **FHWA HPMS 2018** (both states): suitable for baseline pavement condition context. Data is stale (2018) but IRI provides a roughness reference.

### Data Gaps / Future Work

- **Current pavement condition (IRI 2023):** Not publicly available for either state without federal credentials. Options: (a) apply for geo.dot.gov API access, (b) contact state DOT directly for bulk data agreement.
- **ALDOT has no publicly accessible GIS subdomain** -- their ArcGIS Online account (registerw_ALDOT) is the only live option.
- **TxDOT RPAM** (Road Pavement Asset Management) internal system exists but is not exposed publicly; only derivative fields appear in the Roadway Inventory service.

---

## Endpoint Quick Reference

```
# ALDOT

ALDOT ArcGIS Online (10 services):
  https://services.arcgis.com/LZzQi3xDiclG6XvQ/arcgis/rest/services/?f=json

ALDOT CPMS (resurfacing projects):
  https://services.arcgis.com/LZzQi3xDiclG6XvQ/arcgis/rest/services/CPMS_Project_Location/FeatureServer/0/query?where=1%3D1&outFields=*&f=json

ALDOT LRS Routes:
  https://services.arcgis.com/LZzQi3xDiclG6XvQ/arcgis/rest/services/Federal_Aid_and_Map_21/FeatureServer/0/query?where=1%3D1&outFields=*&f=json

FHWA HPMS Alabama 2018:
  https://geo.dot.gov/server/rest/services/Hosted/Alabama_2018_PR/FeatureServer/0/query?where=1%3D1&outFields=IRI,PSR,surface_type,AADT,route_id&f=json

# TxDOT

TxDOT Service Directory:
  https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/?f=json

TxDOT Roadway Inventory (primary):
  https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadway_Inventory/FeatureServer/0/query?where=1%3D1&outFields=SRF_TYPE,BASE_TP,SURF_TREAT_YEAR,ADT_CUR,NUM_LANES,LANE_WIDTH&f=json

TxDOT Roadbed Surface:
  https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Roadbed_Surface/FeatureServer/0/query?where=1%3D1&outFields=*&f=json

TxDOT DCAT Catalog:
  https://gis-txdot.opendata.arcgis.com/api/feed/dcat-us/1.1.json

FHWA HPMS Texas 2018:
  https://geo.dot.gov/server/rest/services/Hosted/Texas_2018_PR/FeatureServer/0/query?where=1%3D1&outFields=IRI,PSR,surface_type,AADT,route_id,begin_point,end_point&f=json
```

---

_Document generated from live HTTP probes. All confirmed-working endpoints returned HTTP 200 at probe time._
