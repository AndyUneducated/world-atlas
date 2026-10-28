"""One generated region: terrain, divisions, hydrology, land cover, cities, transport and export."""
from __future__ import annotations

import copy
import math
import re
from pathlib import Path

import numpy as np
import shapely
from scipy import ndimage
from shapely import affinity
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import nearest_points

from . import coast, engineering, landcover, relief, streets
from .cache import stage
from .dem_tiles import cached_dem_tiles
from .divisions import partition, pole_of_inaccessibility
from .grid import Frame, Grid, block_reduce, chaikin, line_length_km, polyline_distance
from .hydro import Drainage
from .noise import value_noise
from .terrain import drainage_surface, elevation, land_mask
from .network import ROAD_RANK, build_graph
from .transport import Router
from .vectorize import point_lonlat, polygonize_labels, to_lonlat
from .world import FACILITY_LAYOUTS, MILITARY_VARIANTS, RUNWAY_LAYOUTS, World
from .common import (BUILDING_MINZOOM, STREET_MINZOOM, bbox_lonlat, derived_id, drawn_along, feature, fill_undrawn, log, owned_runs, run_positions, short_name, undrawn_steps,
                     smooth_line, tile_minzoom)
from .sites import SEA_BRIDGE_HALF_WIDTH_KM, landmark_sites
from .city import bare_name, build_buildings, build_metro, build_streets, rail_station_names
from .routes import PORTAL, cross_part, land_cell, route_railways, route_segments, stops_here

LAYERS = ("divisions", "labels", "places", "landcover", "water", "coast", "glaciers", "rivers", "rivers-named", "ridges", "roads",
          "route-shared", "streets", "streets-named", "buildings", "parks", "skyways", "landmarks", "rail", "stations", "bathymetry", "context")
SKYWAY_LINK_KM = 0.6  # a landmark this close to a skyway is joined to it by a short bridge


# Road networks whose cards list the districts they pass through.
SEGMENTED_NETWORKS = {"national_expressway", "territorial_expressway", "territorial_highway"}
# How far a route terminus reaches to join the network: expressway to expressway, else to any road.
JOIN_MOTORWAY_KM = 20
JOIN_ROAD_KM = 5
# Bays and fjords this large (real km²) and capes this prominent (real km) are labelled from lower zooms.
MAJOR_LANDFORM_KM2 = 200
MAJOR_CAPE_KM = 12
MAJOR_PEAK_PROMINENCE_M = 450


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
    island_min, mainland = cp.get("island_min_km2", 0.8), cp.get("mainland", True)
    cands = (coast.islands(*args, island_min, mainland)
             + coast.bays(*args, cp.get("bay_close_km", 5), cp.get("bay_min_km2", 15))
             + coast.capes(*args, cp.get("cape_open_km", 2.5), cp.get("cape_min_prominence_km", 2.5), mainland)
             + coast.straits(*args, cp.get("strait_max_gap_km", 4), island_min, mainland)
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

    entries = [f for f in world.region_features(spec) if f.get("detect")]
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


def lake_field(field: dict | None, g: Grid, land, elev, dcoast, dist_r, districts, seed) -> np.ndarray:
    """Unnamed small lakes scattered over low, flat ground in the given districts (tundra lake country):
    `count` lobed discs with radii between radius_km[0] and [1] (design km), most of them small."""
    out = np.zeros(g.shape, bool)
    if not field:
        return out
    ids = {d["id"]: i for i, d in enumerate(districts)}
    ok = np.isin(dist_r, [ids[d] for d in field["in"]]) & (elev < field.get("max_elev_m", 400)) & (dcoast > field.get("min_coast_km", 2))
    ys, xs = np.nonzero(ok)
    if not len(ys):
        return out
    rng = np.random.default_rng(seed + 61)
    r0, r1 = field["radius_km"]
    for k in rng.choice(len(ys), size=min(field["count"], len(ys)), replace=False):
        r = r0 * (r1 / r0) ** (rng.random() ** 2.2)
        cx, cy = g.xs[xs[k]], g.ys[ys[k]]
        stretch, turn, phase = 1 + 0.9 * rng.random(), rng.random() * np.pi, rng.random() * 6.3
        pad = int(np.ceil(r * stretch * 1.5 / g.res)) + 1
        sy, sx = slice(max(ys[k] - pad, 0), ys[k] + pad + 1), slice(max(xs[k] - pad, 0), xs[k] + pad + 1)
        X, Y = g.X[sy, sx] - cx, g.Y[sy, sx] - cy
        u, v = X * np.cos(turn) + Y * np.sin(turn), -X * np.sin(turn) + Y * np.cos(turn)
        ang = np.arctan2(v, u)
        rr = r * (1 + 0.3 * np.sin(3 * ang + phase) + 0.15 * np.sin(5 * ang + 2 * phase))
        out[sy, sx] |= np.hypot(u / stretch, v) < rr
    return out & land & (dcoast > 1)


def lake_basins(elev, lakes, res, falloff=0.8):
    """Rendered elevation with each lake flat at its shoreline level and the land around it easing down to it,
    so hillshade shows a basin rather than a pit wall."""
    out = elev.copy()
    for _, m in lakes:
        shore = ndimage.binary_dilation(m) & ~m
        if not shore.any():
            continue
        level = float(np.percentile(elev[shore], 10))
        w = np.exp(-((ndimage.distance_transform_edt(~m) * res) / falloff) ** 2)
        out = np.where(m, level, out - np.clip(out - level, 0, None) * w)
    return out


def build_region(world: World, spec: dict, base: dict, dem_dir: Path, use_cache: bool = True) -> dict:
    """Generate one region from the base entities (left unchanged) and write its terrain tiles to dem_dir.

    Returns {region: manifest entry, entities: the entities it adds or changes, layers, graph (its own
    node and road numbering), candidates: landform report}."""
    entities = copy.deepcopy(base)
    graph = {"nodes": [], "edges": [], "roads": [], "places": {}}
    seed = spec["seed"]
    frame = Frame(spec["frame"]["origin_lonlat"], spec["frame"]["size_km"], spec["frame"].get("scale", 1.0))
    g = Grid(spec["frame"]["size_km"], spec["frame"]["resolution_km"])
    gc = Grid(spec["frame"]["size_km"], spec["frame"]["resolution_km"] * 2)
    gr = Grid(spec["frame"]["size_km"], spec["frame"]["resolution_km"] * 4)
    layout = spec["layout"]

    territory = world.divisions[spec["territory"]]
    in_territory = [territory["id"], *world.ancestors(territory["id"])]
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
        anchored = layout.get("anchored", False)
        claims = layout.get("islands", {})
        city_claims = [[p for i, d in enumerate(districts) if district_city[i] == ci for p in claims.get(d["id"], [])]
                       for ci in range(len(cities))]
        city_r, _, land = partition(land, wx, wy, anchors, [c["area_km2"] for c in cities], g.cell, anchored=anchored,
                                    claims=city_claims)
        dist_r = np.full(g.shape, -1)
        dist_errs = np.zeros(len(districts))
        for ci, c in enumerate(cities):
            idx = [i for i, dc in enumerate(district_city) if dc == ci]
            cmask = city_r == ci
            ax, ay = anchors[ci]
            r = 0.42 * math.sqrt(c["area_km2"]) / frame.km(1.0)
            seeds = [(ax + r * dirs[districts[i]["id"]][0], ay + r * dirs[districts[i]["id"]][1]) for i in idx]
            sub, err, fitted = partition(cmask, wx, wy, seeds, [districts[i]["area_km2"] for i in idx], g.cell, sea=~land,
                                         anchored=anchored, claims=[claims.get(districts[i]["id"], []) for i in idx])
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
    core = [max((i for i, dc in enumerate(district_city) if dc == ci), key=lambda i: districts[i]["population"]) for ci in range(len(cities))]

    lakes = []
    for lk in spec.get("hydrology", {}).get("lakes", []):
        di = next(i for i, d in enumerate(districts) if d["id"] == lk["in"])
        dx, dy = lk.get("offset_km", (0, 0))
        m = lake_raster(g, (poles[di][0] + dx / frame.scale, poles[di][1] + dy / frame.scale), lk["radius_km"], land)
        lakes.append((lk["feature"], m))
    water = np.zeros(g.shape, bool)
    for _, m in lakes:
        water |= m
    pond_mask = lake_field(spec.get("hydrology", {}).get("lake_field"), g, land, elev, dcoast, dist_r, districts, seed) & ~water
    water |= pond_mask
    lake_named = [(fid, p) for fid, m in lakes if (p := polygonize_labels(np.where(m, 0, -1), g.res).get(0)) is not None]
    ponds = polygonize_labels(np.where(pond_mask, 0, -1), g.res).get(0) if pond_mask.any() else None
    lake_polys = [p for _, p in lake_named] + ([ponds] if ponds is not None else [])
    lake_union = shapely.union_all(lake_polys) if lake_polys else None

    def on_land(line):
        """The part of a river drawn on the map: lakes cover it."""
        return line if lake_union is None else line.difference(lake_union)

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
        if not (shown := on_land(line)).is_empty:
            stream_features.append(feature(to_lonlat(shown, frame), {"magnitude": round(acc, 1)}))
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
        street_out = build_streets(world, sp, world.region_features(spec), frame, seed, cities, districts, district_city, dist_polys, poles,
                                   cover_polys.get(landcover.CLASSES.index("urban")), terr_poly, lake_polys, river_lines)
        log("buildings")
        building_out, park_out = build_buildings(street_out, seed)
    with_streets = {i for _, _, ctx, _ in street_out for i in ctx}
    all_sites = [site for *_, city_sites in street_out for site in city_sites]
    for i, d in enumerate(districts):
        if i not in with_streets:
            core_r = (poles[i][0] * s, poles[i][1] * s)
            built = affinity.scale(dist_polys[i].intersection(urban_poly), s, s, origin=(0, 0)) if urban_poly is not None else None
            all_sites += [(pid, site, parts, i) for pid, site, parts in landmark_sites(world, d, core_r, 0.0, built, land_real, seed)]

    log("routing roads")
    land_r = block_reduce(land, 4, "mode_bool")
    elev_r = block_reduce(elev, 4, "mean")
    water_r = block_reduce(water | ice_mask, 4, "mode_bool")  # roads go round lakes and glaciers
    airfields = [shapely.transform(site, lambda c: c / s) for pid, site, _, _ in all_sites
                 if world.places[pid]["site"]["layout"] in RUNWAY_LAYOUTS]
    if airfields:  # roads and railways go round runways and launch pads
        water_r = water_r | shapely.contains_xy(shapely.union_all(airfields).buffer(0.5 * gr.res), gr.X, gr.Y)
    router = Router(elev_r, land_r & ~water_r, gr.res)
    node = [router.cell(*poles[core[ci]]) for ci in range(len(cities))]
    district_index = {d["id"]: i for i, d in enumerate(districts)}

    def dry_centre(site):  # a ferry pier half out at sea is reached on its landward side
        dry = site.intersection(land_real)
        c = (site if dry.is_empty else dry).centroid
        return (c.x / s, c.y / s)

    def gate(cfg, site, i):  # a military site is entered on the side facing its district centre, clear of the runways
        c = site.centroid
        if cfg["layout"] == "launch_track":  # entered at the loading terminal, the low -x end
            a, h = math.radians(cfg.get("angle_deg", 0)), cfg["size_m"][0] / 2000
            target = Point(c.x - h * math.cos(a), c.y - h * math.sin(a))
        else:
            target = Point(poles[i][0] * s, poles[i][1] * s)
        q = nearest_points(site.exterior, target)[0]
        n = math.hypot(q.x - c.x, q.y - c.y) or 1.0
        out = 1.5 * gr.res * s
        return ((q.x + (q.x - c.x) / n * out) / s, (q.y + (q.y - c.y) / n * out) / s)

    place_at = {pid: gate(cfg, site, i) if (cfg := world.places[pid]["site"])["layout"] in MILITARY_VARIANTS else dry_centre(site)
                for pid, site, _, i in all_sites}

    def stop_cell(v):  # a city stops at its core, a district at its own centre
        if v in place_at:
            return router.cell(*place_at[v])
        return node[city_index[v]] if v in city_index else router.cell(*poles[district_index[v]])

    road_out, road_via = [], {}
    road_stop = lambda v: v in city_index or v in district_index or v in place_at
    routes = sorted((r for r in world.routes.values() if stops_here(r, territory["id"], road_stop)), key=lambda r: (ROAD_RANK[r["class"]], r["ref"]))
    for r in routes:
        via = stops_here(r, territory["id"], road_stop)
        via = via + via[:1] if r.get("ring") else via
        road_via[r["id"]] = via
        cells = [land_cell(land_r, gr.res, *r["crossing"][territory["id"]]) if v == PORTAL else stop_cell(v) for v in via]
        path = []
        for (a, b), (ca, cb) in zip(zip(via[:-1], via[1:]), zip(cells[:-1], cells[1:])):
            spec_b = r.get("legs", {}).get(b, {})
            if spec_b.get("straight", r.get("straight")):
                leg = router.straight(ca, cb)
            else:
                leg = router.route(ca, cb, spec_b.get("tunnel_cost", r.get("tunnel_cost")), ref=r["ref"])
            path += leg if not path else leg[1:]
        if r.get("ends_at_network"):
            path = router.trim_to_network(path)
        router.commit(path, r["class"], ref=r["ref"])
        road_out.append((r, path))
    feeder_seq, infix = 0, territory["codes"]["iso3166_2"].split("-")[1]
    landmass = ndimage.label(land_r, np.ones((3, 3)))[0].ravel()
    for i, d in enumerate(districts):
        ci = district_city[i]
        if i == core[ci]:
            continue
        start = router.cell(*poles[i])
        if 0 != landmass[start] != landmass[node[ci]] != 0:  # an island district has no road over the sea to its city
            continue
        path = router.trim_to_network(router.route(start, node[ci]))
        if len(path) < 3:
            continue
        feeder_seq += 1
        a, b = short_name(districts[core[ci]]["names"]), short_name(d["names"])
        rid = derived_id("rte", f"feeder:{d['id']}")
        r = {
            "id": rid, "ref": f"X-{infix}-{feeder_seq:03d}", "network": "municipal_road", "class": "secondary",
            "status": "generated", "via": [districts[core[ci]]["id"], d["id"]],
            "names": {"zh": f"{a['zh']}—{b['zh']}公路", "en": f"{a['en']}–{b['en']} Road"},
        }
        router.commit(path, "secondary", discount=0.8, ref=r["ref"])
        road_out.append((r, path))
    dead_ends = set()
    for pid, p in world.places.items():  # facilities with an access road, from the gate to the nearest road
        if not p.get("access_road") or pid not in place_at:
            continue
        i = district_index[p["in"]]
        path = router.trim_to_network(router.route(router.cell(*place_at[pid]), router.cell(*poles[i])))
        if len(path) < 2:
            continue
        feeder_seq += 1
        rid = derived_id("rte", f"access:{pid}")
        r = {
            "id": rid, "ref": f"X-{infix}-{feeder_seq:03d}", "network": "municipal_road", "class": "secondary",
            "status": "generated", "via": [p["in"], pid],
            "names": {"zh": f"{p['names']['zh']}公路", "en": f"{p['names']['en']} Road"},
        }
        router.commit(path, "secondary", discount=0.8, ref=r["ref"])
        road_out.append((r, path[::-1]))
        dead_ends.add(rid)

    # Termini join the network: an expressway end runs on to the nearest other expressway (an
    # interchange, so traffic changes routes without leaving the expressway), any other end to the
    # nearest road, whichever is cheapest to build within reach (plus a cell, as drawn lines are
    # smoothed off the cell centres). Ends on another route stay as they are. A joining leg takes
    # over the cells it shares with lower routes, so an expressway never runs on as a city road.
    route_rank = {r["ref"]: ROAD_RANK[r["class"]] for r, _ in road_out}
    for k, (r, path) in enumerate(road_out):
        if r.get("ring") or r["id"] in dead_ends:
            continue
        ref = r["ref"]
        foreign = {c for c in router.used if router.owner.get(c) != ref}
        motorway = {c for c in foreign if router.used[c] == "motorway"}
        # another route passing through the end meets it there, even where this route owns the cell
        passing = {c for j, (r2, p2) in enumerate(road_out) if j != k for c in p2}
        passing_mw = {c for j, (r2, p2) in enumerate(road_out) if j != k and r2["class"] == "motorway" for c in p2}
        own = set(path)
        for at_start in (True, False):
            if road_via.get(r["id"], [None])[0 if at_start else -1] == PORTAL:
                continue  # the route goes on through the tunnel
            end = path[0] if at_start else path[-1]
            leg = None
            for targets, reach_km in ((motorway, JOIN_MOTORWAY_KM), (foreign, JOIN_ROAD_KM)):
                if targets is motorway and r["class"] != "motorway":
                    continue
                if end in targets or end in (passing_mw if targets is motorway else passing):
                    break
                reach = reach_km / frame.scale + router.res
                if r.get("straight"):
                    target = router.nearest(end, targets, reach)
                    leg = router.straight(end, target) if target is not None else None
                else:
                    leg = router.route_to_any(end, targets, reach, own - {end}, r.get("tunnel_cost"))
                if leg:
                    break
            if not leg:
                continue
            router.commit(leg, r["class"], ref=ref)
            for c in leg[1:-1]:  # the last cell is the junction, kept by the route joined
                if route_rank.get(router.owner.get(c), -1) > route_rank[ref]:
                    router.owner[c], router.used[c] = ref, r["class"]
            own.update(leg)
            path = leg[::-1] + path[1:] if at_start else path + leg[1:]
            log(f"  {ref} {'start' if at_start else 'end'} joined {router.owner.get(leg[-1])} ({frame.km(LineString([router.xy(c) for c in leg]).length):.1f} km)")
        road_out[k] = (r, path)

    if nets := spec.get("expect", {}).get("district_centres_on"):
        on = {c for r, path in road_out if r["network"] in nets for c in path}
        near = lambda c: any(c + dy * router.nx + dx in on for dy in (-1, 0, 1) for dx in (-1, 0, 1))
        skip = set(spec["expect"].get("district_centres_except", []))
        missing = [d["names"]["zh"] for i, d in enumerate(districts) if d["id"] not in skip and not near(stop_cell(d["id"]))]
        log(f"  {'ok  ' if not missing else 'FAIL'} every district centre on {' / '.join(nets)}"
            + (f": missing {', '.join(missing)}" if missing else ""))

    log("routing railways")
    rail_router = Router(elev_r, land_r & ~water_r, gr.res, slope_weight=150)
    stop_index = {**district_index, **{c["id"]: core[ci] for ci, c in enumerate(cities)}}
    rail_out = route_railways(world, rail_router, poles, stop_index, territory["id"], land_r & ~water_r)
    rail_xy = lambda cells: np.array([rail_router.xy(c) for c in cells])
    rail_owned = {r["id"]: owned_runs(path, r["id"], rail_router.owner) for r, _, path in rail_out}
    fill_undrawn({r["id"]: path for r, _, path in rail_out}, rail_owned)
    rail_drawn = {rid: [(run, smooth_line(rail_xy(run), 0.35, 4)) for run in runs] for rid, runs in rail_owned.items()}
    rail_tracks = [line for runs in rail_drawn.values() for _, line in runs]
    track_union = shapely.union_all(rail_tracks) if rail_tracks else None
    stations: dict[str, dict] = {}
    rail_lines = []
    for r, stops, path in rail_out:
        ids = []
        freight = r["network"] == "freight_rail"
        for v, i in zip([v for v in r["via"] if v in stop_index], stops):
            # freight yards are their own stations, apart from the passenger station of the same district
            sid = derived_id("poi", f"{'freight' if freight else 'rail'}:{districts[i]['id']}")
            if sid not in stations:
                ci = district_city[i]
                pt = nearest_points(track_union, Point(poles[i]))[0]
                stations[sid] = {"names": rail_station_names(bare_name(cities[ci] if i == core[ci] else districts[i]), freight),
                                 "xy": (pt.x, pt.y), "district": i, "lines": [], "freight": freight}
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
        if pid in sites:  # fitted to the shore, see fit_site
            c = sites[pid][0].centroid
            pt = point_lonlat(frame, c.x / frame.scale, c.y / frame.scale)
        else:
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
            props = {"id": pid, "subtype": p["subtype"], "layout": p["site"]["layout"], "facility": facility,
                     "name_zh": p["names"]["zh"], "name_en": p["names"]["en"]}
            landmark_features.append(feature(geom, props))
            # one label point, or a site spanning several tiles is labelled once per tile
            label = {"label_of": pid, "facility": facility, "layout": props["layout"], "name_zh": props["name_zh"], "name_en": props["name_en"]}
            landmark_features.append(feature(to_lonlat(affinity.scale(site.representative_point(), 1 / frame.scale, 1 / frame.scale, origin=(0, 0)), frame, 6), label))
            by_kind: dict[str, list] = {}
            for kind, part in parts:  # one feature per part kind keeps big facilities light to render
                by_kind.setdefault(kind, []).append(part)
            for kind, ps in by_kind.items():
                part_geom = to_lonlat(affinity.scale(shapely.union_all(ps), 1 / frame.scale, 1 / frame.scale, origin=(0, 0)), frame, 6)
                landmark_features.append(feature(part_geom, {"part": kind, "of": pid, "facility": facility}))
            stats = {"area_km2_mapped": round(site.area, 2)}
            if bridges := by_kind.get("bridge"):
                stats["bridge_km"] = round(sum(b.area for b in bridges) / (2 * SEA_BRIDGE_HALF_WIDTH_KM), 1)
                geom = shapely.union_all([geom, *[to_lonlat(affinity.scale(b, 1 / frame.scale, 1 / frame.scale, origin=(0, 0)), frame, 6) for b in bridges]])
            entities[pid].update({"bbox": bbox_lonlat(geom), "stats": stats})

    water_features = [feature(to_lonlat(ponds, frame), {})] if ponds is not None else []
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
        lake_in = next(lk["in"] for lk in spec["hydrology"]["lakes"] if lk["feature"] == fid)
        entities[fid].update({"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, cxy.x, cxy.y).coords[0]),
                              "stats": {"area_km2_mapped": round(frame.km2(poly.area), 1)},
                              "ancestors": [lake_in, *world.ancestors(lake_in)]})

    named_features = []
    for fe, line, acc, _ in named_rivers:
        geom = to_lonlat(line, frame)
        named_features.append(feature(to_lonlat(on_land(line), frame), {"id": fe["id"], "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]}))
        mid = line.interpolate(0.5, normalized=True)
        entities[fe["id"]].update({"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, mid.x, mid.y).coords[0]),
                                   "stats": {"length_km": round(frame.km(line_length_km(line.coords)), 1), "drainage_km2": round(frame.km2(acc))},
                                   "ancestors": in_territory})

    ridge_features, ridge_lines = [], []
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
        ridge_lines.append((fe, geom_km))
        ridge_features.append(feature(geom, {"id": fid, "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]}))
        cpt = geom_km.interpolate(0.5, normalized=True) if geom_km.geom_type == "LineString" else geom_km.centroid
        entities[fid].update({"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, cpt.x, cpt.y).coords[0]),
                              "stats": {"elev_max_m": int(elev[mask & land].max())}, "ancestors": in_territory})

    eng = world.engineering
    standards, climate = eng.get("standards", {}), eng.get("climate", {})
    speed_rules = {"urban_density": eng.get("urban_density", 250), "mountain_structure_share": eng.get("mountain_structure_share", 0.35)}
    wet_r = ~land_r | block_reduce(water, 4, "mode_bool")
    crossing_min = eng.get("river_min_drainage_km2", 150)
    river_geom = shapely.union_all([line for _, line, _, _ in named_rivers] + [line for line, acc in stream_lines if acc >= crossing_min])
    density_of = lambda did: entities.get(did or "", {}).get("stats", {}).get("density_per_km2", 0)
    urban_r = np.zeros(elev_r.shape, bool)
    built = block_reduce(cover == landcover.CLASSES.index("urban"), 2, "mode_bool")
    h, w = min(built.shape[0], urban_r.shape[0]), min(built.shape[1], urban_r.shape[1])
    urban_r[:h, :w] = built[:h, :w]
    urban_depth_r = ndimage.distance_transform_edt(urban_r) * frame.km(gr.res)

    water_marks = [(fe, Point(c["at"])) for c, fe in coast_feats["matched"] if c["kind"] in ("strait", "bay", "fjord", "estuary")]
    relief_marks = [(fe, Point(c["at"])) for c, fe in coast_feats["matched"] if c["kind"] in ("pass", "peak")] + ridge_lines
    lake_marks = [(world.features[fid], p) for fid, p in lake_named]
    river_marks = [(fe, line) for fe, line, _, _ in named_rivers]

    def structure_name(kind, prof, i0, i1, path, rt, km):
        """A bridge or tunnel takes the name of the river, lake, sea or mountain it crosses, else of its district."""
        cells = [path[c] for c in dict.fromkeys(prof.cell[i0:i1 + 1].tolist())]
        piece = LineString([rt.xy(c) for c in cells]) if len(cells) > 1 else Point(rt.xy(cells[0]))

        def near(marks, within):
            d, fe = min(((piece.distance(geom), fe) for fe, geom in marks), default=(math.inf, None), key=lambda t: t[0])
            return fe["names"] if d <= within else None

        wet, urban = prof.wet[i0:i1 + 1].mean() > 0.5, prof.urban[i0:i1 + 1].mean() > 0.5
        mid = piece.interpolate(0.5, normalized=True) if piece.geom_type == "LineString" else piece
        district = short_name(districts[min(dist_polys, key=lambda i: dist_polys[i].distance(mid))]["names"])
        # the place name alone, without a special district's kind
        district = {"zh": re.sub(r"(训练管理|改良|牧|猎|管理|生态保护)$", "", district["zh"]),
                    "en": re.sub(r" (Training Area|Improvement|Pastoral|Herding|Hunting|Ice Administration Zone|Administration Zone|Nature Reserve)$",
                                 "", district["en"])}
        if kind == "tunnel":
            n = (None if urban else near(relief_marks, 6 / frame.scale)) or district
            return {"zh": f"{n['zh']}隧道", "en": f"{n['en']} Tunnel"}
        if kind == "snow_shed":
            n = near(relief_marks, 6 / frame.scale) or district
            return {"zh": f"{n['zh']}防雪棚", "en": f"{n['en']} Snow Shed"}
        grand = "特大桥" if km >= 1 else "大桥"
        if wet and (n := near(lake_marks, 0.5 / frame.scale)):
            return {"zh": f"{n['zh']}{grand}", "en": f"{n['en']} Bridge"}
        if n := near(river_marks, 0.3 / frame.scale):
            return {"zh": f"{n['zh']}{grand}", "en": f"{n['en']} Bridge"}
        if wet and (n := near(water_marks, 25 / frame.scale)):
            return {"zh": f"{n['zh']}跨海大桥", "en": f"{n['en']} Bridge"}
        if urban:
            return {"zh": f"{district['zh']}高架桥", "en": f"{district['en']} Viaduct"}
        return {"zh": f"{district['zh']}{grand}", "en": f"{district['en']} {'Sea Bridge' if wet else 'Viaduct'}"}

    def engineer(ent, path, std, rt, ref=None, stations=0):
        """Structure profile, cost estimate, longest structures and (for roads) speed limits of a routed line."""
        line_km = LineString([rt.xy(c) for c in path])
        prof = engineering.profile(path, rt, elev_r, wet_r, frame.km(rt.res), std, line_km, river_geom, ref, urban_depth_r,
                                   fine=(elev, g.res))
        if spec.get("snow_sheds"):
            engineering.add_snow_sheds(prof, spec["snow_sheds"])
        ent["engineering"] = engineering.estimate(prof, std, climate, stations)
        ent["engineering"]["max_grade_permille"] = round(engineering.max_grade(prof) * 1000, 1)
        ent["structures"] = {kind: {"names": structure_name(kind, prof, i0, i1, path, rt, km), "km": round(km, 1)}
                             for kind, (km, i0, i1) in engineering.longest_structures(prof).items() if km >= 0.2}
        if "speed" not in std:
            return
        limits = []
        for sg in ent.get("segments", []):
            i0, i1 = sg.pop("_span")
            sg["speed_kmh"] = engineering.segment_speed(prof, std, i0, i1, density_of(sg["division"]), speed_rules)
            limits.append(sg["speed_kmh"])
        if not limits:
            limits = [engineering.segment_speed(prof, std, 0, len(path) - 1, max(density_of(v) for v in ent.get("via", [None])), speed_rules)]
        ent["speed"] = engineering.speed_summary(limits)

    road_runs = {r["ref"]: [run for run in owned_runs(path, r["ref"], router.owner) if len(run) > 1] for r, path in road_out}
    fill_undrawn({r["ref"]: path for r, path in road_out}, road_runs)
    # Junctions (where any drawn run starts or ends) stay pinned to their cell centres while the
    # stretches between them are smoothed, so every route meeting there passes the same point.
    pins = {c for runs in road_runs.values() for run in runs for c in (run[0], run[-1])}

    def smooth_pinned(run: list[int]) -> LineString:
        cuts = [i for i in range(1, len(run) - 1) if run[i] in pins] + [len(run) - 1]
        coords, start = [router.xy(run[0])], 0
        for i in cuts:
            coords += list(smooth_line(np.array([router.xy(c) for c in run[start:i + 1]]), 0.7, 4).coords)[1:]
            start = i
        return LineString(coords)

    smoothed = {ref: [smooth_pinned(run) for run in runs] for ref, runs in road_runs.items()}

    def meet_host(line: LineString, run: list[int], ref: str) -> LineString:
        """Move each end that lies on another route's corridor onto that route's drawn line, so the two meet."""
        coords = list(line.coords)
        for i, c in ((0, run[0]), (-1, run[-1])):
            host = router.owner.get(c)
            if host != ref and smoothed.get(host):
                p = nearest_points(MultiLineString(smoothed[host]), Point(coords[i]))[0]
                if p.distance(Point(coords[i])) <= 2 * router.res:
                    coords[i] = (p.x, p.y)
        return LineString(coords)

    drawn_roads = {r["ref"]: [meet_host(line, run, r["ref"]) for line, run in zip(smoothed[r["ref"]], road_runs[r["ref"]])] for r, _ in road_out}
    drawn_all = [(r["ref"], run, line, run_positions(run, line, router.xy))
                 for r, _ in road_out for run, line in zip(road_runs[r["ref"]], drawn_roads[r["ref"]])]
    rail_runs = [run for runs in rail_drawn.values() for run, _ in runs]
    undrawn = {**{r["ref"]: n for r, path in road_out if (n := undrawn_steps(path, [run for _, run, _, _ in drawn_all]))},
               **{r["names"]["zh"]: n for r, _, path in rail_out if (n := undrawn_steps(path, rail_runs))}}
    log(f"  warn undrawn steps, left unlit when clicked: {undrawn}" if undrawn else "  ok   every route and railway drawn end to end")
    road_features, shared_features, overruns = [], [], {}

    def lit_overrun(key, lit: list[LineString], path: list[int], rt):
        """A click lights only the drawn lines along the route, so they can't be longer than the route's own path."""
        path_len = LineString([rt.xy(c) for c in path]).length if len(path) > 1 else 0.0
        lit_len = sum(ln.length for ln in lit)
        if lit_len > 1.03 * path_len + 2 * rt.res:
            overruns[key] = round(lit_len / max(path_len, rt.res), 2)

    def drawn_lonlat(lines: list[LineString]) -> list:
        return [[[round(x, 4), round(y, 4)] for x, y in to_lonlat(ln, frame).coords] for ln in lines]

    for r, path in road_out:
        lines = drawn_roads[r["ref"]]
        if "crossing" in r and len(path) < 2:  # the tunnel starts at its stop here: nothing of it on land
            ent = cross_part(entities.setdefault(r["id"], dict(r)), territory["id"], road_via[r["id"]], path, router, frame)
            lon, lat = ent["portal"]
            ent.update({"kind": "route", "bbox": [lon, lat, lon, lat], "center": [lon, lat], "stats": {"length_km": 0.0},
                        "segments": [], "speed": {"limits": []},
                        "engineering": {"length_km": 0.0, "bridge_km": 0.0, "tunnel_km": 0.0, "river_bridges": 0,
                                        "construction_usd": 0, "upkeep_usd_per_year": 0, "max_grade_permille": 0.0}})
            continue
        # stretches drawn under other routes' ids, so the route highlights end to end
        if shared := drawn_along(path, [(run, ln, pos) for ref, run, ln, pos in drawn_all if ref != r["ref"]]):
            shared_features.append(feature(to_lonlat(MultiLineString(shared), frame), {"id": r["id"]}))
        # a route wholly on other routes' corridors has no line or number of its own on the map
        lit_overrun(r["ref"], lines + shared, path, router)
        shown = lines or shared
        if not shown:
            log(f"  warn {r['ref']} has nothing drawn")
            continue
        geom = to_lonlat(shown[0] if len(shown) == 1 else MultiLineString(shown), frame)
        if lines:
            road_features.append(feature(geom, {
                "id": r["id"], "ref": r["ref"], "class": r["class"], "network": r["network"],
                "name_zh": r["names"]["zh"], "name_en": r["names"]["en"]}))
        longest = max(shown, key=lambda ln: ln.length)
        ent = entities.setdefault(r["id"], {**r, "source": "generated:feeder-roads"})
        if "crossing" in r:  # this territory's part, joined to the other's through the tunnel by merge_crossings
            ent = cross_part(ent, territory["id"], road_via[r["id"]], path, router, frame)
        ent.update({"kind": "route", "bbox": bbox_lonlat(geom), "ancestors": in_territory,
                    "center": list(point_lonlat(frame, *longest.interpolate(0.5, normalized=True).coords[0]).coords[0]),
                    "stats": {"length_km": round(frame.km(sum(line_length_km(ln.coords) for ln in shown)), 1)}})
        if r["network"].startswith("territorial_") and territory.get("route_shield"):
            ent["shield_style"] = territory["route_shield"]
        if r["network"] in SEGMENTED_NETWORKS:
            ent["segments"] = route_segments(path, router, dist_r, 4, frame, [d["id"] for d in districts])
            for sg in ent["segments"]:
                i0, i1 = sg["_span"]
                sg["lines"] = drawn_lonlat(drawn_along(path[i0:i1 + 1], [(run, ln, pos) for _, run, ln, pos in drawn_all])) or [sg["line"]]
                del sg["line"]
            # travel length, including junction stretches drawn under another route's number
            ent["stats"]["length_km"] = round(sum(s["km"] for s in ent["segments"]), 1)
        if r["network"] in standards:
            engineer(ent, path, standards[r["network"]], router, r["ref"] if r["network"] != "municipal_road" else None)
        for sg in ent.get("segments", []):
            sg.pop("_span", None)

    ss = eng.get("street_speed", {})

    def street_speed(st):
        if st.cls == "arterial" and density_of(districts[st.district]["id"]) < ss.get("outer_density", 0):
            return ss.get("arterial_outer")
        return ss.get(st.cls)

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
            "speed": {"limits": [street_speed(st)]},
        }
    if street_out:
        log(f"  {len(street_features)} streets, {len(street_named)} named arterials and collectors")
    to_map = lambda g: to_lonlat(affinity.scale(g, 1 / frame.scale, 1 / frame.scale, origin=(0, 0)), frame, 6)
    building_features = [tile_minzoom(feature(to_map(g), {"class": cls}), BUILDING_MINZOOM) for cls, g in building_out]
    park_features = [tile_minzoom(feature(to_map(g), {"class": "park"}), BUILDING_MINZOOM) for g in park_out]
    if building_out:
        log(f"  {len(building_features)} buildings, {len(park_features)} parks, {len(sites)} landmark sites")

    # Skyways: enclosed walkways over the arterials and collectors within skyways_km of a district's
    # centre, with a short link to each landmark near them.
    skyway_features = []
    for _, _, ctx, city_sites in street_out:
        for i, c in ctx.items():
            if not c.get("skyways_km"):
                continue
            zone = c["built"].intersection(Point(c["core"]).buffer(c["skyways_km"], quad_segs=32))
            mains = [g for cls, g in c["lines"] if cls in ("arterial", "collector")]
            net = shapely.union_all(mains).intersection(zone) if mains else None
            if net is None or net.is_empty:
                continue
            links = [LineString(nearest_points(site.exterior, net)) for _, site, _, j in city_sites
                     if j == i and 0 < site.distance(net) < SKYWAY_LINK_KM]
            parts = [p for p in streets.pieces(net) if p.length > 0.05] + links
            skyway_features += [feature(to_map(p), {"class": "skyway"}) for p in parts]
            entities[districts[i]["id"]].setdefault("stats", {})["skyways_km"] = round(sum(p.length for p in parts), 1)
            log(f"  {c['name']}: {sum(p.length for p in parts):.0f} km of skyways")

    rail_network = {r["id"]: r["network"] for r, _, _ in rail_out}
    rail_features = [feature(to_lonlat(ln, frame), {"network": rail_network[rid], "role": "track"})
                     for rid, runs in rail_drawn.items() for _, ln in runs]
    station_features = []

    def add_line(eid, line_km, props, decimals=5, drawn=None):
        """drawn: the line as the map draws it (the track it owns), if not line_km itself."""
        geom = to_lonlat(line_km, frame, decimals)
        rail_features.append(feature(to_lonlat(drawn, frame, decimals) if drawn is not None else geom, {"id": eid, "role": "line", **props}))
        mid = line_km.interpolate(0.5, normalized=True)
        return {"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, mid.x, mid.y).coords[0]),
                "stats": {"length_km": round(frame.km(line_km.length), 1)}}

    rail_paths = {r["id"]: path for r, _, path in rail_out}
    rail_pos = {rid: [(run, ln, run_positions(run, ln, rail_router.xy)) for run, ln in runs] for rid, runs in rail_drawn.items()}
    for r, full, ids in rail_lines:
        ent = entities[r["id"]]
        if "crossing" in r:
            ent = cross_part(ent, territory["id"], stops_here(r, territory["id"], lambda v: v in stop_index), rail_paths[r["id"]], rail_router, frame)
        own_lines = [ln for _, ln in rail_drawn[r["id"]]]
        others = [(run, ln, pos) for rid, runs in rail_pos.items() if rid != r["id"] for run, ln, pos in runs]
        shared = drawn_along(rail_paths[r["id"]], others)
        # a line wholly on other lines' track is clicked and lit on that track
        lit_overrun(r["names"]["zh"], own_lines + shared if own_lines else shared, rail_paths[r["id"]], rail_router)
        own = MultiLineString(own_lines or shared)
        if shared and own_lines:
            shared_features.append(feature(to_lonlat(MultiLineString(shared), frame), {"id": r["id"]}))
        ent.update({"class": "rail", "via": ids, **add_line(r["id"], full, {"network": r["network"], "color": r.get("color"),
                                                                        "name_zh": r["names"]["zh"], "name_en": r["names"]["en"]}, drawn=own)})
        if rail_std := standards.get(r["network"]):
            built_here = sum(1 for sid in dict.fromkeys(ids) if stations[sid]["lines"][0] == r["id"])
            engineer(ent, rail_paths[r["id"]], rail_std, rail_router, r["id"], built_here)
            ent["tech"] = {**rail_std.get("tech", {}), **r.get("tech", {})}
    log(f"  FAIL lit beyond its own path when clicked: {overruns}" if overruns else "  ok   every route and railway lit only along its own path")
    for ml in metro_lines:
        line_km = affinity.scale(ml["geom"], 1 / s, 1 / s, origin=(0, 0))
        entities[ml["id"]] = {
            "id": ml["id"], "kind": "route", "network": "metro", "class": "metro", "status": "generated", "names": ml["names"],
            "color": ml["color"], "via": ml["stations"], "ancestors": [ml["city"], *world.ancestors(ml["city"])], "source": "generated:metro",
            "tech": {**eng.get("metro_tech", {}), **(spec.get("metro") or {}).get("tech", {})},
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
        station_features.append(feature(pt, {"id": sid, "kind": "freight" if st.get("freight") else "rail" if rail else "metro", "transfer": len(lines) > 1,
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
    terminals.update({f"{PORTAL}:{territory['id']}:{r['id']}": path[-1] if road_via[r["id"]][-1] == PORTAL else path[0]
                      for r, path in road_out if PORTAL in road_via.get(r["id"], ())})
    node_cells, edges, places = build_graph(
        [(ri, r["class"], path) for ri, (r, path) in enumerate(road_out)], terminals, router.nx, frame.km(router.res))

    def ll(xy):
        return [round(v, 5) for v in frame.to_lonlat(np.asarray(xy))]

    graph["roads"] = [r["id"] for r, _ in road_out]
    graph["nodes"] = [ll(router.xy(c)) for c in node_cells]
    for a, b, length, minutes, ri, chain in edges:
        pts = np.array([router.xy(c) for c in chain])
        line = smooth_line(pts, 0.7, 3) if len(pts) > 2 else LineString(pts)
        graph["edges"].append([a, b, length, minutes, ri, [ll(p) for p in line.coords]])
    graph["places"] = places
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
    # Archipelagos: a named group of the named islands listed in `islands`.
    island_of = {fe["id"]: c for c, fe in coast_feats["matched"] if c["kind"] == "island" and c.get("geom") is not None}
    for fe in world.region_features(spec):
        if fe["subtype"] != "archipelago":
            continue
        members = [island_of[i] for i in fe.get("islands", []) if i in island_of]
        if not members:
            log(f"  WARN {fe['id']} {fe['names']['zh']}: none of its islands were found")
            continue
        geom = shapely.union_all([c["geom"] for c in members])
        at = shapely.convex_hull(geom).centroid
        pt = point_lonlat(frame, at.x, at.y)
        props = {"id": fe["id"], "kind": "archipelago", "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]}
        label_features.append(feature(pt, {**props, "rank": 4, "major": True}))
        chains = [[c["district"], *world.ancestors(c["district"])] for c in members]
        common = [a for a in chains[0] if all(a in ch for ch in chains)]
        entities[fe["id"]].update({"bbox": bbox_lonlat(to_lonlat(geom, frame)), "center": list(pt.coords[0]),
                                   "stats": {"area_km2_mapped": round(frame.km2(geom.area), 1), "islands": len(members)},
                                   "ancestors": common})
    check_expectations(spec.get("expect", {}), entities)

    layers = {k: [] for k in LAYERS}
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
    layers["route-shared"] += shared_features
    layers["streets"] += street_features
    layers["streets-named"] += street_named
    layers["buildings"] += building_features
    layers["parks"] += park_features
    layers["skyways"] += skyway_features
    layers["landmarks"] += landmark_features
    layers["rail"] += rail_features
    layers["stations"] += station_features
    layers["bathymetry"] += bath_features
    layers["context"] += ctx_features

    log("writing terrain tiles")
    bounds = frame.bounds_lonlat()
    n = cached_dem_tiles(dem_dir, territory["id"], np.where(land, np.maximum(lake_basins(elev, lakes, g.res), 1.0), -40.0), g, frame,
                         bounds, use_cache)
    log(f"  {n} tiles")
    meta = {
        "id": territory["id"],
        "bounds": bbox_lonlat(terr_ll),
        "frame_bounds": [round(v, 5) for v in bounds],
        "center": list(point_lonlat(frame, *pole_of_inaccessibility(land, g.xs, g.ys)).coords[0]),
        "quality": {"max_city_area_error": round(city_err, 4), "max_district_area_error": round(dist_err, 4)},
    }
    changed = {k: v for k, v in entities.items() if base.get(k) != v}
    return {"region": meta, "entities": changed, "layers": layers, "graph": graph, "candidates": candidate_report}
