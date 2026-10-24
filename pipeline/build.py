"""Build map data from world/ sources into public/data/.

    python pipeline/build.py            # full build
    python pipeline/build.py --check    # validate sources only
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import shapely
from shapely import affinity
from scipy import ndimage
from shapely.geometry import LineString, MultiLineString, Point, mapping
from shapely.ops import nearest_points

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas import buildings, coast, landcover, relief, streets  # noqa: E402
from atlas.cache import CACHE_DIR, stage  # noqa: E402
from atlas.dem_tiles import write_dem_tiles  # noqa: E402
from atlas.divisions import partition, pole_of_inaccessibility  # noqa: E402
from atlas.grid import Frame, Grid, block_reduce, chaikin, line_length_km, polyline_distance  # noqa: E402
from atlas.hydro import Drainage  # noqa: E402
from atlas.noise import value_noise  # noqa: E402
from atlas.terrain import drainage_surface, elevation, land_mask  # noqa: E402
from atlas.network import ROAD_RANK, build_graph  # noqa: E402
from atlas.transport import Router  # noqa: E402
from atlas.vectorize import point_lonlat, polygonize_labels, to_lonlat  # noqa: E402
from atlas.world import FACILITY_LAYOUTS, ROOT, World  # noqa: E402

OUT = ROOT / "public" / "data"
B32 = "0123456789abcdefghjkmnpqrstvwxyz"
# Road networks whose cards list the districts they pass through.
SEGMENTED_NETWORKS = {"national_expressway", "national_highway", "territorial_expressway", "territorial_highway"}
# Bays and fjords this large (real km²) and capes this prominent (real km) are labelled from lower zooms.
MAJOR_LANDFORM_KM2 = 200
MAJOR_CAPE_KM = 12
MAJOR_PEAK_PROMINENCE_M = 450

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def derived_id(prefix: str, key: str) -> str:
    """Stable id for generator-derived entities, so rebuilds never change them."""
    h = int(hashlib.sha1(key.encode()).hexdigest(), 16)
    return prefix + "_" + "".join(B32[(h >> (5 * i)) & 31] for i in range(6))


def short_name(names: dict) -> dict:
    zh = names["zh"]
    for suf in ("行政区", "大区", "区"):
        if zh.endswith(suf) and len(zh) > len(suf):
            zh = zh[: -len(suf)]
            break
    en = names["en"]
    for suf in (" Administrative District", " District", " Region"):
        if en.endswith(suf):
            en = en[: -len(suf)]
            break
    return {"zh": zh, "en": en}


def feature(geom, props):
    head = {"type": "Feature", "id": props["id"]} if props.get("id") else {"type": "Feature"}
    return {**head, "properties": props, "geometry": mapping(geom)}


STREET_MINZOOM = {"arterial": 10, "collector": 11, "local": 12}
BUILDING_MINZOOM = 12


def tile_minzoom(f: dict, z: int) -> dict:
    """Keep the feature out of vector tiles below zoom `z` (read by tippecanoe, ignored by MapLibre)."""
    f["tippecanoe"] = {"minzoom": z}
    return f


def write_geojson(name, features):
    with open(OUT / name, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, ensure_ascii=False, separators=(",", ":"))


def bbox_lonlat(geom):
    b = geom.bounds
    return [round(b[0], 5), round(b[1], 5), round(b[2], 5), round(b[3], 5)]


def smooth_line(pts: np.ndarray, simplify_km: float, iterations: int) -> LineString:
    """Remove grid staircase first, then round the corners."""
    coarse = np.array(LineString(pts).simplify(simplify_km).coords)
    return LineString(chaikin(coarse, iterations))


def owned_runs(path: list[int], ref: str, owner: dict[int, str]) -> list[list[int]]:
    """Split a route path into the stretches it owns; stretches owned by earlier routes carry only their name.

    Each run keeps one cell of the shared corridor at either end so it still meets the junction.
    """
    runs, cur = [], []
    for i, c in enumerate(path):
        if owner.get(c, ref) == ref:
            if not cur and i > 0:
                cur.append(path[i - 1])
            cur.append(c)
        elif cur:
            cur.append(c)
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    runs = [run for run in runs if len(run) >= 3]
    return runs or [path]


def check_expectations(expect: dict, entities: dict):
    """Report whether the generated geography matches the facts the setting requires."""
    def report(ok: bool, what: str):
        log(f"  {'ok  ' if ok else 'FAIL'} {what}")

    if "longest_river" in expect:
        rivers = {eid: e["stats"]["length_km"] for eid, e in entities.items()
                  if e.get("subtype") == "river" and e.get("stats", {}).get("length_km")}
        want = expect["longest_river"]
        top = max(rivers, key=rivers.get) if rivers else None
        detail = ", ".join(f"{entities[k]['names']['zh']} {v:.0f} km" for k, v in sorted(rivers.items(), key=lambda kv: -kv[1]))
        report(top == want, f"longest river is {entities[want]['names']['zh']} ({detail})")
    if "largest_cities_by_area" in expect:
        want = expect["largest_cities_by_area"]
        cities = sorted((e for e in entities.values() if e.get("subtype") == "locality" and e.get("stats")),
                        key=lambda e: -e["stats"]["area_km2_mapped"])
        got = [e["id"] for e in cities[: len(want)]]
        detail = ", ".join(f"{e['names']['zh']} {e['stats']['area_km2_mapped']:.0f} km²" for e in cities[: len(want) + 1])
        report(got == want, f"largest cities by area ({detail})")


def route_segments(path: list[int], router: Router, dist_r: np.ndarray, factor: int, frame: Frame,
                   district_ids: list[str], min_km=2.0) -> list[dict]:
    """Ordered district-by-district breakdown of a route: chainage, length, extent and line of each stretch."""
    nx = router.nx
    cells = [divmod(c, nx) for c in path]
    labels = [int(dist_r[min(cy * factor + factor // 2, dist_r.shape[0] - 1), min(cx * factor + factor // 2, dist_r.shape[1] - 1)])
              for cy, cx in cells]
    for i, v in enumerate(labels):  # bridges and lake crossings take the district they come from
        if v < 0:
            labels[i] = labels[i - 1] if i else next((w for w in labels if w >= 0), -1)
    step = [0.0] + [frame.km(router.res * math.hypot(a[0] - b[0], a[1] - b[1])) for a, b in zip(cells[:-1], cells[1:])]
    runs: list[list] = []  # [label, first index, last index]
    for i, v in enumerate(labels):
        if runs and runs[-1][0] == v:
            runs[-1][2] = i
        else:
            runs.append([v, i, i])

    def run_km(run):
        return sum(step[run[1] + 1: run[2] + 1]) + (step[run[2] + 1] if run[2] + 1 < len(step) else 0)

    merged = True
    while merged and len(runs) > 1:
        merged = False
        k = min(range(len(runs)), key=lambda j: run_km(runs[j]))
        if run_km(runs[k]) >= min_km:
            break
        left, right = (runs[k - 1] if k > 0 else None), (runs[k + 1] if k + 1 < len(runs) else None)
        into = left if right is None or (left is not None and run_km(left) >= run_km(right)) else right
        into[1], into[2] = min(into[1], runs[k][1]), max(into[2], runs[k][2])
        del runs[k]
        out: list[list] = []
        for run in runs:
            if out and out[-1][0] == run[0]:
                out[-1][2] = run[2]
            else:
                out.append(run)
        runs, merged = out, True

    segments, chainage = [], 0.0
    for v, i0, i1 in runs:
        pts = np.array([router.xy(c) for c in path[i0: min(i1 + 2, len(path))]])
        line = smooth_line(pts, 0.7, 2) if len(pts) > 2 else LineString(pts)
        geom = to_lonlat(line, frame)
        km = run_km([v, i0, i1])
        segments.append({
            "division": district_ids[v] if v >= 0 else None,
            "from_km": round(chainage, 1),
            "km": round(km, 1),
            "bbox": bbox_lonlat(geom),
            "line": [[round(x, 4), round(y, 4)] for x, y in geom.coords],
        })
        chainage += km
    return segments


def district_directions(layout: dict, districts: list[dict], district_city: list[int]) -> dict[str, list[float]]:
    """layout.districts, with a direction filled in for districts that have none (e.g. just imported):
    the middle of the widest gap between their siblings' directions."""
    dirs = {k: list(v) for k, v in layout.get("districts", {}).items()}
    for ci in sorted(set(district_city)):
        sib = [d["id"] for d, c in zip(districts, district_city) if c == ci]
        known = [math.atan2(dirs[s][1], dirs[s][0]) for s in sib if s in dirs]
        for s in sib:
            if s in dirs:
                continue
            if len(sib) == 1:
                dirs[s] = [0.0, 0.0]
                continue
            if not known:
                ang = 0.0
            else:
                ks = sorted(known)
                gaps = [((ks[(i + 1) % len(ks)] - a) % (2 * math.pi) or 2 * math.pi, a) for i, a in enumerate(ks)]
                width, start = max(gaps)
                ang = start + width / 2
            dirs[s] = [round(0.7 * math.cos(ang), 2), round(0.7 * math.sin(ang), 2)]
            known.append(ang)
            log(f"  {s}: no layout direction, placed at {dirs[s]} (add it to layout.districts to fix)")
    return dirs


def block_upsample(a: np.ndarray, shape) -> np.ndarray:
    f = shape[0] // a.shape[0]
    return np.repeat(np.repeat(a, f, axis=0), f, axis=1)[: shape[0], : shape[1]]


def detect_landforms(world: World, spec: dict, drain: Drainage, land_c: np.ndarray, gc: Grid, frame: Frame,
                     named_rivers: list, dist_r: np.ndarray, g: Grid, districts: list[dict], extra: list[dict]):
    """Find coastal landforms and river mouths, and pair them (and the extra candidates, e.g. peaks)
    with the named entries in world/features.

    Returns ({"matched": [(candidate, feature)], "rivers": [(feature, line, drainage, stem)]}, report);
    the report lists every candidate, named or not, for the naming workflow.
    """
    cp, hp = spec.get("coast", {}), spec["hydrology"]
    args = (land_c, gc.xs, gc.ys, gc.res)
    island_min = cp.get("island_min_km2", 0.8)
    cands = (coast.islands(*args, island_min)
             + coast.bays(*args, cp.get("bay_close_km", 5), cp.get("bay_min_km2", 15))
             + coast.capes(*args, cp.get("cape_open_km", 2.5), cp.get("cape_min_prominence_km", 2.5))
             + coast.straits(*args, cp.get("strait_max_gap_km", 4), island_min)
             + extra)
    landf = land_c.ravel()

    def mouth_of(stem):
        return stem[-1] if landf[stem[-1]] else stem[-2]

    named_mouths = {mouth_of(stem) for *_, stem in named_rivers}
    river_min, estuary_min = hp.get("river_candidate_km2", 150), hp.get("estuary_km2", 600)
    for stem, acc in drain.outlets(min(river_min, estuary_min)):
        my, mx = divmod(mouth_of(stem), gc.nx)
        at = (float(gc.xs[mx]), float(gc.ys[my]))
        if acc >= estuary_min:
            cands.append({"kind": "estuary", "at": at, "metrics": {"drainage_km2": acc}})
        if acc >= river_min and mouth_of(stem) not in named_mouths:
            cy, cx = np.divmod(np.array(stem), gc.nx)
            length = line_length_km(np.column_stack([gc.xs[cx], gc.ys[cy]]))
            cands.append({"kind": "river", "at": at, "stem": stem, "metrics": {"drainage_km2": acc, "length_km": length}})

    entries = [f for f in world.features.values() if f.get("detect")]
    pairs = coast.match(cands, entries, cp.get("match_radius_km", 10))
    matched, rivers = [], []
    for ei, ci in pairs.items():
        c, fe = cands[ci], entries[ei]
        if c["kind"] == "river":
            cy, cx = np.divmod(np.array(c["stem"]), gc.nx)
            rivers.append((fe, smooth_line(np.column_stack([gc.xs[cx], gc.ys[cy]]), 0.35, 3), c["metrics"]["drainage_km2"], c["stem"]))
        else:
            matched.append((c, fe))
    for ei, fe in enumerate(entries):
        if ei not in pairs:
            log(f"  WARN {fe['id']} {fe['names']['zh']}: no {fe['detect']['kind']} found near {fe['detect']['at_km']}")

    _, (ny_, nx_) = ndimage.distance_transform_edt(dist_r < 0, return_indices=True)
    by_candidate = {ci: entries[ei]["id"] for ei, ci in pairs.items()}
    report, unnamed = [], {}
    for ci, c in enumerate(cands):
        iy, ix = g.index_of(*c["at"])
        d = districts[dist_r[ny_[iy, ix], nx_[iy, ix]]]
        c["district"] = d["id"]
        metrics = {}
        for k, v in c["metrics"].items():
            metrics[k] = round(frame.km2(v) if k.endswith("km2") else frame.km(v) if k.endswith("_km") else v, 1)
        report.append({"kind": c["kind"], "at_km": [round(c["at"][0], 1), round(c["at"][1], 1)], "named": by_candidate.get(ci),
                       "district": d["names"]["zh"], "district_id": d["id"], "metrics": metrics})
        if ci not in by_candidate:
            unnamed[c["kind"]] = unnamed.get(c["kind"], 0) + 1
    log(f"  {len(pairs)}/{len(cands)} landforms named" + (f"; unnamed: {unnamed}" if unnamed else ""))
    return {"matched": matched, "rivers": rivers}, report


def lake_raster(g: Grid, center, radius, land):
    cx, cy = center
    ang = np.arctan2(g.Y - cy, g.X - cx)
    rr = radius * (1 + 0.28 * np.sin(3 * ang + 1) + 0.14 * np.sin(5 * ang + 2))
    return (np.hypot(g.X - cx, g.Y - cy) < rr) & land


def street_place_stems(world: World, cities: list[dict], skip: str) -> list[dict]:
    """Stems for streets named after the territory's other cities and its named landforms."""
    conlangs = ("art-x-viking", "art-x-buckham")
    out = []
    for c in cities:
        if c["id"] == skip:
            continue
        n = c["names"]
        out.append({"zh": n["zh"].removesuffix("市"), "en": n["en"].removesuffix(" City"),
                    **{k: n[k] for k in conlangs if n.get(k)}})
    for fe in world.features.values():
        if fe["subtype"] in ("bay", "fjord", "peak", "lake", "mountain_range", "island", "cape", "glacier"):
            n = fe["names"]
            out.append({"zh": n["zh"], "en": n["en"], **{k: n[k] for k in conlangs if n.get(k)}})
    return out


def main_axis(poly) -> float:
    """Direction (radians) of the long side of a polygon's minimum rotated rectangle."""
    ring = np.array(poly.minimum_rotated_rectangle.exterior.coords)
    edges = np.diff(ring[:3], axis=0)
    ex, ey = max(edges, key=lambda e: math.hypot(*e))
    return math.atan2(ey, ex)


def landmark_sites(world, d, core, angle, built, land, seed):
    """Site outlines and parts (real km) of the places in district `d` that have a `site`.

    City landmarks follow the street grid `angle`; an explicit site.angle_deg is absolute (east = 0).
    `built` is the district's built-up area (None without streets), `land` the dry land around it."""
    out = []
    for pid, pl in world.places.items():
        if pl["in"] != d["id"] or not pl.get("site"):
            continue
        cfg = pl["site"]
        ox, oy = pl.get("offset_km", (0, 0))
        rng = np.random.default_rng([seed, int(hashlib.sha1(pid.encode()).hexdigest()[:8], 16)])
        size = (cfg["size_m"][0] / 1000, cfg["size_m"][1] / 1000)
        a = math.radians(cfg["angle_deg"]) if "angle_deg" in cfg else angle
        site, parts = buildings.landmark(cfg["layout"], (core[0] + ox, core[1] + oy), a, size, rng, land)
        zh = pl["names"]["zh"]
        if cfg["layout"] == "port":
            if not any(k == "paved" for k, _ in parts) or site.intersection(land).area < 0.25 * size[0] * size[1]:
                log(f"  WARN {zh}: port site does not straddle the coast")
        elif cfg["layout"] in FACILITY_LAYOUTS:
            if site.intersection(land).area < 0.95 * site.area:
                log(f"  WARN {zh}: site runs into water")
        elif built is None or not built.buffer(0.05).contains(site.centroid):
            log(f"  WARN {zh}: site lies outside the built-up area")
        for other, osite, _ in out:
            if site.intersects(osite):
                log(f"  WARN {pl['names']['zh']}: site overlaps {world.places[other]['names']['zh']}")
        out.append((pid, site, parts))
    return out


def build_streets(world, sp, frame, seed, cities, districts, district_city, dist_polys, poles, urban, land, lake_polys, river_lines):
    """Street networks of the cities listed in the generator's `streets` section.

    Returns [(city, [Street] in design km, {district: context in real km}, [landmark site])]."""
    if urban is None:
        return []
    s = frame.scale

    def real(geom):
        return affinity.scale(geom, s, s, origin=(0, 0))

    lakes_r = real(shapely.union_all(lake_polys)) if lake_polys else None
    rivers_r = real(shapely.union_all(river_lines)).buffer(sp.get("river_gap_km", 0.05)) if river_lines else None
    safe_all = real(land) if lakes_r is None else real(land).difference(lakes_r)
    out = []
    for cid in sp["cities"]:
        ci = next(i for i, c in enumerate(cities) if c["id"] == cid)
        namer = streets.Namer(ROOT / "world" / "names" / "streets.yaml", street_place_stems(world, cities, cid))
        city_streets, styles, named, ctx, city_sites = [], {}, {}, {}, []
        for i, d in enumerate(districts):
            if district_city[i] != ci:
                continue
            built = real(dist_polys[i].intersection(urban))
            if lakes_r is not None:
                built = built.difference(lakes_r)
            if built.area < 1.0:
                continue
            cfg = sp.get("districts", {}).get(d["id"], {})
            style = cfg.get("style", "mixed")
            rng = np.random.default_rng([seed, int(hashlib.sha1(d["id"].encode()).hexdigest()[:8], 16)])
            angle = math.radians(cfg["angle_deg"]) if "angle_deg" in cfg else main_axis(built)
            core = (poles[i][0] * s, poles[i][1] * s)
            ds = streets.district_streets(built, core, style, angle, rng, sp, i)
            streets.bend(ds, streets.Field(rng, sp["warp_wavelength_km"]), sp["warp_km"][style])
            sites = landmark_sites(world, d, core, angle, built, safe_all, seed)
            safe = built.buffer(0.05).intersection(safe_all)
            if sites:
                safe = safe.difference(shapely.union_all([site for _, site, _ in sites]).buffer(0.004))
            dry = safe.difference(rivers_r) if rivers_r is not None else safe
            kept, real_lines = [], []
            for st in ds:
                g = streets.keep(st.geom.intersection(dry if st.cls == "local" else safe).simplify(0.004), st.cls)
                if g is not None:
                    real_lines.append((st.cls, g))
                    st.geom = affinity.scale(g, 1 / s, 1 / s, origin=(0, 0))
                    kept.append(st)
            styles[i] = style
            ctx[i] = {"name": d["names"]["zh"], "built": built.intersection(safe_all), "style": style, "angle": angle, "core": core, "lines": real_lines,
                      "radius": math.sqrt(built.area / math.pi)}
            city_sites += [(pid, site, parts, i) for pid, site, parts in sites]
            city_streets += kept
            counts = {c: sum(1 for st in kept if st.cls == c) for c in streets.CLASSES}
            log(f"  {d['names']['zh']} ({style}): {frame.km2(dist_polys[i].intersection(urban).area):.0f} km² built up, "
                + ", ".join(f"{n} {c}" for c, n in counts.items()))
        district_index = {d["id"]: i for i, d in enumerate(districts)}
        for nm in sp.get("named", []):
            if nm["district"] in district_index:
                named[(district_index[nm["district"]], "grid", nm["axis"], nm.get("line", 0))] = nm
        missing = [nm["names"]["zh"] for nm in sp.get("named", []) if nm["district"] in district_index and
                   not any(st.key == (district_index[nm["district"]], "grid", nm["axis"], nm.get("line", 0)) for st in city_streets)]
        for zh in missing:
            log(f"  WARN street {zh}: no arterial at that axis and line")
        rng = np.random.default_rng([seed, 7, ci])
        streets.assign_names(city_streets, namer, styles, rng, named)
        out.append((cities[ci], city_streets, ctx, city_sites))
    return out


def build_buildings(street_out, seed) -> tuple[list, list]:
    """Generated building footprints and parks, [(cls, polygon)] and [polygon] in real km."""
    out, parks = [], []
    for city, _, ctx, sites in street_out:
        taken = buildings.corridors([line for c in ctx.values() for line in c["lines"]])
        if sites:
            taken = taken.union(shapely.union_all([site.buffer(0.01) for _, site, _, _ in sites]))
        for i, c in ctx.items():
            blks = buildings.blocks(c["built"], taken)
            rng = np.random.default_rng([seed, 11, i])
            bl, pk = buildings.district_buildings(blks, c["style"], c["core"], c["angle"], c["radius"], rng)
            out += [(b.cls, b.geom) for b in bl]
            parks += pk
            log(f"  {c['name']}: {len(blks)} blocks, {len(bl)} buildings, {len(pk)} parks")
    return out, parks


CONLANGS = ("art-x-viking", "art-x-buckham")
# Administrative suffixes dropped when a station or line is named after a city, longest first.
CITY_SUFFIXES = {"zh": ("自由贸易区", "市"), "en": (" Free Trade Zone", " City"),
                 "art-x-viking": (" Frei auf Hea", " auf Hea"), "art-x-buckham": (" Libre en Teatu", " en Teatu")}
METRO_COLORS = ("#E4453A", "#2F80ED", "#F2A33A", "#27AE60", "#9B51E0", "#00A3A3", "#EB5E9B", "#8D6E63")


def bare_name(d: dict) -> dict:
    """A city's or district's name without its administrative suffix (维京港市 -> 维京港, 沙洲区 -> 沙洲)."""
    if d["subtype"] == "borough":
        return {**short_name(d["names"]), **{k: d["names"][k] for k in CONLANGS if d["names"].get(k)}}
    out = {}
    for lang, sufs in CITY_SUFFIXES.items():
        v = d["names"].get(lang)
        if v:
            out[lang] = next((v[: -len(s)] for s in sufs if v.endswith(s) and len(v) > len(s)), v)
    return out


def rail_station_names(stem: dict) -> dict:
    out = {"zh": stem["zh"] + "站", "en": f"{stem['en']} Station"}
    if stem.get("art-x-viking"):
        out["art-x-viking"] = f"Bahnhof {stem['art-x-viking']}"
    if stem.get("art-x-buckham"):
        out["art-x-buckham"] = f"Stazione di {stem['art-x-buckham']}"
    return out


def metro_station_names(stem: dict) -> dict:
    """Metro stations take the name of the square, street or landmark above them (人民广场站, People's Square)."""
    zh = stem["zh"] if stem["zh"].endswith("站") else stem["zh"] + "站"
    return {"zh": zh, "en": stem["en"], **{k: stem[k] for k in CONLANGS if stem.get(k)}}


def points_of(geom) -> list:
    out = []
    for g in shapely.get_parts(geom):
        out.append(g if g.geom_type == "Point" else g.representative_point())
    return [p for p in out if not p.is_empty]


def through(line: LineString, p: Point) -> LineString:
    """The line with p inserted as a vertex where it projects, so the line passes through p."""
    t, cs = line.project(p), list(line.coords)
    if t <= 1e-9:
        return LineString([p.coords[0], *cs])
    acc = 0.0
    for q in range(1, len(cs)):
        acc += math.dist(cs[q - 1], cs[q])
        if acc >= t:
            return LineString([*cs[:q], p.coords[0], *cs[q:]])
    return LineString([*cs, p.coords[0]])


def route_railways(world: World, router: Router, poles, stop_index: dict) -> list:
    """Route each railway between its stops, [(railway, stop district indices, path)]. Later lines run on
    the track of earlier ones wherever that is cheaper than new track."""
    out = []
    for r in world.railways.values():
        if not all(v in stop_index for v in r["via"]):
            continue
        stops = [stop_index[v] for v in r["via"]]
        path = []
        for a, b in zip(stops[:-1], stops[1:]):
            leg = router.route(router.cell(*poles[a]), router.cell(*poles[b]), r.get("tunnel_cost", 2.5))
            path += leg if not path else leg[1:]
        router.commit(path, "rail", discount=0.45, ref=r["id"])
        out.append((r, stops, path))
    return out


def build_metro(mp: dict, world: World, seed, s, cities, districts, district_city, dist_polys, poles, urban, land_r,
                street_out, sites, stations: dict, street_cfg: dict) -> list[dict]:
    """City metro lines (real km) and their stations, added to `stations` (design km, shared with rail).

    Each line runs straight along one street-grid axis of a district through its centre (moved by
    at_km), across the built-up area, and on to the places named by from / to. Lines that cross
    share a station, and a line passing a railway station stops there."""
    real = lambda g: affinity.scale(g, s, s, origin=(0, 0))
    spacing = mp.get("spacing_km", 1.2)
    ctx_all = {i: c for _, _, ctx, _ in street_out for i, c in ctx.items()}
    named_streets = {city["id"]: [(st.names, real(st.geom)) for st in sts if st.cls != "local"] for city, sts, _, _ in street_out}
    dist_index = {d["id"]: i for i, d in enumerate(districts)}

    def place_xy(pid):
        pl = world.places[pid]
        i = dist_index[pl["in"]]
        ox, oy = pl.get("offset_km", (0, 0))
        return Point(poles[i][0] * s + ox, poles[i][1] * s + oy)

    out = []
    for system in mp.get("cities", []):
        cid = system["city"]
        ci = next((k for k, c in enumerate(cities) if c["id"] == cid), None)
        if ci is None:
            continue
        namer = streets.Namer(ROOT / "world" / "names" / "streets.yaml", [])
        rng = np.random.default_rng([seed, 13, ci])
        geoms, specs = [], []
        for k, ln in enumerate(system["lines"], 1):
            i = dist_index[ln["district"]]
            built = real(dist_polys[i].intersection(urban)).intersection(land_r)
            cfg = street_cfg.get("districts", {}).get(ln["district"], {})
            if i in ctx_all:
                angle = ctx_all[i]["angle"]
            elif "angle_deg" in cfg:
                angle = math.radians(cfg["angle_deg"])
            else:
                angle = main_axis(max(getattr(built, "geoms", [built]), key=lambda p: p.area))
            angle += ln["axis"] * math.pi / 2
            ox, oy = ln.get("at_km", (0, 0))
            ax, ay = poles[i][0] * s + ox, poles[i][1] * s + oy
            ux, uy = math.cos(angle), math.sin(angle)
            seg = LineString([(ax - 100 * ux, ay - 100 * uy), (ax + 100 * ux, ay + 100 * uy)])
            spans = sorted(sorted((seg.project(Point(p.coords[0])), seg.project(Point(p.coords[-1]))))
                           for p in streets.pieces(seg.intersection(built)))
            if not spans:
                log(f"  WARN metro {cities[ci]['names']['zh']} line {k}: axis misses the built-up area")
                continue
            j = min(range(len(spans)), key=lambda q: 0 if spans[q][0] <= 100 <= spans[q][1] else min(abs(spans[q][0] - 100), abs(spans[q][1] - 100)))
            lo = hi = j
            while lo > 0 and spans[lo][0] - spans[lo - 1][1] < 1.0:
                lo -= 1
            while hi + 1 < len(spans) and spans[hi + 1][0] - spans[hi][1] < 1.0:
                hi += 1
            t0, t1 = spans[lo][0] + 0.3, spans[hi][1] - 0.3
            coords = [seg.interpolate(t0).coords[0], seg.interpolate(t1).coords[0]]
            if "to" in ln:
                p = place_xy(ln["to"])
                if Point(coords[0]).distance(p) < Point(coords[-1]).distance(p):
                    coords.reverse()
                coords.append(p.coords[0])
            if "from" in ln:
                p = place_xy(ln["from"])
                if "to" not in ln and Point(coords[-1]).distance(p) < Point(coords[0]).distance(p):
                    coords.reverse()
                coords.insert(0, p.coords[0])
            geoms.append(LineString(coords))
            specs.append((k, ln, i))

        # stations: railway stations next to a line (the line bends through them), transfers at
        # crossings, then evenly in between
        keyed: dict = {}
        anchors = {a: [] for a in range(len(geoms))}
        for sid, st in stations.items():
            if district_city[st["district"]] != ci:
                continue
            p = Point(st["xy"][0] * s, st["xy"][1] * s)
            for a, g in enumerate(geoms):
                if g.distance(p) < 0.6:
                    keyed[sid] = p
                    geoms[a] = through(g, p)
        rail_keyed = dict(keyed)
        for a in range(len(geoms)):
            for sid, p in rail_keyed.items():
                if geoms[a].distance(p) < 1e-6:
                    anchors[a].append((geoms[a].project(p), sid))
            for b in range(a + 1, len(geoms)):
                for p in points_of(geoms[a].intersection(geoms[b])):
                    if any(p.distance(q) < 0.3 for q in rail_keyed.values()):
                        continue
                    key = ("x", a, b, round(p.x, 3), round(p.y, 3))
                    keyed[key] = p
                    anchors[a].append((geoms[a].project(p), key))
                    anchors[b].append((geoms[b].project(p), key))
        for a, (_, ln, _) in enumerate(specs):
            for end in ("to", "from"):
                if end in ln:
                    key = ("p", ln[end])
                    keyed[key] = place_xy(ln[end])
                    anchors[a].append((geoms[a].project(keyed[key]), key))
        plain = lambda key: isinstance(key, tuple) and key[0] in ("s", "e")
        line_keys = []
        for a, g in enumerate(geoms):
            ts = sorted(anchors[a], key=lambda v: v[0])
            for t in (0.0, g.length):
                if all(abs(t - u) > 0.5 for u, _ in ts):
                    ts.append((t, ("e", a, round(t, 3))))
            ts.sort(key=lambda v: v[0])
            filled = []
            for (t0, k0), (t1, _) in zip(ts[:-1], ts[1:]):
                filled.append((t0, k0))
                n = max(1, round((t1 - t0) / spacing))
                filled += [(t0 + (t1 - t0) * q / n, ("s", a, round(t0, 3), q)) for q in range(1, n)]
            filled.append(ts[-1])
            merged = []
            for t, key in filled:
                if merged and t - merged[-1][0] < 0.45 and (plain(key) or plain(merged[-1][1])):
                    if plain(merged[-1][1]) and not plain(key):
                        merged[-1] = (t, key)
                    continue
                merged.append((t, key))
            for t, key in merged:
                keyed.setdefault(key, g.interpolate(t))
            line_keys.append([key for _, key in merged])

        line_ids = [derived_id("rte", f"metro:{cid}:{k}") for k, _, _ in specs]
        users: dict = {}
        for a, keys in enumerate(line_keys):
            for key in keys:
                users.setdefault(key, []).append(a)
        site_pool = [(pid, poly) for pid, poly, _, i in sites if district_city[i] == ci]
        used = {st["names"]["zh"] for st in stations.values()}
        sid_of = {}
        for key, p in keyed.items():
            if key not in users:
                continue
            if key in stations:
                stations[key]["lines"] += [line_ids[a] for a in users[key]]
                sid_of[key] = key
                continue
            cands = [(-1.0, world.places[key[1]]["names"])] if isinstance(key, tuple) and key[0] == "p" else []
            cands += [(poly.distance(p), world.places[pid]["names"]) for pid, poly in site_pool if poly.distance(p) < 0.3]
            for names, sg in named_streets.get(cid, []):
                for a in users[key]:
                    if sg.buffer(0.05).intersection(geoms[a]).length > 0.4:
                        continue
                    cands += [(q.distance(p) + 0.05, names) for q in points_of(sg.intersection(geoms[a])) if q.distance(p) < 0.3]
            cands.sort(key=lambda c: c[0])
            names = next((metro_station_names(n) for _, n in cands if metro_station_names(n)["zh"] not in used), None)
            for _ in range(80):
                if names is not None:
                    break
                theme = namer.theme("mixed", rng)
                if theme not in ("numbered", "places"):
                    cand = metro_station_names(namer.stem(theme, rng))
                    names = cand if cand["zh"] not in used else None
            used.add(names["zh"])
            sid = derived_id("poi", f"metro:{cid}:{names['zh']}")
            dpt = Point(p.x / s, p.y / s)
            home = next((i for i, dc in enumerate(district_city) if dc == ci and dist_polys[i].contains(dpt)), specs[users[key][0]][2])
            stations[sid] = {"names": names, "xy": (dpt.x, dpt.y), "district": home, "lines": [line_ids[a] for a in users[key]]}
            sid_of[key] = sid

        sysn = system["names"]
        for a, (k, ln, i) in enumerate(specs):
            names = {"zh": f"{sysn['zh']}{k}号线", "en": f"{sysn['en']} Line {k}"}
            if sysn.get("art-x-viking"):
                names["art-x-viking"] = f"{sysn['art-x-viking']} Linie {k}"
            if sysn.get("art-x-buckham"):
                names["art-x-buckham"] = f"{sysn['art-x-buckham']} Linea {k}"
            out.append({"id": line_ids[a], "city": cid, "n": k, "names": names, "geom": geoms[a],
                        "color": ln.get("color", METRO_COLORS[(k - 1) % len(METRO_COLORS)]),
                        "stations": [sid_of[key] for key in line_keys[a]]})
        n_st = len({sid_of[key] for keys in line_keys for key in keys})
        log(f"  {cities[ci]['names']['zh']}: {len(specs)} metro lines, {n_st} stations, "
            f"{sum(g.length for g in geoms):.0f} km")
    return out


def build_region(world: World, spec: dict, entities: dict, layers: dict, graph: dict, use_cache: bool = True):
    seed = spec["seed"]
    frame = Frame(spec["frame"]["origin_lonlat"], spec["frame"]["size_km"], spec["frame"].get("scale", 1.0))
    g = Grid(spec["frame"]["size_km"], spec["frame"]["resolution_km"])
    gc = Grid(spec["frame"]["size_km"], spec["frame"]["resolution_km"] * 2)
    gr = Grid(spec["frame"]["size_km"], spec["frame"]["resolution_km"] * 4)
    layout = spec["layout"]

    territory = world.divisions[spec["territory"]]
    cities = sorted(world.children(territory["id"]), key=lambda d: d["codes"]["admin"])
    districts, district_city = [], []
    for ci, c in enumerate(cities):
        for d in sorted(world.children(c["id"]), key=lambda d: d["codes"]["admin"]):
            districts.append(d)
            district_city.append(ci)
    city_index = {c["id"]: ci for ci, c in enumerate(cities)}
    total_area = sum(c["area_km2"] for c in cities) / frame.km2(1.0)
    dirs = district_directions(layout, districts, district_city)

    def land_and_partition():
        log(f"{territory['names']['en']}: land")
        land = land_mask(spec, seed, g, total_area)
        log("partitioning divisions")
        warp = layout.get("boundary_warp_km", 4)
        wx = g.X + warp * value_noise(seed + 101, 30, 5, 0.5, (g.w, g.h), g.shape)
        wy = g.Y + warp * value_noise(seed + 202, 30, 5, 0.5, (g.w, g.h), g.shape)
        anchors = [layout["cities"][c["id"]] for c in cities]
        city_r, _, land = partition(land, wx, wy, anchors, [c["area_km2"] for c in cities], g.cell)
        dist_r = np.full(g.shape, -1)
        dist_errs = np.zeros(len(districts))
        for ci, c in enumerate(cities):
            idx = [i for i, dc in enumerate(district_city) if dc == ci]
            cmask = city_r == ci
            ax, ay = anchors[ci]
            r = 0.42 * math.sqrt(c["area_km2"]) / frame.km(1.0)
            seeds = [(ax + r * dirs[districts[i]["id"]][0], ay + r * dirs[districts[i]["id"]][1]) for i in idx]
            sub, err, fitted = partition(cmask, wx, wy, seeds, [districts[i]["area_km2"] for i in idx], g.cell, sea=~land)
            land = (land & ~cmask) | fitted
            city_r[cmask & ~fitted] = -1
            city_r[fitted] = ci
            for k, i in enumerate(idx):
                dist_r[sub == k] = i
                dist_errs[i] = err[k]
        return land, city_r, dist_r, dist_errs

    stage_inputs = {"spec": {k: spec.get(k) for k in ("seed", "frame", "land", "layout")}, "dirs": dirs,
                    "areas": [(d["id"], d["area_km2"]) for d in cities + districts]}
    land, city_r, dist_r, dist_errs = stage(f"partition-{territory['id']}", stage_inputs, land_and_partition, use_cache,
                                            modules=("divisions", "terrain", "noise", "grid"))
    log(f"{territory['names']['en']}: terrain")
    city_t = np.array([c["area_km2"] for c in cities], float)
    city_t *= land.sum() * g.cell / city_t.sum()
    city_err = np.abs(np.bincount(city_r[land], minlength=len(cities)) * g.cell - city_t) / city_t
    city_err, dist_err = float(city_err.max()), float(dist_errs.max())
    worst = ", ".join(f"{districts[i]['names']['zh']} {dist_errs[i] * 100:.1f}%" for i in np.argsort(-dist_errs)[:3])
    log(f"  max area deviation: cities {city_err * 100:.2f}%, districts {dist_err * 100:.2f}% ({worst})")
    elev, dcoast = elevation(spec, seed, g, land)

    poles = [pole_of_inaccessibility(dist_r == i, g.xs, g.ys) for i in range(len(districts))]
    city_poles = [pole_of_inaccessibility(city_r == ci, g.xs, g.ys) for ci in range(len(cities))]
    core = [max((i for i, dc in enumerate(district_city) if dc == ci), key=lambda i: districts[i]["population"]) for ci in range(len(cities))]

    lakes = []
    for lk in spec.get("hydrology", {}).get("lakes", []):
        di = next(i for i, d in enumerate(districts) if d["id"] == lk["in"])
        m = lake_raster(g, poles[di], lk["radius_km"], land)
        lakes.append((lk["feature"], m))
        x, y = poles[di]
        poles[di] = (x, y - lk["radius_km"] * 1.6)
    water = np.zeros(g.shape, bool)
    for _, m in lakes:
        water |= m
    log("vectorising boundaries")
    dist_polys = polygonize_labels(dist_r, g.res)
    city_polys = [shapely.union_all([dist_polys[i] for i, dc in enumerate(district_city) if dc == ci]) for ci in range(len(cities))]
    terr_poly = shapely.union_all(city_polys)

    log("hydrology")
    land_c = block_reduce(land, 2, "mode_bool")
    elev_c = block_reduce(elev, 2, "mean")
    drain = Drainage(drainage_surface(elev_c, seed, gc, land_c), land_c, gc.cell)
    min_km2 = spec["hydrology"]["river_min_drainage_km2"]
    stream_features, stream_lines = [], []
    for chain, acc in drain.river_chains(min_km2):
        cy, cx = np.divmod(np.array(chain), gc.nx)
        line = smooth_line(np.column_stack([gc.xs[cx], gc.ys[cy]]), 0.35, 3)
        stream_features.append(feature(to_lonlat(line, frame), {"magnitude": round(acc, 1)}))
        stream_lines.append((line, acc))
    named_rivers = []
    for nr in spec["hydrology"].get("named_rivers", []):
        if nr["through"] in city_index:
            region_mask = city_r == city_index[nr["through"]]
        else:
            region_mask = dist_r == next(i for i, d in enumerate(districts) if d["id"] == nr["through"])
        through = block_reduce(region_mask, 2, "mean") > 0.5
        stem = drain.main_stem(through, min_km2, frozenset(c for *_, s in named_rivers for c in s))
        if not stem:
            continue
        cy, cx = np.divmod(np.array(stem), gc.nx)
        line = smooth_line(np.column_stack([gc.xs[cx], gc.ys[cy]]), 0.35, 3)
        fe = world.features[nr["feature"]]
        mouth_acc = float(drain.acc.ravel()[stem[-2]])
        named_rivers.append((fe, line, mouth_acc, stem))

    # Port towns: the district centre (and so the town) moves to the coast, 1.7–3 real km inland,
    # next to the mouth of the named river, the named landform, or else the stretch of coast
    # nearest the inland centre.
    mouths = {fe["id"]: line.coords[-1] for fe, line, _, _ in named_rivers}
    for did, toward in layout.get("coastal", {}).items():
        i = next(k for k, d in enumerate(districts) if d["id"] == did)
        tx, ty = mouths.get(toward) or (world.features[toward]["detect"]["at_km"] if toward else poles[i])
        cy_, cx_ = np.nonzero((dist_r == i) & land & ~water & (dcoast >= 0.6) & (dcoast <= 1.1))
        if len(cx_):
            k = int(np.argmin((g.xs[cx_] - tx) ** 2 + (g.ys[cy_] - ty) ** 2))
            poles[i] = (float(g.xs[cx_[k]]), float(g.ys[cy_[k]]))

    log("mountains")
    rp = spec.get("relief", {})
    peak_c = relief.peaks(elev_c, land_c, gc.xs, gc.ys, rp.get("peak_min_elev_m", 700), rp.get("peak_min_prominence_m", 150))
    pass_c = relief.passes(elev_c, peak_c, gc.xs, gc.ys, rp.get("pass_min_elev_m", 450))
    elev_top = block_reduce(elev, 2, "max")
    for p in peak_c:  # summit heights from the full-resolution terrain, as in the division stats
        rise = float(elev_top.flat[p["cell"]]) - p["metrics"]["elev_m"]
        p["metrics"]["elev_m"] += rise
        p["metrics"]["prominence_m"] += rise
    ice = relief.glaciers(elev, land & ~water, g.xs, g.ys, g.res, frame.km(g.res), rp.get("snowline_m", 2000),
                          rp.get("snowline_aspect_m", 300), rp.get("glacier_max_slope_deg", 38), rp.get("ice_min_km2", 0.5))
    glacier_c = [c for c in ice if c["metrics"]["area_km2"] >= rp.get("glacier_min_km2", 4)]
    log(f"  {len(peak_c)} peaks, {len(pass_c)} passes, {len(ice)} ice fields ({len(glacier_c)} glaciers)")

    log("land cover")
    water_c = block_reduce(water, 2, "mode_bool")
    ice_mask = np.any([c["mask"] for c in ice], axis=0) if ice else np.zeros(g.shape, bool)
    ice_c = block_reduce(ice_mask, 2, "mode_bool")
    settlements = [(*poles[i], d["population"]) for i, d in enumerate(districts) if d.get("population")]
    cover = landcover.classify(elev_c, land_c & ~water_c & ~ice_c, gc, frame.km(gc.res), frame.km(1.0), seed,
                               settlements, drain.acc.reshape(gc.shape), spec["landcover"])
    cover_polys = polygonize_labels(cover, gc.res, smooth=3, simplify_km=0.12)
    landcover_features = [feature(to_lonlat(geom, frame), {"class": landcover.CLASSES[k]}) for k, geom in sorted(cover_polys.items())]
    shares = np.bincount(cover[cover >= 0], minlength=len(landcover.CLASSES)) / max((cover >= 0).sum(), 1)
    log("  " + ", ".join(f"{name} {s * 100:.0f}%" for name, s in zip(landcover.CLASSES, shares)))

    log("landforms")
    coast_feats, candidate_report = detect_landforms(world, spec, drain, land_c, gc, frame, named_rivers, dist_r, g, districts,
                                                     peak_c + pass_c + glacier_c)
    for fe, line, acc, stem in coast_feats.pop("rivers"):
        named_rivers.append((fe, line, acc, stem))

    log("bathymetry")
    dsea = ndimage.distance_transform_edt(~land_c) * gc.res
    bands = np.digitize(dsea, [4, 12, 30])
    bands[land_c] = -1
    bath_polys = polygonize_labels(bands, gc.res, smooth=3, simplify_km=0.1)

    street_out, building_out, park_out = [], [], []
    lake_polys = [p for _, m in lakes if (p := polygonize_labels(np.where(m, 0, -1), g.res).get(0)) is not None]
    s = frame.scale
    land_real = affinity.scale(terr_poly, s, s, origin=(0, 0))
    if lake_polys:
        land_real = land_real.difference(affinity.scale(shapely.union_all(lake_polys), s, s, origin=(0, 0)))
    urban_poly = cover_polys.get(landcover.CLASSES.index("urban"))
    if spec.get("streets"):
        log("streets")
        sp = spec["streets"]
        river_lines = [line for _, line, _, _ in named_rivers] + \
                      [line for line, acc in stream_lines if acc >= sp.get("river_gap_min_km2", 60)]
        street_out = build_streets(world, sp, frame, seed, cities, districts, district_city, dist_polys, poles,
                                   cover_polys.get(landcover.CLASSES.index("urban")), terr_poly, lake_polys, river_lines)
        log("buildings")
        building_out, park_out = build_buildings(street_out, seed)
    with_streets = {i for _, _, ctx, _ in street_out for i in ctx}
    all_sites = [site for *_, city_sites in street_out for site in city_sites]
    for i, d in enumerate(districts):
        if i not in with_streets:
            core_r = (poles[i][0] * s, poles[i][1] * s)
            all_sites += [(pid, site, parts, i) for pid, site, parts in landmark_sites(world, d, core_r, 0.0, None, land_real, seed)]

    log("routing roads")
    land_r = block_reduce(land, 4, "mode_bool")
    elev_r = block_reduce(elev, 4, "mean")
    water_r = block_reduce(water | ice_mask, 4, "mode_bool")  # roads go round lakes and glaciers
    airfields = [shapely.transform(site, lambda c: c / s) for pid, site, _, _ in all_sites
                 if world.places[pid]["site"]["layout"] in ("airport", "spaceport")]
    if airfields:  # roads and railways go round runways and launch pads
        water_r = water_r | shapely.contains_xy(shapely.union_all(airfields).buffer(0.5 * gr.res), gr.X, gr.Y)
    router = Router(elev_r, land_r & ~water_r, gr.res)
    node = [router.cell(*poles[core[ci]]) for ci in range(len(cities))]
    road_out = []
    routes = sorted(
        (r for r in world.routes.values() if all(v in city_index for v in r["via"])),
        key=lambda r: (ROAD_RANK[r["class"]], r["ref"]),
    )
    for r in routes:
        via = r["via"] + r["via"][:1] if r.get("ring") else r["via"]
        path = []
        for a, b in zip(via[:-1], via[1:]):
            leg = router.route(node[city_index[a]], node[city_index[b]], r.get("tunnel_cost"), ref=r["ref"])
            path += leg if not path else leg[1:]
        if r.get("ends_at_network"):
            path = router.trim_to_network(path)
        router.commit(path, r["class"], ref=r["ref"])
        road_out.append((r, path))
    feeder_seq = 0
    for i, d in enumerate(districts):
        ci = district_city[i]
        if i == core[ci]:
            continue
        start = router.cell(*poles[i])
        path = router.trim_to_network(router.route(start, node[ci]))
        if len(path) < 3:
            continue
        router.commit(path, "secondary", discount=0.8)
        feeder_seq += 1
        a, b = short_name(districts[core[ci]]["names"]), short_name(d["names"])
        rid = derived_id("rte", f"feeder:{d['id']}")
        r = {
            "id": rid, "ref": f"X-NV-{feeder_seq:03d}", "network": "municipal_road", "class": "secondary",
            "status": "generated", "via": [districts[core[ci]]["id"], d["id"]],
            "names": {"zh": f"{a['zh']}—{b['zh']}公路", "en": f"{a['en']}–{b['en']} Road"},
        }
        road_out.append((r, path))

    log("routing railways")
    district_index = {d["id"]: i for i, d in enumerate(districts)}
    rail_router = Router(elev_r, land_r & ~water_r, gr.res, slope_weight=150)
    stop_index = {**district_index, **{c["id"]: core[ci] for ci, c in enumerate(cities)}}
    rail_out = route_railways(world, rail_router, poles, stop_index)
    rail_xy = lambda cells: np.array([rail_router.xy(c) for c in cells])
    rail_tracks = [smooth_line(rail_xy(run), 0.35, 4) for r, _, path in rail_out for run in owned_runs(path, r["id"], rail_router.owner)]
    track_union = shapely.union_all(rail_tracks) if rail_tracks else None
    stations: dict[str, dict] = {}
    rail_lines = []
    for r, stops, path in rail_out:
        ids = []
        for v, i in zip(r["via"], stops):
            sid = derived_id("poi", f"rail:{districts[i]['id']}")
            if sid not in stations:
                ci = district_city[i]
                pt = nearest_points(track_union, Point(poles[i]))[0]
                stations[sid] = {"names": rail_station_names(bare_name(cities[ci] if i == core[ci] else districts[i])),
                                 "xy": (pt.x, pt.y), "district": i, "lines": []}
            stations[sid]["names"].update(r.get("station_names", {}).get(v, {}))
            stations[sid]["lines"].append(r["id"])
            ids.append(sid)
        rail_lines.append((r, smooth_line(rail_xy(path), 0.35, 4), ids))
    if rail_out:
        log(f"  {len(rail_out)} railways, {len(stations)} stations, "
            f"{frame.km(sum(t.length for t in rail_tracks)):.0f} km of track")
    metro_lines = []
    if spec.get("metro") and urban_poly is not None:
        log("metro")
        metro_lines = build_metro(spec["metro"], world, seed, s, cities, districts, district_city, dist_polys, poles, urban_poly,
                                  land_real, street_out, all_sites, stations, spec.get("streets") or {})

    log("exporting")
    div_features, label_features = [], []
    terr_ll = to_lonlat(terr_poly, frame)

    def elev_stats(mask):
        vals = elev[mask & land]
        return {"elev_max_m": int(vals.max()) if vals.size else 0, "elev_mean_m": int(vals.mean()) if vals.size else 0}

    def add_division(d, geom_km, pole_xy, mask, extra):
        geom = to_lonlat(geom_km, frame)
        density = round(d["population"] / d["area_km2"], 1) if d.get("population") and d.get("area_km2") else None
        props = {
            "id": d["id"], "subtype": d["subtype"], "parent": d.get("parent"),
            "name_zh": d["names"]["zh"], "name_en": d["names"]["en"],
            "density": density, "status": d["status"], **extra,
        }
        div_features.append(feature(geom, props))
        e = entities[d["id"]]
        e.update({
            "bbox": bbox_lonlat(geom),
            "center": list(point_lonlat(frame, *pole_xy).coords[0]),
            "stats": {"area_km2_mapped": round(frame.km2(geom_km.area), 1), **elev_stats(mask),
                      **({"density_per_km2": density} if density else {})},
        })

    terr = territory
    add_division(terr, terr_poly, pole_of_inaccessibility(land, g.xs, g.ys), land, {"rank": 0})
    label_features.append(feature(point_lonlat(frame, *pole_of_inaccessibility(land, g.xs, g.ys)), {
        "id": terr["id"], "kind": "dependency", "name_zh": terr["short_names"]["zh"], "name_en": terr["short_names"]["en"], "rank": 0}))
    for ci, c in enumerate(cities):
        add_division(c, city_polys[ci], poles[core[ci]], city_r == ci, {"color": c["color"], "city": c["id"], "rank": 1})
        is_capital = terr.get("capital") == c["id"]
        label_features.append(feature(point_lonlat(frame, *poles[core[ci]]), {
            "id": c["id"], "kind": "locality", "name_zh": c["names"]["zh"], "name_en": c["names"]["en"],
            "capital": is_capital, "population": c["population"], "color": c["color"],
            "rank": 1 if is_capital else (2 if c["population"] >= 1_000_000 else 3)}))
    for i, d in enumerate(districts):
        ci = district_city[i]
        add_division(d, dist_polys[i], poles[i], dist_r == i, {"color": cities[ci]["color"], "city": cities[ci]["id"], "rank": 2})
        label_features.append(feature(point_lonlat(frame, *poles[i]), {
            "id": d["id"], "kind": "borough", "name_zh": d["names"]["zh"], "name_en": d["names"]["en"],
            "population": d["population"], "color": cities[ci]["color"], "rank": 4}))

    place_features, landmark_features = [], []
    sites = {pid: (site, parts) for pid, site, parts, _ in all_sites}
    for pid, p in world.places.items():
        if p["in"] in district_index:
            x, y = poles[district_index[p["in"]]]
        elif p["in"] in city_index:
            x, y = poles[core[city_index[p["in"]]]]
        else:
            continue
        ox, oy = p.get("offset_km", (0, 0))
        pt = point_lonlat(frame, x + ox / frame.scale, y + oy / frame.scale)
        place_features.append(feature(pt, {
            "id": pid, "subtype": p["subtype"], "marker": p.get("marker", "dot"), "emblem_of": p.get("emblem_of"),
            "name_zh": p["names"]["zh"], "name_en": p["names"]["en"], "site": pid in sites}))
        lon, lat = pt.coords[0]
        entities[pid].update({"center": [lon, lat], "bbox": [lon - 0.02, lat - 0.01, lon + 0.02, lat + 0.01],
                              "ancestors": [p["in"], *world.ancestors(p["in"])]})
        if pid in sites:
            site, parts = sites[pid]
            geom = to_lonlat(affinity.scale(site, 1 / frame.scale, 1 / frame.scale, origin=(0, 0)), frame, 6)
            facility = p["site"]["layout"] in FACILITY_LAYOUTS
            landmark_features.append(feature(geom, {"id": pid, "subtype": p["subtype"], "layout": p["site"]["layout"], "facility": facility,
                                                    "name_zh": p["names"]["zh"], "name_en": p["names"]["en"]}))
            for kind, part in parts:
                part_geom = to_lonlat(affinity.scale(part, 1 / frame.scale, 1 / frame.scale, origin=(0, 0)), frame, 6)
                landmark_features.append(feature(part_geom, {"part": kind, "of": pid, "facility": facility}))
            entities[pid].update({"bbox": bbox_lonlat(geom), "stats": {"area_km2_mapped": round(site.area, 2)}})

    water_features = []
    for fid, m in lakes:
        poly = polygonize_labels(np.where(m, 0, -1), g.res).get(0)
        if poly is None:
            continue
        fe = world.features[fid]
        geom = to_lonlat(poly, frame)
        water_features.append(feature(geom, {"id": fid, "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]}))
        cxy = poly.representative_point()
        label_features.append(feature(point_lonlat(frame, cxy.x, cxy.y), {
            "id": fid, "kind": "lake", "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"], "rank": 5}))
        entities[fid].update({"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, cxy.x, cxy.y).coords[0]),
                              "stats": {"area_km2_mapped": round(frame.km2(poly.area), 1)}})

    named_features = []
    for fe, line, acc, _ in named_rivers:
        geom = to_lonlat(line, frame)
        named_features.append(feature(geom, {"id": fe["id"], "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]}))
        mid = line.interpolate(0.5, normalized=True)
        entities[fe["id"]].update({"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, mid.x, mid.y).coords[0]),
                                   "stats": {"length_km": round(frame.km(line_length_km(line.coords)), 1), "drainage_km2": round(frame.km2(acc))}})

    ridge_features = []
    by_feature: dict[str, list] = {}
    for rdg in spec["terrain"]["ridges"]:
        by_feature.setdefault(rdg["feature"], []).append(rdg)
    for fid, parts in by_feature.items():
        fe = world.features[fid]
        lines = [LineString(chaikin(np.array(p["path"], float), 3)).intersection(terr_poly) for p in parts]
        geom_km = shapely.union_all([l for l in lines if not l.is_empty])
        if geom_km.is_empty:
            continue
        mask = np.zeros(g.shape, bool)
        for p in parts:
            mask |= polyline_distance(p["path"], g.X, g.Y) < p["width_km"]
        geom = to_lonlat(geom_km, frame)
        ridge_features.append(feature(geom, {"id": fid, "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]}))
        cpt = geom_km.interpolate(0.5, normalized=True) if geom_km.geom_type == "LineString" else geom_km.centroid
        entities[fid].update({"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, cpt.x, cpt.y).coords[0]),
                              "stats": {"elev_max_m": int(elev[mask & land].max())}})

    road_features = []
    for r, path in road_out:
        lines = [smooth_line(np.array([router.xy(c) for c in run]), 0.7, 4) for run in owned_runs(path, r["ref"], router.owner)]
        geom_km = lines[0] if len(lines) == 1 else MultiLineString(lines)
        geom = to_lonlat(geom_km, frame)
        road_features.append(feature(geom, {
            "id": r["id"], "ref": r["ref"], "class": r["class"], "network": r["network"],
            "name_zh": r["names"]["zh"], "name_en": r["names"]["en"]}))
        longest = max(lines, key=lambda ln: ln.length)
        ent = entities.setdefault(r["id"], {**r, "source": "generated:feeder-roads"})
        ent.update({"kind": "route", "bbox": bbox_lonlat(geom),
                    "center": list(point_lonlat(frame, *longest.interpolate(0.5, normalized=True).coords[0]).coords[0]),
                    "stats": {"length_km": round(frame.km(sum(line_length_km(ln.coords) for ln in lines)), 1)}})
        if r["network"] in SEGMENTED_NETWORKS:
            ent["segments"] = route_segments(path, router, dist_r, 4, frame, [d["id"] for d in districts])
            # travel length, including junction stretches drawn under another route's number
            ent["stats"]["length_km"] = round(sum(s["km"] for s in ent["segments"]), 1)

    street_features, street_named, named_parts = [], [], {}
    for city, sts, _, _ in street_out:
        for st in sts:
            geom = to_lonlat(st.geom, frame)
            props = {"class": st.cls, "name_zh": st.names["zh"], "name_en": st.names["en"]}
            if st.cls == "local":
                street_features.append(tile_minzoom(feature(geom, props), STREET_MINZOOM[st.cls]))
                continue
            rid = derived_id("rte", f"street:{city['id']}:{st.names['zh']}")
            props = {"id": rid, **props}
            street_features.append(tile_minzoom(feature(geom, props), STREET_MINZOOM[st.cls]))
            named_parts.setdefault(rid, (city, st, props, []))[3].append(st.geom)
    for rid, (city, st, props, parts) in named_parts.items():
        # one entity per name: a canon avenue may run through several districts
        geom_km = shapely.union_all(parts)
        geom = to_lonlat(geom_km, frame)
        street_named.append(feature(geom, props))
        via = [districts[i]["id"] for i in range(len(districts)) if district_city[i] == city_index[city["id"]]
               and dist_polys[i].intersection(geom_km).length > 0.02]
        longest = max(streets.pieces(geom_km), key=lambda q: q.length)
        entities[rid] = {
            "id": rid, "kind": "route", "network": f"{st.cls}_street", "class": st.cls, "status": st.status,
            "names": st.names, "via": via or [districts[st.district]["id"]], "source": "generated:streets",
            "ancestors": [city["id"], *world.ancestors(city["id"])],
            "bbox": bbox_lonlat(geom),
            "center": list(point_lonlat(frame, *longest.interpolate(0.5, normalized=True).coords[0]).coords[0]),
            "stats": {"length_km": round(frame.km(geom_km.length), 2)},
        }
    if street_out:
        log(f"  {len(street_features)} streets, {len(street_named)} named arterials and collectors")
    to_map = lambda g: to_lonlat(affinity.scale(g, 1 / frame.scale, 1 / frame.scale, origin=(0, 0)), frame, 6)
    building_features = [tile_minzoom(feature(to_map(g), {"class": cls}), BUILDING_MINZOOM) for cls, g in building_out]
    park_features = [tile_minzoom(feature(to_map(g), {"class": "park"}), BUILDING_MINZOOM) for g in park_out]
    if building_out:
        log(f"  {len(building_features)} buildings, {len(park_features)} parks, {len(sites)} landmark sites")

    rail_features = [feature(to_lonlat(t, frame), {"network": "intercity_rail", "role": "track"}) for t in rail_tracks]
    station_features = []

    def add_line(eid, line_km, props, decimals=5):
        geom = to_lonlat(line_km, frame, decimals)
        rail_features.append(feature(geom, {"id": eid, "role": "line", **props}))
        mid = line_km.interpolate(0.5, normalized=True)
        return {"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, mid.x, mid.y).coords[0]),
                "stats": {"length_km": round(frame.km(line_km.length), 1)}}

    for r, full, ids in rail_lines:
        entities[r["id"]].update({"class": "rail", "via": ids, **add_line(r["id"], full, {"network": r["network"], "color": r.get("color"),
                                                                         "name_zh": r["names"]["zh"], "name_en": r["names"]["en"]})})
    for ml in metro_lines:
        line_km = affinity.scale(ml["geom"], 1 / s, 1 / s, origin=(0, 0))
        entities[ml["id"]] = {
            "id": ml["id"], "kind": "route", "network": "metro", "class": "metro", "status": "generated", "names": ml["names"],
            "color": ml["color"], "via": ml["stations"], "ancestors": [ml["city"], *world.ancestors(ml["city"])], "source": "generated:metro",
            **add_line(ml["id"], line_km, {"network": "metro", "color": ml["color"], "ref": str(ml["n"]),
                                           "name_zh": ml["names"]["zh"], "name_en": ml["names"]["en"]}, 6),
        }
    rail_ids = {r["id"] for r, _, _ in rail_lines}
    metro_color = {ml["id"]: ml["color"] for ml in metro_lines}
    for sid, st in stations.items():
        pt = point_lonlat(frame, *st["xy"])
        lon, lat = pt.coords[0]
        lines = list(dict.fromkeys(st["lines"]))
        rail = any(ln in rail_ids for ln in lines)
        metro = [ln for ln in lines if ln in metro_color]
        station_features.append(feature(pt, {"id": sid, "kind": "rail" if rail else "metro", "transfer": len(lines) > 1,
                                             "color": metro_color[metro[0]] if metro else None,
                                             "name_zh": st["names"]["zh"], "name_en": st["names"]["en"]}))
        d = districts[st["district"]]
        entities[sid] = {"id": sid, "kind": "place", "subtype": "station", "status": "generated", "names": st["names"], "in": d["id"],
                         "lines": lines, "ancestors": [d["id"], *world.ancestors(d["id"])],
                         "source": "generated:railways" if rail else "generated:metro",
                         "center": [lon, lat], "bbox": [lon - 0.004, lat - 0.002, lon + 0.004, lat + 0.002]}

    terminals = {c["id"]: node[ci] for ci, c in enumerate(cities)}
    terminals.update({d["id"]: node[district_city[i]] if i == core[district_city[i]] else router.cell(*poles[i])
                      for i, d in enumerate(districts)})
    node_cells, edges, places = build_graph(
        [(ri, r["class"], path) for ri, (r, path) in enumerate(road_out)], terminals, router.nx, frame.km(router.res))

    def ll(xy):
        return [round(v, 5) for v in frame.to_lonlat(np.asarray(xy))]

    graph["roads"] += [r["id"] for r, _ in road_out]
    offset_n, offset_r = len(graph["nodes"]), len(graph["roads"]) - len(road_out)
    graph["nodes"] += [ll(router.xy(c)) for c in node_cells]
    for a, b, length, minutes, ri, chain in edges:
        pts = np.array([router.xy(c) for c in chain])
        line = smooth_line(pts, 0.7, 3) if len(pts) > 2 else LineString(pts)
        graph["edges"].append([a + offset_n, b + offset_n, length, minutes, ri + offset_r,
                               [ll(p) for p in line.coords]])
    graph["places"].update({eid: n + offset_n for eid, n in places.items()})
    log(f"  road graph: {len(node_cells)} nodes, {len(edges)} edges")

    bath_features = [feature(to_lonlat(p, frame), {"band": int(b)}) for b, p in sorted(bath_polys.items()) if b < 3]

    ctx_features = []
    for ctx in spec.get("context", []):
        # Context placement is given in real km, independent of the region's design scale.
        cw, ch = (v / frame.scale for v in ctx["extent_km"])
        cg = Grid((cw, ch), 0.5)
        rng = np.random.default_rng(ctx["seed"])
        f = np.zeros(cg.shape)
        for _ in range(ctx["islands"]):
            cx, cy, r = rng.uniform(0.15 * cw, 0.85 * cw), rng.uniform(0.15 * ch, 0.85 * ch), rng.uniform(10, 26)
            f += np.exp(-((cg.X - cx) ** 2 + (cg.Y - cy) ** 2) / r ** 2)
        f += 0.25 * value_noise(ctx["seed"] + 5, 30, 5, 0.5, (cw, ch), cg.shape)
        polys = polygonize_labels(np.where(f > 0.55, 0, -1), cg.res, simplify_km=0.15)
        if 0 in polys:
            ox, oy = (v / frame.scale for v in ctx["offset_km"])
            moved = affinity.translate(polys[0], g.w / 2 + ox - cw / 2, g.h / 2 + oy - ch / 2)
            ctx_features.append(feature(to_lonlat(moved, frame), {"id": ctx["id"], "name_zh": ctx["names"]["zh"], "name_en": ctx["names"]["en"]}))

    coast_features, glacier_features = [], []
    ice_names = {id(c): fe for c, fe in coast_feats["matched"] if c["kind"] == "glacier"}
    for c in ice:
        poly = polygonize_labels(np.where(c["mask"], 0, -1), g.res).get(0)
        if poly is None:
            continue
        c["geom"] = poly
        fe = ice_names.get(id(c))
        glacier_features.append(feature(to_lonlat(poly, frame), {"id": fe["id"], "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]} if fe else {}))
    for c, fe in coast_feats["matched"]:
        x, y = c["at"]
        pt = point_lonlat(frame, x, y)
        props = {"id": fe["id"], "kind": fe["subtype"], "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]}
        m = c["metrics"]
        major = frame.km2(m.get("area_km2", 0)) >= MAJOR_LANDFORM_KM2 if c["kind"] in ("bay", "fjord") else \
            frame.km(m.get("prominence_km", 0)) >= MAJOR_CAPE_KM if c["kind"] == "cape" else \
            m.get("prominence_m", 0) >= MAJOR_PEAK_PROMINENCE_M if c["kind"] == "peak" else False
        label_features.append(feature(pt, {**props, "rank": 5, "major": major,
                                           **({"elev": int(m["elev_m"])} if "elev_m" in m else {})}))
        stats = {}
        if "elev_m" in m:
            stats["elevation_m"] = int(m["elev_m"])
        if "prominence_m" in m:
            stats["prominence_m"] = int(m["prominence_m"])
        if c.get("geom") is not None:
            geom = to_lonlat(c["geom"], frame)
            if c["kind"] != "glacier":
                coast_features.append(feature(geom, props))
            bbox = bbox_lonlat(geom)
            stats["area_km2_mapped"] = round(frame.km2(c["geom"].area), 1)
        else:
            lon, lat = pt.coords[0]
            bbox = [lon - 0.12, lat - 0.06, lon + 0.12, lat + 0.06]
        if "length_km" in m and c["kind"] == "fjord":
            stats["length_km"] = round(frame.km(m["length_km"]), 1)
        if "width_km" in m:
            stats["width_km"] = round(frame.km(m["width_km"]), 1)
        if "drainage_km2" in m:
            stats["drainage_km2"] = round(frame.km2(m["drainage_km2"]))
        if c.get("mask") is not None:
            stats.update(elev_stats(block_upsample(c["mask"], g.shape)))
        entities[fe["id"]].update({"bbox": bbox, "center": list(pt.coords[0]), "stats": stats,
                                   "ancestors": [c["district"], *world.ancestors(c["district"])]})
    CACHE_DIR.mkdir(exist_ok=True)
    with open(CACHE_DIR / f"candidates-{territory['id']}.json", "w", encoding="utf-8") as f:
        json.dump(candidate_report, f, ensure_ascii=False, indent=1)

    check_expectations(spec.get("expect", {}), entities)

    layers["divisions"] += div_features
    layers["labels"] += label_features
    layers["places"] += place_features
    layers["water"] += water_features
    layers["coast"] += coast_features
    layers["glaciers"] += glacier_features
    layers["landcover"] += landcover_features
    layers["rivers"] += stream_features
    layers["rivers-named"] += named_features
    layers["ridges"] += ridge_features
    layers["roads"] += road_features
    layers["streets"] += street_features
    layers["streets-named"] += street_named
    layers["buildings"] += building_features
    layers["parks"] += park_features
    layers["landmarks"] += landmark_features
    layers["rail"] += rail_features
    layers["stations"] += station_features
    layers["bathymetry"] += bath_features
    layers["context"] += ctx_features

    log("writing terrain tiles")
    bounds = frame.bounds_lonlat()
    n = write_dem_tiles(OUT / "dem", np.where(land & ~water, np.maximum(elev, 1.0), -40.0), g, frame, bounds)
    log(f"  {n} tiles")
    return {
        "id": territory["id"],
        "bounds": bbox_lonlat(terr_ll),
        "frame_bounds": [round(v, 5) for v in bounds],
        "center": list(point_lonlat(frame, *pole_of_inaccessibility(land, g.xs, g.ys)).coords[0]),
        "quality": {"max_city_area_error": round(city_err, 4), "max_district_area_error": round(dist_err, 4)},
    }


def base_entities(world: World) -> dict:
    out = {}
    for eid, e in world.entities.items():
        ent = {k: v for k, v in e.items() if not k.startswith("_") and k != "detect"}
        ent["source"] = e.get("_source")
        if eid in world.divisions or eid in world.countries:
            ent["kind"] = "division"
            ent["ancestors"] = world.ancestors(eid)
            ent["children"] = [c["id"] for c in sorted(world.children(eid), key=lambda d: d.get("codes", {}).get("admin", ""))]
        elif eid in world.features:
            ent["kind"] = "natural"
        elif eid in world.routes or eid in world.railways:
            ent["kind"] = "route"
        elif eid in world.places:
            ent["kind"] = "place"
        out[eid] = ent
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate the world sources and stop")
    ap.add_argument("--fresh", action="store_true", help="ignore cached stages and recompute everything")
    args = ap.parse_args()
    world = World()
    errors = world.validate()
    if errors:
        print("Source validation failed:")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    log(f"sources ok: {len(world.divisions)} divisions, {len(world.features)} features, {len(world.routes)} routes, "
        f"{len(world.railways)} railways, {len(world.places)} places")
    if args.check:
        return
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    entities = base_entities(world)
    layers = {k: [] for k in ("divisions", "labels", "places", "landcover", "water", "coast", "glaciers", "rivers", "rivers-named", "ridges", "roads", "streets", "streets-named", "buildings", "parks", "landmarks", "rail", "stations", "bathymetry", "context")}
    graph = {"nodes": [], "edges": [], "roads": [], "places": {}}
    regions = [build_region(world, spec, entities, layers, graph, not args.fresh) for spec in world.generators]
    for name, feats in layers.items():
        write_geojson(f"{name}.geojson", feats)
    with open(OUT / "graph.json", "w", encoding="utf-8") as f:
        json.dump(graph, f, separators=(",", ":"))
    with open(OUT / "entities.json", "w", encoding="utf-8") as f:
        json.dump(entities, f, ensure_ascii=False, separators=(",", ":"))
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "planet": world.planet,
        "home": regions[0]["id"],
        "regions": regions,
        "dem": {"tiles": "dem/{z}/{x}/{y}.png", "encoding": "terrarium", "tileSize": 256, "minzoom": 3, "maxzoom": 10,
                "bounds": regions[0]["frame_bounds"]},
        "layers": sorted(layers),
    }
    with open(OUT / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log("done")


if __name__ == "__main__":
    main()
