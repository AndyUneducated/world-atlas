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
from shapely.geometry import LineString, MultiLineString, mapping

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas.dem_tiles import write_dem_tiles  # noqa: E402
from atlas.divisions import partition, pole_of_inaccessibility  # noqa: E402
from atlas.grid import Frame, Grid, block_reduce, chaikin, line_length_km, polyline_distance  # noqa: E402
from atlas.hydro import Drainage  # noqa: E402
from atlas.noise import value_noise  # noqa: E402
from atlas.terrain import drainage_surface, elevation, land_mask  # noqa: E402
from atlas.network import ROAD_RANK, build_graph  # noqa: E402
from atlas.transport import Router  # noqa: E402
from atlas.vectorize import point_lonlat, polygonize_labels, to_lonlat  # noqa: E402
from atlas.world import ROOT, World  # noqa: E402

OUT = ROOT / "public" / "data"
B32 = "0123456789abcdefghjkmnpqrstvwxyz"

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
    return {"type": "Feature", "id": props.get("id"), "properties": props, "geometry": mapping(geom)}


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


def lake_raster(g: Grid, center, radius, land):
    cx, cy = center
    ang = np.arctan2(g.Y - cy, g.X - cx)
    rr = radius * (1 + 0.28 * np.sin(3 * ang + 1) + 0.14 * np.sin(5 * ang + 2))
    return (np.hypot(g.X - cx, g.Y - cy) < rr) & land


def build_region(world: World, spec: dict, entities: dict, layers: dict, graph: dict):
    seed = spec["seed"]
    frame = Frame(spec["frame"]["origin_lonlat"], spec["frame"]["size_km"])
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
    total_area = sum(c["area_km2"] for c in cities)

    log(f"{territory['names']['en']}: land & terrain")
    land = land_mask(spec, seed, g, total_area)

    log("partitioning divisions")
    warp = layout.get("boundary_warp_km", 4)
    wx = g.X + warp * value_noise(seed + 101, 30, 5, 0.5, (g.w, g.h), g.shape)
    wy = g.Y + warp * value_noise(seed + 202, 30, 5, 0.5, (g.w, g.h), g.shape)
    anchors = [layout["cities"][c["id"]] for c in cities]
    city_r, city_err, land = partition(land, wx, wy, anchors, [c["area_km2"] for c in cities], g.cell)
    dist_r = np.full(g.shape, -1)
    dist_errs = np.zeros(len(districts))
    for ci, c in enumerate(cities):
        idx = [i for i, dc in enumerate(district_city) if dc == ci]
        cmask = city_r == ci
        ax, ay = anchors[ci]
        r = 0.42 * math.sqrt(c["area_km2"])
        seeds = [(ax + r * layout["districts"][districts[i]["id"]][0], ay + r * layout["districts"][districts[i]["id"]][1]) for i in idx]
        sub, err, fitted = partition(cmask, wx, wy, seeds, [districts[i]["area_km2"] for i in idx], g.cell, sea=~land)
        land = (land & ~cmask) | fitted
        city_r[cmask & ~fitted] = -1
        city_r[fitted] = ci
        for k, i in enumerate(idx):
            dist_r[sub == k] = i
            dist_errs[i] = err[k]
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
    stream_features = []
    for chain, acc in drain.river_chains(min_km2):
        cy, cx = np.divmod(np.array(chain), gc.nx)
        line = smooth_line(np.column_stack([gc.xs[cx], gc.ys[cy]]), 0.35, 3)
        stream_features.append(feature(to_lonlat(line, frame), {"magnitude": round(acc, 1)}))
    named_rivers = []
    for nr in spec["hydrology"].get("named_rivers", []):
        di = next(i for i, d in enumerate(districts) if d["id"] == nr["through"])
        through = block_reduce(dist_r == di, 2, "mean") > 0.5
        stem = drain.main_stem(through, min_km2)
        if not stem:
            continue
        cy, cx = np.divmod(np.array(stem), gc.nx)
        line = smooth_line(np.column_stack([gc.xs[cx], gc.ys[cy]]), 0.35, 3)
        fe = world.features[nr["feature"]]
        mouth_acc = float(drain.acc.ravel()[stem[-2]])
        named_rivers.append((fe, line, mouth_acc))

    log("bathymetry")
    dsea = ndimage.distance_transform_edt(~land_c) * gc.res
    bands = np.digitize(dsea, [4, 12, 30])
    bands[land_c] = -1
    bath_polys = polygonize_labels(bands, gc.res, smooth=3, simplify_km=0.1)

    log("routing roads")
    land_r = block_reduce(land, 4, "mode_bool")
    elev_r = block_reduce(elev, 4, "mean")
    water_r = block_reduce(water, 4, "mode_bool")
    router = Router(elev_r, land_r & ~water_r, gr.res)
    node = [router.cell(*poles[core[ci]]) for ci in range(len(cities))]
    city_index = {c["id"]: ci for ci, c in enumerate(cities)}
    road_out = []
    routes = sorted(
        (r for r in world.routes.values() if all(v in city_index for v in r["via"])),
        key=lambda r: (ROAD_RANK[r["class"]], r["ref"]),
    )
    for r in routes:
        path = []
        for a, b in zip(r["via"][:-1], r["via"][1:]):
            leg = router.route(node[city_index[a]], node[city_index[b]], r.get("tunnel_cost"), ref=r["ref"])
            path += leg if not path else leg[1:]
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

    log("exporting")
    palette_index = {c["id"]: ci for ci, c in enumerate(cities)}
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
            "stats": {"area_km2_mapped": round(geom_km.area, 1), **elev_stats(mask),
                      **({"density_per_km2": density} if density else {})},
        })

    terr = territory
    add_division(terr, terr_poly, pole_of_inaccessibility(land, g.xs, g.ys), land, {"palette": -1, "rank": 0})
    label_features.append(feature(point_lonlat(frame, *pole_of_inaccessibility(land, g.xs, g.ys)), {
        "id": terr["id"], "kind": "dependency", "name_zh": terr["short_names"]["zh"], "name_en": terr["short_names"]["en"], "rank": 0}))
    for ci, c in enumerate(cities):
        add_division(c, city_polys[ci], poles[core[ci]], city_r == ci, {"palette": ci, "city": c["id"], "rank": 1})
        is_capital = terr.get("capital") == c["id"]
        label_features.append(feature(point_lonlat(frame, *poles[core[ci]]), {
            "id": c["id"], "kind": "locality", "name_zh": c["names"]["zh"], "name_en": c["names"]["en"],
            "capital": is_capital, "population": c["population"], "palette": ci,
            "rank": 1 if is_capital else (2 if c["population"] >= 1_000_000 else 3)}))
    for i, d in enumerate(districts):
        ci = district_city[i]
        add_division(d, dist_polys[i], poles[i], dist_r == i, {"palette": ci, "city": cities[ci]["id"], "rank": 2})
        label_features.append(feature(point_lonlat(frame, *poles[i]), {
            "id": d["id"], "kind": "borough", "name_zh": d["names"]["zh"], "name_en": d["names"]["en"],
            "population": d["population"], "palette": ci, "rank": 4}))

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
                              "stats": {"area_km2_mapped": round(poly.area, 1)}})

    named_features = []
    for fe, line, acc in named_rivers:
        geom = to_lonlat(line, frame)
        named_features.append(feature(geom, {"id": fe["id"], "name_zh": fe["names"]["zh"], "name_en": fe["names"]["en"]}))
        mid = line.interpolate(0.5, normalized=True)
        entities[fe["id"]].update({"bbox": bbox_lonlat(geom), "center": list(point_lonlat(frame, mid.x, mid.y).coords[0]),
                                   "stats": {"length_km": round(line_length_km(line.coords), 1), "drainage_km2": round(acc)}})

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
                    "stats": {"length_km": round(sum(line_length_km(ln.coords) for ln in lines), 1)}})

    terminals = {c["id"]: node[ci] for ci, c in enumerate(cities)}
    terminals.update({d["id"]: node[district_city[i]] if i == core[district_city[i]] else router.cell(*poles[i])
                      for i, d in enumerate(districts)})
    node_cells, edges, places = build_graph(
        [(ri, r["class"], path) for ri, (r, path) in enumerate(road_out)], terminals, router.nx, router.res)

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
        cw, ch = ctx["extent_km"]
        cg = Grid((cw, ch), 0.5)
        rng = np.random.default_rng(ctx["seed"])
        f = np.zeros(cg.shape)
        for _ in range(ctx["islands"]):
            cx, cy, r = rng.uniform(0.15 * cw, 0.85 * cw), rng.uniform(0.15 * ch, 0.85 * ch), rng.uniform(10, 26)
            f += np.exp(-((cg.X - cx) ** 2 + (cg.Y - cy) ** 2) / r ** 2)
        f += 0.25 * value_noise(ctx["seed"] + 5, 30, 5, 0.5, (cw, ch), cg.shape)
        polys = polygonize_labels(np.where(f > 0.55, 0, -1), cg.res, simplify_km=0.15)
        if 0 in polys:
            ox, oy = ctx["offset_km"]
            moved = affinity.translate(polys[0], g.w / 2 + ox - cw / 2, g.h / 2 + oy - ch / 2)
            ctx_features.append(feature(to_lonlat(moved, frame), {"id": ctx["id"], "name_zh": ctx["names"]["zh"], "name_en": ctx["names"]["en"]}))

    layers["divisions"] += div_features
    layers["labels"] += label_features
    layers["water"] += water_features
    layers["rivers"] += stream_features
    layers["rivers-named"] += named_features
    layers["ridges"] += ridge_features
    layers["roads"] += road_features
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
        ent = {k: v for k, v in e.items() if not k.startswith("_")}
        ent["source"] = e.get("_source")
        if eid in world.divisions or eid in world.countries:
            ent["kind"] = "division"
            ent["ancestors"] = world.ancestors(eid)
            ent["children"] = [c["id"] for c in sorted(world.children(eid), key=lambda d: d.get("codes", {}).get("admin", ""))]
        elif eid in world.features:
            ent["kind"] = "natural"
        elif eid in world.routes:
            ent["kind"] = "route"
        out[eid] = ent
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    world = World()
    errors = world.validate()
    if errors:
        print("Source validation failed:")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    log(f"sources ok: {len(world.divisions)} divisions, {len(world.features)} features, {len(world.routes)} routes")
    if args.check:
        return
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    entities = base_entities(world)
    layers = {k: [] for k in ("divisions", "labels", "water", "rivers", "rivers-named", "ridges", "roads", "bathymetry", "context")}
    graph = {"nodes": [], "edges": [], "roads": [], "places": {}}
    regions = [build_region(world, spec, entities, layers, graph) for spec in world.generators]
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
