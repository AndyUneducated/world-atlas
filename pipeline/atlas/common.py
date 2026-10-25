"""Small helpers shared by the build stages: logging, ids, GeoJSON features, line smoothing."""
from __future__ import annotations

import hashlib
import json
import time

import numpy as np
from shapely.geometry import LineString, Point, mapping
from shapely.ops import substring

from .grid import chaikin
from .world import ROOT


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


def undrawn_steps(path: list[int], runs: list[list[int]]) -> int:
    """How many steps of `path` lie on none of the drawn runs: stretches a click on the route would leave unlit."""
    drawn = {frozenset(p) for run in runs for p in zip(run, run[1:])}
    return sum(1 for a, b in zip(path, path[1:]) if a != b and frozenset((a, b)) not in drawn)


def fill_undrawn(paths: dict, runs: dict[str, list[list[int]]]):
    """Add to each route's runs the steps of its path that no route draws (where it passes straight from one
    route's corridor onto another's, or a stub too short to keep), so every route is drawn end to end."""
    drawn = {frozenset(p) for rs in runs.values() for run in rs for p in zip(run, run[1:])}
    for key, path in paths.items():
        prev = None
        for a, b in zip(path, path[1:]):
            if a == b or (step := frozenset((a, b))) in drawn:
                continue
            drawn.add(step)
            if prev is not None and prev[-1] == a:
                prev.append(b)
            else:
                prev = [a, b]
                runs[key].append(prev)


def drawn_along(cells: set[int], drawn: list[tuple[list[int], LineString]], xy) -> list[LineString]:
    """The stretches of the drawn lines that run along `cells`; drawn: [(run of cells, the line drawn for it)],
    xy(cell): the cell centre. Each stretch is cut out of a drawn line, so it lies exactly on the map's line."""
    out = []
    for run, line in drawn:
        k = 0
        while k < len(run):
            if run[k] not in cells:
                k += 1
                continue
            j = k
            while j + 1 < len(run) and run[j + 1] in cells:
                j += 1
            a = 0.0 if k == 0 else line.project(Point(xy(run[k])))
            b = line.length if j == len(run) - 1 else line.project(Point(xy(run[j])))
            if j > k and b > a:
                out.append(substring(line, a, b))
            k = j + 1
    return out
