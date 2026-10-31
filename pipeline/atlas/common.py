"""Small helpers shared by the build stages: logging, ids, GeoJSON features, line smoothing."""
from __future__ import annotations

import hashlib
import json
import time

import numpy as np
from shapely.geometry import LineString, mapping
from shapely.ops import substring

from .grid import chaikin
from .world import ROOT


OUT = ROOT / "public" / "data"
B32 = "0123456789abcdefghjkmnpqrstvwxyz"
LOG_TAG = ""  # the region a build worker process is on, so the regions' interleaved lines stay apart


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {LOG_TAG}{msg}", flush=True)


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


def smooth_pinned(run: list[int], pins: set[int], xy, simplify_km: float, iterations: int) -> LineString:
    """A run of cells smoothed between its pinned cells, which stay at their centres: pin the junctions (where
    any drawn run starts or ends) and every line meeting there passes the same point."""
    cuts = [i for i in range(1, len(run) - 1) if run[i] in pins] + [len(run) - 1]
    coords, start = [xy(run[0])], 0
    for i in cuts:
        coords += list(smooth_line(np.array([xy(c) for c in run[start:i + 1]]), simplify_km, iterations).coords)[1:]
        start = i
    return LineString(coords)


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
    # a route that runs wholly on earlier routes' corridors draws nothing of its own
    return [run for run in runs if len(run) >= 3]


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


def run_positions(run: list[int], line: LineString, xy) -> list[float]:
    """Distance along `line`, the line drawn for `run`, of each of its cells.

    Each cell is placed just ahead of the previous one rather than at the nearest point of the whole line, so
    a line that comes back near itself (a ring road, a hairpin) can't put a cell on the wrong stretch."""
    p = np.asarray(line.coords)[:, :2]
    seg = p[1:] - p[:-1]
    seg_len = np.hypot(seg[:, 0], seg[:, 1])
    cum = np.concatenate([[0.0], np.cumsum(seg_len)])
    pos, s = [0.0], 0
    for c0, c1 in zip(run, run[1:]):
        q = np.asarray(xy(c1), float)
        reach = pos[-1] + 3 * float(np.hypot(*(q - np.asarray(xy(c0), float)))) + 1e-9
        e = max(min(int(np.searchsorted(cum, reach)), len(seg)), s + 1)
        best, at, si = None, pos[-1], s
        for i in range(s, e):
            if seg_len[i] == 0:
                continue
            t = float(np.clip(np.dot(q - p[i], seg[i]) / seg_len[i] ** 2, 0, 1))
            d = float(np.hypot(*(p[i] + t * seg[i] - q)))
            if best is None or d < best:
                best, at, si = d, cum[i] + t * seg_len[i], i
        s = si
        pos.append(max(float(at), pos[-1]))
    pos[-1] = float(cum[-1])
    return pos


def drawn_along(path: list[int], drawn: list[tuple[list[int], LineString, list[float]]]) -> list[LineString]:
    """The stretches of the drawn lines that `path` travels along; drawn: [(run of cells, the line drawn for it,
    run_positions)]. A stretch counts only where the path takes the same steps as the run, and each is cut out
    of a drawn line, so it lies exactly on the map's line."""
    steps = {frozenset(p) for p in zip(path, path[1:]) if p[0] != p[1]}
    out = []
    for run, line, pos in drawn:
        k = 0
        while k < len(run) - 1:
            if frozenset((run[k], run[k + 1])) not in steps:
                k += 1
                continue
            j = k + 1
            while j + 1 < len(run) and frozenset((run[j], run[j + 1])) in steps:
                j += 1
            if pos[j] > pos[k]:
                out.append(substring(line, pos[k], pos[j]))
            k = j
    return out
