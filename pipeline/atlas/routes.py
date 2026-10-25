"""Routed lines: district segments, railways, and lines crossing between territories."""
from __future__ import annotations

import math

import numpy as np
from shapely.geometry import LineString

from . import engineering
from .grid import Frame
from .network import SPEED_KMH
from .transport import Router
from .vectorize import to_lonlat
from .world import World
from .common import bbox_lonlat, feature, log, smooth_line


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
            "_span": (i0, min(i1 + 1, len(path) - 1)),
        })
        chainage += km
    return segments


PORTAL = "portal"


def stops_here(r: dict, territory: str, is_stop) -> list | None:
    """The stops of route or railway r built in this territory: all its via, or for a line crossing
    to another territory (r["crossing"]: tunnel portal per territory) the stops here plus PORTAL on
    the side facing the other territory. None if the line is not built here."""
    if "crossing" not in r:
        return r["via"] if all(is_stop(v) for v in r["via"]) else None
    here = [v for v in r["via"] if is_stop(v)]
    if territory not in r["crossing"] or not here:
        return None
    return here + [PORTAL] if is_stop(r["via"][0]) else [PORTAL] + here


def land_cell(land: np.ndarray, res: float, x: float, y: float) -> int:
    """Index of the land cell of a coarse grid nearest the point (x, y), design km."""
    iy, ix = np.nonzero(land)
    k = int(np.argmin((ix + 0.5 - x / res) ** 2 + (iy + 0.5 - y / res) ** 2))
    return int(iy[k] * land.shape[1] + ix[k])


def cross_part(ent: dict, territory: str, via: list, path: list[int], router: Router, frame: Frame) -> dict:
    """A fresh record, filed under ent["_parts"], for this territory's part of a crossing line; its
    portal end (lon/lat) is where the tunnel to the other territory's part begins."""
    first = via[-1] == PORTAL
    end = path[-1] if first else path[0]
    part = {"territory": territory, "first": first, "portal": [round(float(v), 5) for v in frame.to_lonlat(np.asarray(router.xy(end)))]}
    ent.setdefault("_parts", []).append(part)
    return part


def merge_crossings(world: World, entities: dict, layers: dict, graph: dict):
    """Join the two territory parts of each crossing line through its straight undersea tunnel: one
    entity (length, sections, cost, stations), the tunnel on the map, and a tunnel edge in the road graph."""
    standards, climate = world.engineering.get("standards", {}), world.engineering.get("climate", {})
    frames = {s["territory"]: Frame(s["frame"]["origin_lonlat"], s["frame"]["size_km"], s["frame"].get("scale", 1.0)) for s in world.generators}
    for r in [*world.routes.values(), *world.railways.values()]:
        if "crossing" not in r:
            continue
        ent = entities[r["id"]]
        parts = ent.pop("_parts", [])
        if len(parts) != 2:
            log(f"  WARN {r['names']['zh']}: built in {len(parts)} of the 2 territories it crosses")
            continue
        a, b = sorted(parts, key=lambda p: not p["first"])
        f = frames[a["territory"]]
        (ax, bx), (ay, by) = f.from_lonlat([a["portal"][0], b["portal"][0]], [a["portal"][1], b["portal"][1]])
        km = float(math.hypot(bx - ax, by - ay) * f.scale)
        tunnel = LineString([a["portal"], b["portal"]])
        names = {"name_zh": r["names"]["zh"], "name_en": r["names"]["en"]}
        if r["id"] in world.railways:
            layers["rail"] += [feature(tunnel, {"network": r["network"], "role": "track", "tunnel": True}),
                               feature(tunnel, {"id": r["id"], "role": "line", "network": r["network"], "color": r.get("color"), "tunnel": True, **names})]
        else:
            layers["roads"].append(feature(tunnel, {"id": r["id"], "ref": r["ref"], "class": r["class"], "network": r["network"], "tunnel": True, **names}))
        std = standards.get(r["network"], {})
        a_km = a["stats"]["length_km"]
        ent.update({k: a[k] for k in ("kind", "class", "tech") if k in a})
        ent.update({
            "bbox": [min(a["bbox"][0], b["bbox"][0]), min(a["bbox"][1], b["bbox"][1]), max(a["bbox"][2], b["bbox"][2]), max(a["bbox"][3], b["bbox"][3])],
            "center": list(tunnel.interpolate(0.5, normalized=True).coords[0]),
            "ancestors": world.ancestors(a["territory"]),
            "territories": [a["territory"], b["territory"]],
            "stats": {"length_km": round(a_km + km + b["stats"]["length_km"], 1), "undersea_tunnel_km": round(km, 1)},
        })
        if "via" in a:
            ent["via"] = a["via"] + b["via"]
        if "segments" in a:
            under = {"division": None, "from_km": round(a_km, 1), "km": round(km, 1), "bbox": bbox_lonlat(tunnel),
                     "lines": [[[round(x, 4), round(y, 4)] for x, y in tunnel.coords]]}
            if "speed" in std:
                under["speed_kmh"] = std["speed"]["min"]
            ent["segments"] = a["segments"] + [under] + [{**sg, "from_km": round(sg["from_km"] + a_km + km, 1)} for sg in b["segments"]]
        if "speed" in a:
            ent["speed"] = engineering.speed_summary([sg.get("speed_kmh") for sg in ent["segments"]])
        if "engineering" in a:
            ea, eb = a["engineering"], b["engineering"]
            merged = {k: ea.get(k, 0) + eb.get(k, 0) for k in ea.keys() | eb.keys()}
            c, u = std["cost_musd_per_km"], std["upkeep_kusd_per_km"]
            merged["length_km"] = round(merged["length_km"] + km, 1)
            merged["tunnel_km"] = round(merged["tunnel_km"] + km, 1)
            merged["bridge_km"] = round(merged["bridge_km"], 1)
            merged["construction_usd"] = engineering.round_money(merged["construction_usd"] + km * c["tunnel"] * 1e6 * climate.get("construction", 1))
            merged["upkeep_usd_per_year"] = engineering.round_money(merged["upkeep_usd_per_year"] + km * u["tunnel"] * 1e3 * climate.get("upkeep", 1))
            merged["max_grade_permille"] = max(ea.get("max_grade_permille", 0), eb.get("max_grade_permille", 0))
            ent["engineering"] = merged
            sa, sb = a.get("structures", {}), b.get("structures", {})
            ent["structures"] = {k: max(v, key=lambda s: s["km"]) for k in sa.keys() | sb.keys() if (v := [s for s in (sa.get(k), sb.get(k)) if s])}
            ent["structures"]["tunnel"] = {"names": r["tunnel_names"], "km": round(km, 1)}
        ends = [graph["places"].pop(f"{PORTAL}:{p['territory']}:{r['id']}", None) for p in (a, b)]
        if None not in ends:
            graph["edges"].append([ends[0], ends[1], round(km, 2), round(km / SPEED_KMH[r["class"]] * 60, 2), graph["roads"].index(r["id"]),
                                   [a["portal"], b["portal"]]])
        log(f"  {r.get('ref', r['names']['zh'])}: {km:.0f} km undersea tunnel between {entities[a['territory']]['names']['zh']} "
            f"and {entities[b['territory']]['names']['zh']}, {ent['stats']['length_km']:.0f} km in all")


def route_railways(world: World, router: Router, poles, stop_index: dict, territory: str, land: np.ndarray) -> list:
    """Route each railway between its stops, [(railway, stop district indices, path)]. Later lines run on
    the track of earlier ones wherever that is cheaper than new track."""
    out = []
    for r in world.railways.values():
        via = stops_here(r, territory, lambda v: v in stop_index)
        if not via:
            continue
        stops = [stop_index[v] for v in via if v != PORTAL]
        cells = [land_cell(land, router.res, *r["crossing"][territory]) if v == PORTAL else router.cell(*poles[stop_index[v]]) for v in via]
        path = []
        for a, b in zip(cells[:-1], cells[1:]):
            leg = router.route(a, b, r.get("tunnel_cost", 2.5))
            path += leg if not path else leg[1:]
        router.commit(path, "rail", discount=0.45, ref=r["id"])
        out.append((r, stops, path))
    return out
