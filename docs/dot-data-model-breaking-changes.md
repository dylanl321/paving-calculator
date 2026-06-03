# Multi-State DOT Data Model — Breaking Changes Notes

## Migration 0042_dot_road_data

### New tables (no existing data affected)
- `dot_road_segments` — external DOT road segment reference data with unified schema
- `dot_sync_log` — sync history per (state_dot, source)

### Modified table: `road_sections`
Three nullable columns added via `ALTER TABLE ... ADD COLUMN`:
- `state_dot TEXT` — optional 2-letter state code (AL, TX, GA, FL, …)
- `external_segment_id TEXT` — soft reference into dot_road_segments.external_id
- `dot_source TEXT` — source agency identifier (aldot, txdot, gdot, fdot, fhwa_hpms)

**Backward compatibility:** All three columns are nullable with no DEFAULT constraint,
so existing rows remain valid and all existing INSERT/UPDATE queries that omit these
columns continue to work without modification.

**No queries broken** by this migration. The new columns are purely additive.

---

## TypeScript types added: `src/lib/types/dot.ts`

New exports (all new, no existing symbol renamed):
- `StateDot` — union type for 2-letter state codes
- `DotSource` — union type for agency identifiers
- `DbDotRoadSegment` — D1 row interface for dot_road_segments
- `DbDotSyncLog` — D1 row interface for dot_sync_log
- `DbRoadSectionWithDot` — extended road_sections row interface including new columns
- `DotRoadSegment` — camelCase application-layer model
- `GeoJsonLineString` — minimal GeoJSON LineString
- `DotSyncResult` — sync operation result
- `AldotCpmsRaw`, `TxdotRoadwayRaw`, `GdotGpasRoadRaw`, `FdotRciRaw`, `FhwaHpmsRaw` — raw API field maps
- Normaliser function type aliases for each agency

## db.ts additions

New methods on `DatabaseService` class (non-breaking additions):
- `upsertDotSegment(row)` — insert or update a DOT road segment
- `getDotSegmentsByState(stateDot, limit?)` — query segments by state
- `getDotSegmentsByRoute(stateDot, routeId)` — query segments by route
- `logDotSync(stateDot, source, status, count, error?)` — record sync attempt
- `getLastDotSync(stateDot, source)` — retrieve most recent sync log entry

---

## API endpoint notes (future work — not in scope for this migration)

Pavement condition availability by agency:
| Agency | IRI/PCI public? | Best source |
|---|---|---|
| ALDOT | IRI via FHWA HPMS 2018 only (2019+ requires federal token) | geo.dot.gov/…/Alabama_2018_PR/FeatureServer/0 |
| TxDOT | Surface type/base/thickness public; IRI via HPMS 2018 only | services.arcgis.com/KTcxiTD9dsQw4r7Z/…/TxDOT_Roadway_Inventory |
| GDOT  | NOT public (PACES system, contact GDOT GIS) | enterprisegis.dot.ga.gov GPAS layer 5 for roads |
| FDOT  | Per-segment IRI/PCI NOT public REST; HPMS shapefile via FTP | ftp.fdot.gov (weekly) |
