# Map and Location Math

This note summarizes how PaveRate turns map clicks, imported contract text, GPS
points, and road geometry into project locations, stations, and road sections.
The core rule is simple: this is a paving app, so editable project geometry is
road-first. Points and sections should resolve to a route centerline or a real
road network result, not arbitrary off-road coordinates.

## Source files

- `src/lib/services/mapUtils.ts` is the shared source for distance conversion,
  station conversion, route projection, route slicing, corridor polygons, and
  D1 GeoJSON serialization.
- `src/lib/services/gpsStation.ts` is the GPS-to-station helper used when the
  app needs station plus perpendicular offset from a known route.
- `src/lib/services/roadSnap.ts` constrains free map clicks to local GDOT road
  centerlines first, then OSRM road-network snapping/routing.
- `src/lib/server/gdot-geometry.ts` resolves imported GDOT documents to a route
  or approximate location from real upstream sources.
- `src/lib/server/gdot-boundaries.ts` resolves county and GDOT district by
  intersecting a point with GDOT boundary layers.

## Constants

All conversion constants come from `src/lib/config/paverate.yaml`:

- `CONST.FT_PER_M = 3.28084`
- `CONST.EARTH_RADIUS_M = 6371000`
- `CONST.FT_PER_STATION = 100`

The map math should keep reading those values through the config layer. Avoid
hardcoded conversion factors in map/location code.

## Coordinate Order

The app uses two coordinate conventions and converts deliberately at boundaries:

- UI/components use `[lat, lng]` or `{ lat, lng }`.
- GeoJSON and D1 storage use `[lng, lat]`, per RFC 7946.

Examples:

- A MapLibre component prop receives `[34.1, -84.2]`.
- A stored GeoJSON point for that same location is
  `{ "type": "Point", "coordinates": [-84.2, 34.1] }`.
- `geoJsonToD1()` stores GeoJSON as text in D1.
- `d1ToGeoJson()` parses stored text and returns `null` for malformed JSON.

## Distance Math

For point-to-point geodesic distance, `mapUtils.haversineMeters()` uses the
mean earth radius from config:

```text
dLat = radians(lat2 - lat1)
dLng = radians(lng2 - lng1)
a = sin(dLat / 2)^2
  + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLng / 2)^2
distance_m = R * 2 * atan2(sqrt(a), sqrt(1 - a))
distance_ft = distance_m * CONST.FT_PER_M
```

For polyline length, slicing, offsets, and projection, `mapUtils.ts` uses scoped
Turf packages. Turf works on GeoJSON `[lng, lat]`, returns metric distances,
and the app converts results to feet/stations with the config constants.

## Station Math

Stations are distance along the project route:

```text
feet = station * CONST.FT_PER_STATION
station = feet / CONST.FT_PER_STATION
```

With the current config, station `12.5` means 1,250 feet from route start and
formats as `12+50`.

`stationToCoordinate(station, waypoints)` converts a station to a map point by:

1. Converting `{ lat, lng }` waypoints into a GeoJSON LineString.
2. Converting the station to feet, then meters.
3. Using Turf `along()` to interpolate the point at that distance.
4. Returning `[lat, lng]`.

Negative stations return `null`. Stations beyond the route length clamp to the
final route vertex so callers still get a usable coordinate at the end of the
line.

`coordinateToStation(coord, waypoints)` does the inverse:

1. Converts the route to a GeoJSON LineString.
2. Projects the point onto the closest place on the route with Turf
   `nearestPointOnLine()`.
3. Rejects the coordinate if its perpendicular distance from the route is more
   than 50 meters.
4. Converts the projected distance along the route into stations.

That 50 meter rejection is part of the road-only guardrail for route-based
editors: an off-road click does not become a valid station.

## GPS Projection

`detectStation()` in `gpsStation.ts` is a lower-level GPS helper. It converts the
route and user position into a local flat-earth meter grid relative to the first
waypoint, projects the user point onto every segment, and returns:

- `station`: feet from route start divided by 100
- `distanceFt`: cumulative feet from route start
- `offsetFt`: perpendicular distance from route centerline

This helper is good for field positioning against a known route. It reports the
closest station and offset; it does not apply the 50 meter route-rejection rule
used by `coordinateToStation()`.

## Road Sections

Work-zone sections are station ranges on the route, not independent freehand
lines.

`sliceRouteByStations(waypoints, startStation, endStation)`:

1. Orders the two stations low-to-high.
2. Converts each station to a coordinate on the route.
3. Uses Turf `lineSlice()` between those two points.
4. Returns a GeoJSON LineString in stored `[lng, lat]` order.

This keeps section geometry on the actual route shape, including curves between
vertices.

`laneCorridorPolygon(waypoints, widthMeters)` builds a visual road corridor by
offsetting the route centerline left and right by half the width with Turf
`lineOffset()`, then joining the two offsets into a closed ring returned as
`[lat, lng]` pairs for the map component.

## Roads-Only Snapping

`roadSnap.ts` handles free map clicks before they become an alignment:

1. Query `/api/gdot-routes?bbox=...` for local GDOT road segments near the
   click. The bbox radius is `0.01` degrees, roughly 1 km at mid-latitudes.
2. Project the click onto each returned LineString and keep the closest point.
3. Accept the local snap only if it moved the point no more than 150 meters.
4. If no local segment is usable, call OSRM `nearest` for a public road-network
   fallback.
5. If neither source returns a road, return `null`.

For multi-point alignments, `buildRoadAlignment()` snaps each control point and
uses OSRM `route` between consecutive snapped points to build a road-following
polyline. If a routed leg fails, it preserves continuity with the two snapped
endpoints, but no synthetic upstream geometry is treated as authoritative.

## Import Location Resolution

`resolveImportLocation()` turns parsed GDOT document fields into map data using
real sources only. It returns null fields when sources fail rather than
inventing a location.

Resolution order:

1. GDOT GPAS ArcGIS Layer 5 route geometry from the parsed route designation,
   optionally trying the county-filtered query first.
2. OSM termini route: geocode parsed begin/end termini with Nominatim, then
   route between them with OSRM.
3. OSM Overpass route lookup by route reference when GDOT GPAS is unavailable.
4. US Census one-line geocode from the parsed location/county text.
5. GDOT county boundary centroid from the authoritative county polygon.
6. No location.

Route geometry sources return `locationPrecision: "route"`. Census geocoding
returns `"point"`. County centroid returns `"county"` and is only an
orientation fallback, not a paving alignment. Complete failure returns `"none"`.

When route geometry is found, the initial project latitude/longitude is the
middle vertex of the route LineString, converted from `[lng, lat]` to
`[lat, lng]`. That coordinate is a map anchor; the route itself remains the
important geometry for stations and sections.

## GDOT Boundary Lookup

`lookupGdotBoundaries(lat, lng)` determines context for a point by querying GDOT
boundary MapServer layers with an `esriGeometryPoint` intersection:

- Layer 3 gives county.
- Layer 4 gives GDOT district.

The query point is sent as `{ x: lng, y: lat, spatialReference: { wkid: 4326 } }`.
The response attributes are normalized across several possible field names.

## Import Road Sections and Log Events

When a route is accepted during import, route waypoints become the basis for
derived sections and roadway-log event coordinates.

- Route length is accumulated in feet across `[lng, lat]` LineString vertices
  with haversine distance.
- Roadway-log stations are converted to feet, then projected back to coordinates
  with `feetToCoordinate()`.
- Event coordinates are stored as GeoJSON points in `[lng, lat]`.
- Auto-created road sections divide the route into a small number of
  roughly-even station ranges and store each section as GeoJSON text.

The key invariant is that station-derived events and sections come from accepted
route waypoints. They should not be placed independently off the route.

## Practical Checks

When changing map/location code, verify these properties:

- No new map math hardcodes feet-per-meter, feet-per-station, or earth radius.
- UI code passes `[lat, lng]`; stored GeoJSON remains `[lng, lat]`.
- Route clicks either snap to a valid road/route or fail visibly.
- `coordinateToStation()` still rejects off-route points.
- Imported county centroid locations are presented as approximate context, not
  as route geometry.
- Sections and roadway-log event points are derived from the route or station
  math, not arbitrary map coordinates.
