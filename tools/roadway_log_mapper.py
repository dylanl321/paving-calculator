#!/usr/bin/env python3
"""
roadway_log_mapper.py
=====================
Correlate an imported roadway log (plan-sheet events sorted by project mile) to
an actual road centerline and resolve every event to geographic coordinates.

What it does
------------
1. Parse a raw pasted log (or a table / CSV / DataFrame) into structured events,
   each with a measure (project mile), a type, free text, and parsed attributes
   (lane/shoulder widths, BEGIN/END operations).
2. Pull the road centerline from the GDOT statewide LRS network (ArcGIS REST),
   which returns geometry in WGS84 with M-values equal to mileposts -- or load a
   centerline you already have.
3. Do linear referencing locally (no PostGIS / ArcGIS license needed):
      measure          -> point   (point events: side roads, markers, stations)
      [from,to] measure-> polyline (segments: milling, overlay, shoulder runs)
      point            -> measure  (reverse, used for auto-calibration)
4. Emit a GeoJSON FeatureCollection (point waypoints + line segments + the route)
   plus an optional CSV of waypoints with lat/lon.

Project mile vs route milepost
------------------------------
The log's "project mile" is usually a *county* or *project* measure that does not
equal the route's cumulative LRS measure. Calibrate with one of:
    --offset N                      route_M = project_M + N
    --calibrate p1:m1 p2:m2         linear fit from two known pairs
    --snap-start LON,LAT            derive offset by snapping a known coordinate
Default offset is 0 (with a warning) -- valid only when the plan's MP already
matches the route LRS, as in logs tagged "(MP 0.000/<COUNTY>)" at the state line.

Core has ZERO third-party dependencies (stdlib only). `pandas` is used only if you
feed it a DataFrame.

Author: built for a GDOT-style plan-sheet roadway log.
"""

from __future__ import annotations

import argparse
import bisect
import csv
import json
import math
import re
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from typing import Iterable, Optional, Sequence

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #

GDOT_ROUTE_LAYER = (
    "https://rnhp.dot.ga.gov/hosting/rest/services/"
    "GDOT_ROUTE_NETWORK/MapServer/0"
)
USER_AGENT = "roadway-log-mapper/1.0"

# Event-type labels that appear on their own line in an imported log, in the
# order we try to match them (longest / most specific first is not required
# because we match the whole line).
KNOWN_EVENT_TYPES = {
    "project start",
    "project end",
    "operation change",
    "width change",
    "side road",
    "reference",
    "bridge",
    "intersection",
    "begin",
    "end",
}

WIDTH_LINE_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*ft\.?\s*$", re.IGNORECASE)
MEASURE_LINE_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*$")

# Phrases that open / close a linear treatment. We capture the text after the
# keyword up to the next BEGIN/END/CONTINUE so a segment can be tagged with the
# treatments active over it.
_OP_SPLIT_RE = re.compile(r"\b(BEGIN|END|CONTINUE)\b", re.IGNORECASE)


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #

@dataclass
class Event:
    measure: float                       # project mile as written in the log
    event_type: str                      # normalized lower-case type
    text: str                            # full description text
    width_ft: Optional[float] = None     # trailing "NN ft" cross-section width
    begins: list[str] = field(default_factory=list)   # treatments that BEGIN here
    ends: list[str] = field(default_factory=list)      # treatments that END here
    side_road: Optional[dict] = None     # {name, side, paved} for side roads

    def label(self) -> str:
        if self.side_road:
            sr = self.side_road
            paved = "paved" if sr.get("paved") else "unpaved"
            return f"{sr['name']} ({sr['side']}, {paved})"
        return self.event_type.title()


@dataclass
class Route:
    """A measured centerline: parallel arrays sorted ascending by measure."""
    measures: list[float]                # M value (mile) per vertex
    lonlat: list[tuple[float, float]]    # (lon, lat) per vertex, WGS84
    route_id: str = ""
    meta: dict = field(default_factory=dict)

    def m_range(self) -> tuple[float, float]:
        return (self.measures[0], self.measures[-1])


# --------------------------------------------------------------------------- #
# 1. Parsing
# --------------------------------------------------------------------------- #

def _parse_side_road(text: str) -> Optional[dict]:
    """'STRICKLAND ROAD, LEFT, UNPAVED' -> dict."""
    parts = [p.strip() for p in text.split(",")]
    if len(parts) < 2:
        return None
    name = parts[0].title()
    side = next((p.upper() for p in parts if p.upper() in ("LEFT", "RIGHT")), None)
    paved = None
    up = text.upper()
    if "UNPAVED" in up:
        paved = False
    elif "PAVED" in up:
        paved = True
    if side is None:
        return None
    return {"name": name, "side": side.title(), "paved": paved}


def _parse_operations(text: str) -> tuple[list[str], list[str]]:
    """Pull BEGIN/END treatment phrases out of a description blob."""
    begins, ends = [], []
    tokens = _OP_SPLIT_RE.split(text)
    # tokens looks like ['', 'BEGIN', ' phrase ', 'END', ' phrase ', ...]
    i = 1
    while i < len(tokens) - 1:
        kw = tokens[i].upper()
        phrase = tokens[i + 1].strip(" .,-")
        if phrase:
            short = re.sub(r"\s+", " ", phrase)[:120]
            if kw == "BEGIN":
                begins.append(short)
            elif kw == "END":
                ends.append(short)
        i += 2
    return begins, ends


def _normalize_type(line: str) -> Optional[str]:
    t = line.strip().lower().rstrip(":")
    if t in KNOWN_EVENT_TYPES:
        return t
    # tolerate minor variants
    for k in KNOWN_EVENT_TYPES:
        if t.startswith(k):
            return k
    return None


def parse_raw_log(text: str) -> list[Event]:
    """
    Parse a pasted log of the form:

        0.000
        Project Start
        BEGIN PROJECT ...
        58 ft
        0.019
        Width Change
        WIDTH CHANGE END ... BEGIN ...
        28 ft
        0.680
        Side Road
        STRICKLAND ROAD, LEFT, UNPAVED
        ...
    """
    lines = [ln.rstrip() for ln in text.splitlines()]
    # drop obvious header/footer noise
    lines = [ln for ln in lines if ln.strip()]

    events: list[Event] = []
    i = 0
    n = len(lines)
    while i < n:
        m = MEASURE_LINE_RE.match(lines[i])
        if not m:
            i += 1
            continue
        measure = float(m.group(1))
        i += 1
        if i >= n:
            break
        etype = _normalize_type(lines[i])
        if etype is None:
            # No recognizable type line; treat next line as type-less note.
            etype = "note"
        else:
            i += 1
        # gather description lines + trailing width until the next measure line
        desc_parts: list[str] = []
        width: Optional[float] = None
        while i < n and not MEASURE_LINE_RE.match(lines[i]):
            wm = WIDTH_LINE_RE.match(lines[i])
            if wm:
                width = float(wm.group(1))
            else:
                desc_parts.append(lines[i].strip())
            i += 1
        text_blob = " ".join(desc_parts).strip()
        begins, ends = _parse_operations(text_blob)
        ev = Event(
            measure=measure,
            event_type=etype,
            text=text_blob,
            width_ft=width,
            begins=begins,
            ends=ends,
        )
        if etype == "side road":
            ev.side_road = _parse_side_road(text_blob)
        events.append(ev)

    events.sort(key=lambda e: e.measure)
    return events


def parse_table(rows: Iterable[dict]) -> list[Event]:
    """
    Build events from tabular rows. Recognized (case-insensitive) columns:
        measure / mile / project_mile   (required)
        type / event_type
        text / description / event
        width / width_ft
    Accepts a list of dicts, a csv.DictReader, or a pandas DataFrame
    (call .to_dict('records') first or pass the DataFrame to from_dataframe()).
    """
    events: list[Event] = []
    for raw in rows:
        row = { (k or "").strip().lower(): v for k, v in raw.items() }
        measure = row.get("measure") or row.get("mile") or row.get("project_mile")
        if measure in (None, ""):
            continue
        measure = float(measure)
        etype = (row.get("type") or row.get("event_type") or "note")
        etype = str(etype).strip().lower()
        text_blob = str(
            row.get("text") or row.get("description") or row.get("event") or ""
        ).strip()
        width = row.get("width") or row.get("width_ft")
        width = float(width) if width not in (None, "") else None
        begins, ends = _parse_operations(text_blob)
        ev = Event(measure, etype, text_blob, width, begins, ends)
        if "side road" in etype or "side_road" in etype:
            ev.event_type = "side road"
            ev.side_road = _parse_side_road(text_blob)
        events.append(ev)
    events.sort(key=lambda e: e.measure)
    return events


def from_dataframe(df) -> list[Event]:
    """Convenience wrapper for a pandas DataFrame."""
    return parse_table(df.to_dict("records"))


# --------------------------------------------------------------------------- #
# 2. Segment construction (dynamic segmentation of homogeneous spans)
# --------------------------------------------------------------------------- #

def build_segments(events: list[Event]) -> list[dict]:
    """
    Produce one homogeneous segment per span between consecutive events, tagged
    with the set of treatments active over that span (running BEGIN/END state)
    and the controlling cross-section width.
    """
    segs: list[dict] = []
    active: dict[str, str] = {}   # normalized-key -> display phrase
    current_width: Optional[float] = None

    def _key(p: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", p.lower())[:48]

    ordered = sorted(events, key=lambda e: e.measure)
    for idx, ev in enumerate(ordered):
        # apply this station's changes to the running state
        for p in ev.ends:
            active.pop(_key(p), None)
        for p in ev.begins:
            active[_key(p)] = p
        if ev.width_ft is not None:
            current_width = ev.width_ft

        if idx + 1 < len(ordered):
            nxt = ordered[idx + 1]
            if nxt.measure > ev.measure:
                segs.append({
                    "from_measure": ev.measure,
                    "to_measure": nxt.measure,
                    "length_mi": round(nxt.measure - ev.measure, 4),
                    "width_ft": current_width,
                    "active_treatments": sorted(active.values()),
                    "start_event": ev.label(),
                })
    return segs


# --------------------------------------------------------------------------- #
# 3. Geometry acquisition
# --------------------------------------------------------------------------- #

def _http_json(url: str, params: dict) -> dict:
    full = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(full, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.load(resp)


def _merge_paths_to_route(features: list[dict], route_id: str, meta: dict) -> Route:
    """
    Flatten ArcGIS polyline-with-M features into one measure-sorted Route.

    NOTE: in the GDOT layer, M is the COUNTY log-mile -- each county feature of a
    route restarts near M=0. Callers must therefore pass features for ONE county
    (and one direction); see fetch_route_from_gdot. Within that scope a route may
    still arrive as a few contiguous features that share a continuous M, which we
    concatenate. A large XY jump between consecutive M values is flagged as a gap.
    """
    verts: list[tuple[float, float, float]] = []   # (m, lon, lat)
    for f in features:
        geom = f.get("geometry") or {}
        for path in geom.get("paths", []):
            for v in path:
                if len(v) < 3 or v[2] is None:
                    continue
                verts.append((v[2], v[0], v[1]))
    if not verts:
        raise ValueError("No M-aware vertices returned for that route.")
    verts.sort(key=lambda t: t[0])

    measures, lonlat = [], []
    last_m = None
    for m, lon, lat in verts:
        if last_m is not None and abs(m - last_m) < 1e-9:
            continue
        measures.append(m)
        lonlat.append((lon, lat))
        last_m = m

    # gap check: consecutive vertices that are close in M but far in space
    for i in range(1, len(measures)):
        dm = measures[i] - measures[i - 1]
        if dm < 0.25:  # within a quarter mile of measure
            d = _haversine_m(lonlat[i - 1], lonlat[i])
            if d > max(800.0, dm * 1609.34 * 4):  # >800 m or 4x expected
                sys.stderr.write(
                    f"[warn] possible geometry gap near M {measures[i]:.3f} "
                    f"({d:.0f} m jump over {dm:.3f} mi) -- the route may be "
                    f"split or you may be mixing directions/counties.\n")
                break
    return Route(measures=measures, lonlat=lonlat, route_id=route_id, meta=meta)


def fetch_route_from_gdot(
    route_code: str,
    county: Optional[str] = None,
    system_code: Optional[str] = None,
    direction: str = "INC",
    service_url: str = GDOT_ROUTE_LAYER,
) -> Route:
    """
    Pull ONE county's segment of a route from the GDOT statewide LRS network.

    The layer's M is the county log-mile, so to get measures that line up with a
    plan-sheet milepost ('MP x.xxx / <COUNTY>') you must pass the matching COUNTY
    code. ROUTE_CODE alone is reused across all counties, so COUNTY (and usually
    SYSTEM_CODE) are needed to avoid pulling the wrong corridor. DIRECTION
    defaults to 'INC' (the direction increasing milepost is logged in).

    Use find_routes(near=(lon,lat)) to discover the exact ROUTE_CODE / COUNTY /
    SYSTEM_CODE for a project location.
    """
    where = [f"ROUTE_CODE='{route_code}'", f"DIRECTION='{direction}'"]
    if county:
        where.append(f"COUNTY='{county}'")
    else:
        sys.stderr.write("[warn] no --county given; M values will not match a "
                         "county-based plan milepost and multiple corridors may "
                         "merge. Pass the COUNTY code.\n")
    if system_code:
        where.append(f"SYSTEM_CODE='{system_code}'")
    params = {
        "where": " AND ".join(where),
        "outFields": "COUNTY,SYSTEM_CODE,ROUTE_CODE,DIRECTION,FUNCTION_TYPE",
        "returnGeometry": "true",
        "returnM": "true",
        "returnZ": "false",
        "outSR": "4326",
        "f": "json",
    }
    data = _http_json(service_url + "/query", params)
    if "error" in data:
        raise RuntimeError(f"GDOT service error: {data['error']}")
    feats = data.get("features", [])
    if not feats:
        raise ValueError(
            f"No features for ROUTE_CODE={route_code} DIR={direction} "
            f"COUNTY={county}. Try find_routes(near=...) to discover the codes.")
    meta = {k: feats[0]["attributes"].get(k)
            for k in ("COUNTY", "SYSTEM_CODE", "DIRECTION", "FUNCTION_TYPE")}
    rid = f"{route_code}/{direction}" + (f"/C{county}" if county else "")
    return _merge_paths_to_route(feats, rid, meta)


def find_routes(
    county: Optional[str] = None,
    near: Optional[tuple[float, float]] = None,   # (lon, lat)
    radius_m: float = 400.0,
    service_url: str = GDOT_ROUTE_LAYER,
) -> list[dict]:
    """Discover candidate routes by county code or by proximity to a point."""
    params = {
        "outFields": "COUNTY,SYSTEM_CODE,ROUTE_CODE,DIRECTION,FUNCTION_TYPE",
        "returnGeometry": "false",
        "f": "json",
        "resultRecordCount": "200",
    }
    if near is not None:
        lon, lat = near
        params["geometry"] = json.dumps({"x": lon, "y": lat,
                                         "spatialReference": {"wkid": 4326}})
        params["geometryType"] = "esriGeometryPoint"
        params["inSR"] = "4326"
        params["distance"] = str(radius_m)
        params["units"] = "esriSRUnit_Meter"
        params["spatialRel"] = "esriSpatialRelIntersects"
        params["where"] = "1=1"
    elif county is not None:
        params["where"] = f"COUNTY='{county}'"
    else:
        raise ValueError("Provide county or near=(lon,lat).")
    data = _http_json(service_url + "/query", params)
    out, seen = [], set()
    for f in data.get("features", []):
        a = f["attributes"]
        key = (a["ROUTE_CODE"], a.get("DIRECTION"))
        if key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


def load_route_geojson(path: str) -> Route:
    """
    Load a centerline from a local GeoJSON LineString/MultiLineString whose
    coordinates carry a measure as the 3rd ordinate ([lon, lat, M]).
    """
    with open(path) as fh:
        gj = json.load(fh)
    feats = gj["features"] if gj.get("type") == "FeatureCollection" else [gj]
    verts: list[tuple[float, float, float]] = []
    for f in feats:
        geom = f.get("geometry", f)
        gtype = geom["type"]
        coords = geom["coordinates"]
        lines = [coords] if gtype == "LineString" else coords
        for line in lines:
            for v in line:
                if len(v) >= 3:
                    verts.append((v[2], v[0], v[1]))
    if not verts:
        raise ValueError("GeoJSON has no [lon,lat,M] vertices.")
    verts.sort(key=lambda t: t[0])
    return Route([m for m, _, _ in verts],
                 [(lon, lat) for _, lon, lat in verts],
                 route_id=path)


# --------------------------------------------------------------------------- #
# 4. Linear referencing (operates on Route.measures / Route.lonlat)
# --------------------------------------------------------------------------- #

def measure_to_point(route: Route, m: float) -> Optional[tuple[float, float]]:
    """Interpolate (lon, lat) at measure m. None if outside the route extent."""
    ms = route.measures
    if m < ms[0] - 1e-9 or m > ms[-1] + 1e-9:
        return None
    j = bisect.bisect_left(ms, m)
    if j <= 0:
        return route.lonlat[0]
    if j >= len(ms):
        return route.lonlat[-1]
    m0, m1 = ms[j - 1], ms[j]
    (x0, y0), (x1, y1) = route.lonlat[j - 1], route.lonlat[j]
    if m1 == m0:
        return (x0, y0)
    t = (m - m0) / (m1 - m0)
    return (x0 + t * (x1 - x0), y0 + t * (y1 - y0))


def measure_range_to_line(route: Route, m0: float, m1: float
                          ) -> list[tuple[float, float]]:
    """Return the polyline (list of lon,lat) between measures m0 and m1."""
    if m1 < m0:
        m0, m1 = m1, m0
    pts: list[tuple[float, float]] = []
    p0 = measure_to_point(route, m0)
    if p0:
        pts.append(p0)
    for m, ll in zip(route.measures, route.lonlat):
        if m0 < m < m1:
            pts.append(ll)
    p1 = measure_to_point(route, m1)
    if p1:
        pts.append(p1)
    # drop consecutive duplicates
    cleaned = []
    for p in pts:
        if not cleaned or (abs(p[0] - cleaned[-1][0]) > 1e-12
                           or abs(p[1] - cleaned[-1][1]) > 1e-12):
            cleaned.append(p)
    return cleaned


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    R = 6371000.0
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def point_to_measure(route: Route, lon: float, lat: float
                     ) -> tuple[float, float]:
    """
    Reverse lookup: nearest point on the centerline -> (measure, distance_m).
    Used for auto-calibration from a known coordinate.
    """
    best_m, best_d = route.measures[0], float("inf")
    pt = (lon, lat)
    for i in range(len(route.measures) - 1):
        a, b = route.lonlat[i], route.lonlat[i + 1]
        # planar projection in local degrees scaled by cos(lat) is good enough
        clat = math.cos(math.radians(lat))
        ax, ay = (a[0] - lon) * clat, a[1] - lat
        bx, by = (b[0] - lon) * clat, b[1] - lat
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        t = 0.0 if seg2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / seg2))
        projx, projy = ax + t * dx, ay + t * dy
        d = math.hypot(projx, projy)
        if d < best_d:
            best_d = d
            best_m = route.measures[i] + t * (route.measures[i + 1] - route.measures[i])
    # convert the tiny planar distance back to meters via a sample
    p = measure_to_point(route, best_m) or (lon, lat)
    return best_m, _haversine_m(p, pt)


# --------------------------------------------------------------------------- #
# Calibration
# --------------------------------------------------------------------------- #

@dataclass
class Calibration:
    scale: float = 1.0
    offset: float = 0.0

    def to_route(self, project_m: float) -> float:
        return self.scale * project_m + self.offset

    @staticmethod
    def from_two_points(p1: float, m1: float, p2: float, m2: float) -> "Calibration":
        if p2 == p1:
            raise ValueError("Calibration project miles must differ.")
        scale = (m2 - m1) / (p2 - p1)
        offset = m1 - scale * p1
        return Calibration(scale, offset)


# --------------------------------------------------------------------------- #
# 5. Output
# --------------------------------------------------------------------------- #

def build_geojson(events: list[Event], segments: list[dict],
                  route: Route, cal: Calibration,
                  include_route: bool = True) -> dict:
    feats: list[dict] = []

    for ev in events:
        rm = cal.to_route(ev.measure)
        pt = measure_to_point(route, rm)
        if pt is None:
            continue
        props = {
            "project_mile": ev.measure,
            "route_measure": round(rm, 5),
            "type": ev.event_type,
            "label": ev.label(),
            "text": ev.text,
            "width_ft": ev.width_ft,
            "begins": ev.begins,
            "ends": ev.ends,
        }
        if ev.side_road:
            props.update({f"side_road_{k}": v for k, v in ev.side_road.items()})
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(pt[0], 7),
                                                          round(pt[1], 7)]},
            "properties": props,
        })

    for sg in segments:
        line = measure_range_to_line(route,
                                     cal.to_route(sg["from_measure"]),
                                     cal.to_route(sg["to_measure"]))
        if len(line) < 2:
            continue
        feats.append({
            "type": "Feature",
            "geometry": {"type": "LineString",
                         "coordinates": [[round(x, 7), round(y, 7)] for x, y in line]},
            "properties": {
                "kind": "segment",
                "from_mile": sg["from_measure"],
                "to_mile": sg["to_measure"],
                "length_mi": sg["length_mi"],
                "width_ft": sg["width_ft"],
                "active_treatments": sg["active_treatments"],
                "start_event": sg["start_event"],
            },
        })

    if include_route and events:
        lo = cal.to_route(min(e.measure for e in events))
        hi = cal.to_route(max(e.measure for e in events))
        full = measure_range_to_line(route, lo, hi)
        if len(full) >= 2:
            feats.append({
                "type": "Feature",
                "geometry": {"type": "LineString",
                             "coordinates": [[round(x, 7), round(y, 7)] for x, y in full]},
                "properties": {"kind": "route", "route_id": route.route_id,
                               "from_mile": round(lo, 4), "to_mile": round(hi, 4),
                               **route.meta},
            })

    return {"type": "FeatureCollection",
            "features": feats,
            "metadata": {"route_id": route.route_id,
                         "route_m_range": route.m_range(),
                         "calibration": asdict(cal),
                         "event_count": len(events),
                         "segment_count": len(segments)}}


def waypoints_to_csv(events: list[Event], route: Route,
                     cal: Calibration, path: str) -> None:
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["project_mile", "route_measure", "type", "label",
                    "lat", "lon", "width_ft", "text"])
        for ev in events:
            rm = cal.to_route(ev.measure)
            pt = measure_to_point(route, rm)
            if pt is None:
                w.writerow([ev.measure, round(rm, 5), ev.event_type,
                            ev.label(), "", "", ev.width_ft, ev.text])
            else:
                w.writerow([ev.measure, round(rm, 5), ev.event_type, ev.label(),
                            round(pt[1], 7), round(pt[0], 7), ev.width_ft, ev.text])


# --------------------------------------------------------------------------- #
# Plan-sheet (PDF) ingestion + automatic route resolution
# --------------------------------------------------------------------------- #
#
# A GDOT plan/contract PDF is authoritative for the road identity in a way the
# roadway log alone is NOT: the log gives mileposts and side-road names but never
# names the route, so resolving it from the log requires guessing among every
# corridor in the county. The plan cover sheet states the State Route number, the
# county, and a project MID-POINT COORDINATE -- enough to pin the exact route.
#
# Caveat learned the hard way: the plan may label the mid-point zone "WEST ZONE"
# even when the coordinate is actually in the Georgia EAST state-plane zone. So we
# never trust the label; we reproject under several candidate CRSs and keep the
# one whose reprojected point sits on a route whose code matches the parsed SR
# number. That cross-check validates the CRS and the route simultaneously.

# Georgia state-plane candidates tried for the plan mid-point (EPSG codes).
_GA_CRS_CANDIDATES = [
    ("NAD83 GA-East ftUS", 2239),
    ("NAD83 GA-West ftUS", 2240),
    ("NAD83(2011) GA-East ftUS", 6445),
    ("NAD83(2011) GA-West ftUS", 6446),
    ("NAD27 GA-East ftUS", 26766),
    ("NAD27 GA-West ftUS", 26767),
    ("NAD83 GA-East m", 26966),
    ("NAD83 GA-West m", 26967),
]


@dataclass
class PlanInfo:
    route_number: Optional[str] = None      # e.g. "11" from "STATE ROUTE 11"
    route_kind: str = "SR"                  # SR / US / I (best guess)
    county_number: Optional[str] = None     # GDOT/FIPS county code, e.g. "101"
    county_name: Optional[str] = None
    midpoint_en: Optional[tuple[float, float]] = None    # (easting, northing)
    midpoint_zone_label: Optional[str] = None
    gross_length_mi: Optional[float] = None
    pi_number: Optional[str] = None

    def expected_route_code(self) -> Optional[str]:
        """GDOT ROUTE_CODE convention: signed route number * 100, zero-padded 8."""
        if not self.route_number or not self.route_number.isdigit():
            return None
        return f"{int(self.route_number) * 100:08d}"


def parse_plan_pdf(path: str) -> tuple[PlanInfo, list[Event]]:
    """
    Extract route/county/mid-point metadata AND the roadway-log events from a
    GDOT plan or contract PDF. Requires `pdfplumber` (pip install pdfplumber).
    """
    try:
        import pdfplumber
    except ImportError as e:
        raise SystemExit("Reading plan PDFs needs pdfplumber: "
                         "pip install pdfplumber") from e

    info = PlanInfo()
    events: list[Event] = []
    with pdfplumber.open(path) as pdf:
        full = "\n".join((p.extract_text() or "") for p in pdf.pages)

        m = re.search(r"STATE ROUTE\s+(\w+)", full, re.I)
        if m:
            info.route_number, info.route_kind = m.group(1), "SR"
        else:
            m = re.search(r"\b(SR|US|I)[\s-]*0*(\d+)\b", full)
            if m:
                info.route_kind, info.route_number = m.group(1).upper(), m.group(2)

        m = re.search(r"COUNTY NO\.?\s*(\d+)", full, re.I)
        if m:
            info.county_number = m.group(1).zfill(3)
        m = re.search(r"([A-Z][A-Z ]+?)\s+IS COUNTY NO", full)
        if m:
            info.county_name = m.group(1).title().strip()

        m = re.search(r"MID-?POINT COORDINATES.*?\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)"
                      r"\s*([A-Z]+\s*ZONE)?", full, re.I | re.S)
        if m:
            info.midpoint_en = (float(m.group(1)), float(m.group(2)))
            info.midpoint_zone_label = (m.group(3) or "").strip() or None

        m = re.search(r"GROSS LENGTH OF PROJECT\s+([\d.]+)", full, re.I)
        if m:
            info.gross_length_mi = float(m.group(1))
        m = re.search(r"P\.?\s*I\.?\s*NO\.?:?\s*([A-Z0-9]+)", full)
        if m:
            info.pi_number = m.group(1)

        # roadway log: the table whose header has LOG and whose rows are miles
        for p in pdf.pages:
            tbls = p.extract_tables() or []
            for tb in tbls:
                flat = " ".join((c or "") for row in tb for c in row).upper()
                if "LOG" in flat and "BEGIN PROJECT" in flat:
                    events = _events_from_log_table(tb)
                    break
            if events:
                break

    return info, events


def _events_from_log_table(table: list[list]) -> list[Event]:
    """Turn an extracted LOG/description/WIDTH table into Event objects."""
    events: list[Event] = []
    for row in table:
        if not row:
            continue
        mile_raw = (row[0] or "").strip().lstrip(".")     # ".0.019" -> "0.019"
        if not re.match(r"^\d+(\.\d+)?$", mile_raw):
            continue
        measure = float(mile_raw)
        desc = (row[1] or "").replace("\n", " ").strip() if len(row) > 1 else ""
        width = None
        if len(row) > 2 and row[2]:
            wm = re.search(r"(\d+(?:\.\d+)?)", row[2])
            if wm:
                width = float(wm.group(1))

        etype = _classify_log_row(desc)
        begins, ends = _parse_operations(desc)
        ev = Event(measure, etype, desc, width, begins, ends)
        if etype == "side road":
            ev.side_road = _parse_side_road(desc)
        events.append(ev)
    events.sort(key=lambda e: e.measure)
    return events


def _classify_log_row(desc: str) -> str:
    u = desc.upper()
    if "BEGIN PROJECT" in u:
        return "project start"
    if "END PROJECT" in u:
        return "project end"
    if "WIDTH CHANGE" in u:
        return "width change"
    if "REFERENCE ONLY" in u:
        return "reference"
    if re.search(r"\b(END|BEGIN)\b.*\b(MILLING|INTERLAYER|RESURFAC|SHOULDER)", u):
        return "operation change"
    if re.search(r"\bROAD\b|\bRD\b|\bSTREET\b|\bDRIVE\b", u) and ("," in desc):
        return "side road"
    return "note"


def reproject_midpoint(en: tuple[float, float], epsg: int) -> tuple[float, float]:
    """(easting, northing) in `epsg` -> (lon, lat) WGS84. Needs pyproj."""
    try:
        from pyproj import Transformer
    except ImportError as e:
        raise SystemExit("Resolving a route from a plan mid-point needs pyproj: "
                         "pip install pyproj") from e
    t = Transformer.from_crs(epsg, 4326, always_xy=True)
    return t.transform(en[0], en[1])


def resolve_route_from_plan(
    info: PlanInfo, service_url: str = GDOT_ROUTE_LAYER
) -> tuple[Route, "Calibration", dict]:
    """
    Use the plan's route number + mid-point to fetch the correct GDOT route and a
    mid-point-anchored calibration. Returns (route, calibration, diagnostics).
    """
    expected = info.expected_route_code()
    if not info.midpoint_en:
        raise SystemExit("Plan has no mid-point coordinate to resolve the route.")

    best = None
    for label, epsg in _GA_CRS_CANDIDATES:
        try:
            lon, lat = reproject_midpoint(info.midpoint_en, epsg)
        except SystemExit:
            raise
        except Exception:
            continue
        if not (-86 < lon < -80 and 30 < lat < 35.5):   # inside Georgia-ish
            continue
        try:
            cands = find_routes(near=(lon, lat), radius_m=200,
                                service_url=service_url)
        except Exception:
            continue
        match = None
        if expected:
            match = next((c for c in cands if c["ROUTE_CODE"] == expected), None)
        if match is None and cands:
            # no code match under this CRS; remember nothing
            continue
        if match:
            best = (label, epsg, lon, lat, match)
            break

    if best is None:
        raise SystemExit(
            f"Could not place the plan mid-point {info.midpoint_en} on route "
            f"{info.route_kind} {info.route_number} (expected code {expected}). "
            f"Try --find-near after reprojecting manually.")

    label, epsg, lon, lat, match = best
    route = fetch_route_from_gdot(
        match["ROUTE_CODE"], county=match["COUNTY"],
        system_code=match["SYSTEM_CODE"], direction=match["DIRECTION"],
        service_url=service_url)

    m_mid, dist = point_to_measure(route, lon, lat)
    # The mid-point is a single, slightly-rounded tie-point, so use it to VALIDATE
    # alignment, not as a hard anchor. If plan MP and route M already agree within
    # tolerance (the usual case when the project starts at a route terminus / state
    # line), use offset 0 -- otherwise a tiny negative offset would clip the start
    # below the route's M=0. Only adopt a real offset when the project is genuinely
    # mid-route (mid-point measure far from gross/2).
    MID_TOL_MI = 0.10
    raw_offset = 0.0
    residual = m_mid
    if info.gross_length_mi:
        raw_offset = m_mid - info.gross_length_mi / 2.0
        residual = raw_offset
    offset = 0.0 if abs(raw_offset) <= MID_TOL_MI else raw_offset
    cal = Calibration(scale=1.0, offset=offset)

    diag = {
        "crs": f"{label} (EPSG:{epsg})",
        "midpoint_lonlat": (round(lon, 6), round(lat, 6)),
        "route_code": match["ROUTE_CODE"],
        "system_code": match["SYSTEM_CODE"],
        "county": match["COUNTY"],
        "m_at_midpoint": round(m_mid, 4),
        "offcenter_m": round(dist, 1),
        "midpoint_residual_mi": round(residual, 4),
        "calibration_offset_mi": round(cal.offset, 4),
    }
    return route, cal, diag


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _read_input(args) -> list[Event]:
    if args.csv:
        with open(args.csv, newline="") as fh:
            return parse_table(csv.DictReader(fh))
    text = open(args.input).read() if args.input else sys.stdin.read()
    return parse_raw_log(text)


def _resolve_route(args) -> Route:
    if args.geojson:
        return load_route_geojson(args.geojson)
    if not args.route_code:
        raise SystemExit("Provide --route-code (GDOT ROUTE_CODE) or --geojson, "
                         "or use --find-county / --find-near to discover one.")
    return fetch_route_from_gdot(
        args.route_code, county=args.county,
        system_code=args.system_code, direction=args.direction,
        service_url=args.service_url)


def _resolve_calibration(args, route: Route) -> Calibration:
    if args.calibrate:
        (p1, m1), (p2, m2) = args.calibrate
        return Calibration.from_two_points(p1, m1, p2, m2)
    if args.snap_start:
        lon, lat = args.snap_start
        rm, dist = point_to_measure(route, lon, lat)
        sys.stderr.write(f"[snap] start coord -> route M {rm:.4f} "
                         f"({dist:.0f} m from centerline)\n")
        return Calibration(1.0, rm)   # assumes project mile 0 == that coord
    if args.offset:
        return Calibration(1.0, args.offset)
    sys.stderr.write("[warn] no calibration given; assuming project mile == "
                     "route LRS measure (offset 0).\n")
    return Calibration()


def _pair(s: str) -> tuple[float, float]:
    a, b = s.split(":")
    return float(a), float(b)


def _lonlat(s: str) -> tuple[float, float]:
    a, b = s.split(",")
    return float(a), float(b)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_argument_group("input")
    src.add_argument("--plan", help="GDOT plan/contract PDF: auto-extract the log, "
                     "resolve the route, and calibrate from the mid-point")
    src.add_argument("--input", help="path to raw log text (default: stdin)")
    src.add_argument("--csv", help="path to a CSV table instead of raw text")

    geo = ap.add_argument_group("route geometry")
    geo.add_argument("--route-code", help="GDOT ROUTE_CODE, e.g. 00000100")
    geo.add_argument("--county", help="GDOT COUNTY code to disambiguate")
    geo.add_argument("--system-code", dest="system_code")
    geo.add_argument("--direction")
    geo.add_argument("--geojson", help="local centerline GeoJSON with [lon,lat,M]")
    geo.add_argument("--service-url", default=GDOT_ROUTE_LAYER)

    disc = ap.add_argument_group("route discovery (prints candidates, exits)")
    disc.add_argument("--find-county", help="list routes in a COUNTY code")
    disc.add_argument("--find-near", type=_lonlat, metavar="LON,LAT",
                      help="list routes near a coordinate")

    cal = ap.add_argument_group("calibration (project mile -> route measure)")
    cal.add_argument("--offset", type=float, default=0.0)
    cal.add_argument("--calibrate", nargs=2, type=_pair, metavar="P:M",
                     help="two known project:route pairs, e.g. 0:5.2 5.5:10.7")
    cal.add_argument("--snap-start", type=_lonlat, metavar="LON,LAT",
                     help="derive offset by snapping the project-start coord")

    out = ap.add_argument_group("output")
    out.add_argument("--out", default="roadway_waypoints.geojson")
    out.add_argument("--csv-out", help="also write a waypoint CSV")
    out.add_argument("--no-route", action="store_true",
                     help="omit the full-route line feature")

    args = ap.parse_args(argv)

    if args.find_county or args.find_near:
        cands = find_routes(county=args.find_county, near=args.find_near,
                            service_url=args.service_url)
        for c in cands:
            print(f"ROUTE_CODE={c['ROUTE_CODE']}  SYS={c['SYSTEM_CODE']}  "
                  f"DIR={c['DIRECTION']}  COUNTY={c['COUNTY']}  "
                  f"{c.get('FUNCTION_TYPE','')}")
        if not cands:
            print("(no candidates)")
        return 0

    if args.plan:
        info, events = parse_plan_pdf(args.plan)
        sys.stderr.write(
            f"[plan] {info.route_kind} {info.route_number}, "
            f"{info.county_name or info.county_number} Co, PI {info.pi_number}, "
            f"{len(events)} log events, gross {info.gross_length_mi} mi\n")
        if not events:
            raise SystemExit("No roadway-log table found in the plan PDF.")
        segments = build_segments(events)
        route, calib, diag = resolve_route_from_plan(info, service_url=args.service_url)
        sys.stderr.write(f"[plan] resolved route via {diag['crs']}: code "
                         f"{diag['route_code']} sys {diag['system_code']} "
                         f"county {diag['county']}; mid-point {diag['offcenter_m']} m "
                         f"off centerline at M {diag['m_at_midpoint']}; "
                         f"offset {diag['calibration_offset_mi']} mi\n")
    else:
        events = _read_input(args)
        if not events:
            raise SystemExit("No events parsed from input.")
        segments = build_segments(events)
        route = _resolve_route(args)
        calib = _resolve_calibration(args, route)

    gj = build_geojson(events, segments, route, calib,
                       include_route=not args.no_route)
    with open(args.out, "w") as fh:
        json.dump(gj, fh, indent=2)
    sys.stderr.write(f"[ok] {len(events)} events, {len(segments)} segments -> "
                     f"{args.out}\n")
    if args.csv_out:
        waypoints_to_csv(events, route, calib, args.csv_out)
        sys.stderr.write(f"[ok] waypoint CSV -> {args.csv_out}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())