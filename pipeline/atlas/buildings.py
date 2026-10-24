"""Building footprints of city blocks and landmark sites (all lengths real km).

Blocks are what is left of a district's built-up area after cutting out the street corridors.
Each block gets one typology, drawn in the block's own frame aligned with the street grid:
- slabs: parallel rows of residential slabs (行列式), the common Chinese housing estate
- towers: point towers on a square grid
- perimeter: courtyard blocks, a ring of buildings along the block edge with gaps
- podium: commercial buildings filling most of the block
- houses: small detached houses along the block edge, gardens behind
- industrial: large sheds with yards
- civic: a few mid-sized buildings (schools, offices)
- park: no buildings; the block becomes a park
Which typology a block gets depends on the district style and the block's distance from the
district centre. Landmark sites (from the places list) are laid out by their own templates,
including the transport facilities: airports (runways, taxiways, apron, terminal), ports (quay,
piers, sheds; clipped to the coast) and spaceports (launch and landing pads, assembly hall).
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import shapely
from shapely import affinity
from shapely.geometry import Point, Polygon, box

STREET_HALF_WIDTH = {"arterial": 0.016, "collector": 0.011, "local": 0.0065}
MIN_BLOCK_KM2 = 0.0015
TYPOLOGY_CLASS = {"slabs": "residential", "towers": "residential", "perimeter": "residential", "houses": "residential",
                  "podium": "commercial", "industrial": "industrial", "civic": "civic"}

# typology weights per style for the centre (r < 0.3), middle (r < 0.8) and edge of a district
MIX = {
    "planned": ({"podium": 45, "towers": 30, "perimeter": 10, "park": 7, "civic": 8},
                {"slabs": 55, "towers": 12, "perimeter": 10, "podium": 6, "park": 7, "civic": 10},
                {"slabs": 45, "industrial": 30, "houses": 10, "park": 10, "civic": 5}),
    "mixed": ({"perimeter": 45, "podium": 25, "towers": 10, "park": 8, "civic": 12},
              {"perimeter": 30, "slabs": 25, "houses": 25, "park": 8, "civic": 7, "towers": 5},
              {"houses": 45, "industrial": 30, "slabs": 10, "park": 10, "civic": 5}),
    "organic": ({"perimeter": 50, "houses": 30, "podium": 10, "park": 5, "civic": 5},
                {"houses": 70, "perimeter": 12, "park": 7, "civic": 5, "industrial": 6},
                {"houses": 60, "industrial": 25, "park": 10, "civic": 5}),
}


@dataclass
class Building:
    geom: Polygon
    cls: str


def rotate(geoms, angle: float, origin):
    """Rotate geometries (array or single) by `angle` radians about `origin`."""
    c, s = math.cos(angle), math.sin(angle)
    ox, oy = origin
    rot = np.array([[c, s], [-s, c]])
    return shapely.transform(geoms, lambda xy: (xy - (ox, oy)) @ rot + (ox, oy))


def corridors(streets: list[tuple[str, object]]):
    """Area taken by streets [(class, line)], widened per class."""
    return shapely.union_all([shapely.buffer(g, STREET_HALF_WIDTH[cls], cap_style="flat") for cls, g in streets])


def blocks(built, taken) -> list[Polygon]:
    """Block polygons: the built-up area minus `taken` (street corridors, landmark sites)."""
    rest = built.difference(taken) if taken is not None else built
    parts = getattr(rest, "geoms", [rest])
    return [p for p in parts if p.geom_type == "Polygon" and p.area >= MIN_BLOCK_KM2]


def _grid(bounds, cell, size, rng, jitter=0.0, centred=False):
    """Boxes of `size` (w, h) ranges centred on a grid of `cell` (w, h) spacing over `bounds`.
    centred: the grid sits symmetrically in the bounds instead of at a random offset."""
    x0, y0, x1, y1 = bounds
    if centred:
        ox, oy = ((x1 - x0) % cell[0] + cell[0]) / 2, ((y1 - y0) % cell[1] + cell[1]) / 2
    else:
        ox, oy = rng.uniform(0, cell[0]), rng.uniform(0, cell[1])
    xs = np.arange(x0 + ox, x1, cell[0])
    ys = np.arange(y0 + oy, y1, cell[1])
    if not len(xs) or not len(ys):
        return np.array([], dtype=object)
    X, Y = (a.ravel() for a in np.meshgrid(xs, ys))
    if jitter:
        X = X + rng.uniform(-jitter, jitter, X.size)
        Y = Y + rng.uniform(-jitter, jitter, Y.size)
    w = rng.uniform(*size[0], X.size)
    h = rng.uniform(*size[1], X.size)
    return shapely.box(X - w / 2, Y - h / 2, X + w / 2, Y + h / 2)


def _within(boxes, area):
    if not len(boxes) or area.is_empty:
        return []
    return list(boxes[shapely.within(boxes, area)])


def _typology(kind: str, local: Polygon, rng: np.random.Generator, thin: float) -> list[Polygon]:
    """Footprints for one block already rotated into its grid frame."""
    b = local.bounds
    inset = lambda d: local.buffer(-d, join_style="mitre")
    if kind == "slabs":
        length = rng.uniform(0.06, 0.09)
        return _within(_grid(b, (length + rng.uniform(0.012, 0.02), rng.uniform(0.04, 0.05)),
                             ((length, length), (0.012, 0.015)), rng, centred=True), inset(0.012))
    if kind == "towers":
        side = rng.uniform(0.022, 0.03)
        step = rng.uniform(0.06, 0.075)
        return _within(_grid(b, (step, step), ((side, side), (side, side)), rng, centred=True), inset(0.015))
    if kind == "perimeter":
        depth = rng.uniform(0.012, 0.016)
        ring = inset(0.006).difference(inset(0.006 + depth))
        seg = rng.uniform(0.035, 0.06)
        cells = _grid(b, (seg, seg), ((seg - 0.004, seg - 0.004), (seg - 0.004, seg - 0.004)), rng)
        parts = [p for p in shapely.intersection(cells, ring) if not p.is_empty]
        out = []
        for p in parts:
            for q in getattr(p, "geoms", [p]):
                if q.geom_type == "Polygon" and q.area > 0.00008 and rng.random() > 0.08:
                    out.append(q)
        return out
    if kind == "podium":
        core = inset(0.01)
        if local.area < 0.025:
            return [core.simplify(0.002)] if core.geom_type == "Polygon" and core.area > 0.0005 else []
        cells = _grid(b, (0.07, 0.07), ((0.058, 0.058), (0.058, 0.058)), rng)
        parts = [p for p in shapely.intersection(cells, core) if p.geom_type == "Polygon" and p.area > 0.0006]
        return parts
    if kind == "houses":
        cell = (rng.uniform(0.016, 0.022), rng.uniform(0.018, 0.024))
        boxes = _grid(b, cell, ((0.009, 0.013), (0.01, 0.014)), rng, jitter=0.002)
        keep = _within(boxes, inset(0.004))
        garden = inset(0.034)
        if not garden.is_empty:
            keep = [h for h in keep if not h.intersects(garden)]
        return [h for h in keep if rng.random() > 0.15 + thin]
    if kind == "industrial":
        boxes = _grid(b, (rng.uniform(0.06, 0.09), rng.uniform(0.05, 0.07)), ((0.035, 0.07), (0.025, 0.05)), rng, centred=True)
        return [h for h in _within(boxes, inset(0.012)) if rng.random() > 0.2]
    if kind == "civic":
        boxes = _grid(b, (0.09, 0.07), ((0.04, 0.06), (0.018, 0.03)), rng)
        return _within(boxes, inset(0.015))[:3]
    return []


def _pick(weights: dict, rng) -> str:
    names = list(weights)
    w = np.array([weights[k] for k in names], float)
    return names[rng.choice(len(names), p=w / w.sum())]


def district_buildings(block_list, style: str, core, angle: float, radius: float, rng,
                       mix: dict | None = None) -> tuple[list[Building], list[Polygon]]:
    """Buildings and parks of one district's blocks. mix: factors on the style's typology weights."""
    out: list[Building] = []
    parks: list[Polygon] = []
    bands = [{k: w * (mix or {}).get(k, 1.0) for k, w in MIX[style][b].items()} for b in range(3)]
    for blk in block_list:
        c = blk.centroid
        r = math.hypot(c.x - core[0], c.y - core[1]) / max(radius, 0.1)
        band = 0 if r < 0.3 else 1 if r < 0.8 else 2
        kind = _pick(bands[band], rng)
        if blk.area < 0.004 and kind in ("slabs", "industrial", "towers", "park"):
            kind = "houses" if style != "planned" else "podium"
        if kind == "park":
            parks.append(blk.buffer(-0.004, join_style="mitre"))
            continue
        a = angle + (0 if style == "planned" else rng.normal(0, 0.05))
        local = rotate(blk, -a, (c.x, c.y))
        thin = 0.5 * max(0.0, (r - 0.7) / 0.5)
        for g in _typology(kind, local, rng, thin):
            out.append(Building(rotate(g, a, (c.x, c.y)), TYPOLOGY_CLASS[kind]))
    return out, [p for p in parks if not p.is_empty]


def _airport(site, cx, cy, W, D, rng) -> list[tuple[str, Polygon]]:
    """Runways along local x; terminal and apron on the -y side (or between two runways)."""
    strip = lambda y, w, x0=-0.45, x1=0.45: box(cx + x0 * W, cy + y - w / 2, cx + x1 * W, cy + y + w / 2)
    two = D >= 1.35
    runways = [0.36 * D, -0.36 * D] if two else [0.3 * D]
    term_y = 0.0 if two else -0.18 * D
    parts = [("runway", strip(y, 0.06)) for y in runways]
    taxi = [y - math.copysign(0.17, y) for y in runways]
    parts += [("paved", strip(y, 0.025, -0.42, 0.42)) for y in taxi]
    for x in (-0.42, -0.15, 0.15, 0.42):
        for y, ty in zip(runways, taxi):
            parts.append(("paved", box(cx + x * W - 0.0125, cy + min(y, ty), cx + x * W + 0.0125, cy + max(y, ty))))
    apron_y = (min(taxi) + 0.02, max(taxi) - 0.02) if two else (term_y + 0.04, taxi[0] - 0.0125)
    parts.append(("paved", box(cx - 0.2 * W, cy + apron_y[0], cx + 0.2 * W, cy + apron_y[1])))
    if not two:
        parts.append(("paved", box(cx - 0.2 * W, cy + term_y - 0.05, cx + 0.2 * W, cy + term_y + 0.05)))
    hall = box(cx - 0.12 * W, cy + term_y - 0.045, cx + 0.12 * W, cy + term_y + 0.045)
    piers = [box(cx + x * W - 0.012, cy + term_y - 0.11, cx + x * W + 0.012, cy + term_y + 0.11) for x in (-0.08, 0.0, 0.08)]
    parts.append(("building", shapely.union_all([hall, *piers])))
    parts.append(("building", Point(cx + 0.15 * W, cy + term_y + 0.1).buffer(0.008, quad_segs=4)))
    for k in range(3):
        x = 0.27 + 0.055 * k
        parts.append(("building", box(cx + x * W - 0.035, cy + term_y - 0.04, cx + x * W + 0.035, cy + term_y + 0.03)))
    parts.append(("building", box(cx - 0.3 * W - 0.05, cy + term_y - 0.06, cx - 0.3 * W + 0.05, cy + term_y + 0.02)))
    return parts


def _port(site, local_land, cx, cy, W, D, rng) -> tuple[Polygon, list[tuple[str, Polygon]]]:
    """Quay along the coast, piers out to sea on +y, sheds behind on land; `local_land` in the site frame."""
    ashore = site.intersection(local_land)
    sea = site.difference(local_land)
    quay = ashore.intersection(sea.buffer(0.09)) if not sea.is_empty else Polygon()
    n = max(1, round(W / 0.45))
    pw = min(0.07, W / 10)
    piers = []
    for k in range(n):
        x = cx - W / 2 + (k + 0.5) * W / n
        pier = box(x - pw / 2, cy - 0.1 * D, x + pw / 2, cy + 0.42 * D).intersection(site).difference(local_land.buffer(-0.01))
        piers += [p for p in getattr(pier, "geoms", [pier]) if p.geom_type == "Polygon" and p.area > 0.002]
    yard = ashore.difference(quay.buffer(0.02))
    big = W >= 1.0
    sheds = []
    if not yard.is_empty:
        cells = _grid(yard.bounds, (0.16, 0.1) if big else (0.09, 0.07), ((0.1, 0.13), (0.045, 0.07)) if big else ((0.05, 0.07), (0.03, 0.045)), rng)
        sheds = [p for p in _within(cells, yard.buffer(-0.015)) if rng.random() > 0.2]
    outline = shapely.union_all([ashore, *piers])
    parts = [("paved", q) for q in getattr(quay, "geoms", [quay]) if q.geom_type == "Polygon" and q.area > 0.001]
    parts += [("paved", p) for p in piers] + [("building", s) for s in sheds]
    return outline, parts


def _spaceport(site, cx, cy, W, D, rng) -> list[tuple[str, Polygon]]:
    """Launch pads along the +y side, landing pads, assembly hall and control centre on -y,
    a crawlerway linking them; large sites add a runway for spaceplanes."""
    r = min(0.12, 0.09 * D)
    pads = [(cx + x * W, cy + 0.28 * D) for x in (-0.32, 0.0, 0.32)]
    parts: list[tuple[str, Polygon]] = []
    hall = (cx - 0.3 * W, cy - 0.3 * D)
    road = [((hall[0], hall[1]), (hall[0], cy + 0.08 * D)), ((pads[0][0], cy + 0.08 * D), (pads[-1][0], cy + 0.08 * D))]
    road += [((x, cy + 0.08 * D), (x, y)) for x, y in pads]
    for a, b in road:
        parts.append(("paved", shapely.LineString([a, b]).buffer(0.02, cap_style="flat")))
    for x, y in pads:
        parts.append(("paved", box(x - 1.7 * r, y - 1.7 * r, x + 1.7 * r, y + 1.7 * r)))
        parts.append(("pad", Point(x, y).buffer(r, quad_segs=12)))
        parts.append(("building", box(x + 1.1 * r, y - 0.3 * r, x + 1.5 * r, y + 0.3 * r)))
    for x in (0.16, -0.16):
        parts.append(("pad", Point(cx + x * W, cy + 0.02 * D).buffer(0.55 * r, quad_segs=12)))
    parts.append(("building", box(hall[0] - 0.09, hall[1] - 0.07, hall[0] + 0.09, hall[1] + 0.07)))
    parts.append(("building", box(cx - 0.05 * W - 0.06, cy - 0.32 * D - 0.035, cx - 0.05 * W + 0.06, cy - 0.32 * D + 0.035)))
    for k in range(4):
        x = cx + (0.08 + 0.06 * k) * W
        parts.append(("building", box(x - 0.04, cy - 0.34 * D - 0.025, x + 0.04, cy - 0.34 * D + 0.025)))
    if W >= 5:
        parts.append(("runway", box(cx - 0.05 * W, cy - 0.12 * D - 0.035, cx + 0.45 * W, cy - 0.12 * D + 0.035)))
    return parts


def landmark(layout: str, center, angle: float, size, rng, land=None) -> tuple[Polygon, list[tuple[str, Polygon]]]:
    """Site outline and parts [(kind, polygon)] of a landmark; kind is building, or for transport
    facilities runway, pad or paved (aprons, taxiways, quays, piers). Local x points along `angle`;
    the front of a city landmark is at -x, a port faces the sea on +y. `land` (needed by ports)
    is the land area around the site."""
    W, D = size
    cx, cy = center
    site = box(cx - W / 2, cy - D / 2, cx + W / 2, cy + D / 2)
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts: list[tuple[str, Polygon]] = []
    outline = site
    if layout == "complex":
        hall = rel(0.02, -0.16, 0.36, 0.16).union(Point(cx + 0.12 * W, cy).buffer(0.09 * min(W, D), quad_segs=12))
        parts = [("building", p) for p in (hall, rel(-0.32, 0.3, 0.38, 0.44), rel(-0.32, -0.44, 0.38, -0.3), rel(0.4, -0.3, 0.46, 0.3))]
    elif layout == "hall":
        parts = [("building", rel(-0.1, -0.32, 0.38, 0.32))]
    elif layout == "market":
        parts = [("building", rel(-0.4, -0.25, 0.4, 0.25))]
    elif layout == "tower":
        parts = [("building", Point(cx, cy).buffer(0.22 * min(W, D), quad_segs=2))]
    elif layout == "stadium":
        oval = lambda f: affinity.scale(Point(cx, cy).buffer(1, quad_segs=24), f * W / 2, f * D / 2 * 0.95)
        parts = [("building", oval(0.92).difference(oval(0.62)))]
    elif layout == "campus":
        cells = _grid(site.bounds, (W / 4, D / 3), ((W / 9, W / 6), (D / 10, D / 6)), rng, jitter=0.01)
        parts = [("building", p) for p in _within(cells, site.buffer(-0.03)) if rng.random() > 0.25]
    elif layout == "airport":
        parts = _airport(site, cx, cy, W, D, rng)
    elif layout == "spaceport":
        parts = _spaceport(site, cx, cy, W, D, rng)
    elif layout == "port":
        local_land = rotate(land.intersection(rotate(site, angle, center).buffer(0.2)), -angle, center) if land is not None else site
        outline, parts = _port(site, local_land, cx, cy, W, D, rng)
    return rotate(outline, angle, center), [(k, rotate(p, angle, center)) for k, p in parts]
