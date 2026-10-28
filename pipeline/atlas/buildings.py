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
piers, sheds; clipped to the coast), dug-basin harbours (moles with container, bulk, oil and
ro-ro terminals, rail yard, breakwaters), offshore island ports (joined to the shore by a sea
bridge, see build.fit_site) and spaceports (launch and landing pads, assembly hall), and the
military and space facilities: airbases, radars, antenna arrays, air-defence sites, training ranges,
plants, engine test stands, silo fields, bunkers, launch tracks, camps and heliports.
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


HARBOUR_BASIN_KM = 0.42  # width of a dug basin between two moles
APRON_KM = 0.06          # quay apron along the water's edge


def _terminal(kind: str, x0, x1, y0, y1) -> list[tuple[str, Polygon]]:
    """Yard of one harbour terminal on a mole [x0, x1] × [y0, y1] (local km, quay front at y1,
    a rail spur up the middle)."""
    xm = (x0 + x1) / 2
    parts = [("paved", box(x0, y0, x0 + APRON_KM, y1)), ("paved", box(x1 - APRON_KM, y0, x1, y1)),
             ("paved", box(x0, y1 - APRON_KM, x1, y1))]
    ix0, ix1, iy0, iy1 = x0 + APRON_KM + 0.05, x1 - APRON_KM - 0.05, y0 + 0.08, y1 - APRON_KM - 0.06
    if kind == "container":
        xs = np.arange(ix0, ix1 - 0.03, 0.046)
        xs = xs[np.abs(xs + 0.015 - xm) > 0.045]
        ys = np.arange(iy0, iy1 - 0.24, 0.27)
        X, Y = (a.ravel() for a in np.meshgrid(xs, ys))
        parts += [("stack", b) for b in shapely.box(X, Y, X + 0.03, Y + 0.24)]
        parts += [("building", box(xm + 0.06, iy0 - 0.06, xm + 0.2, iy0 - 0.01))]
    elif kind == "bulk":
        for x in np.arange(ix0, ix1 - 0.12, 0.17):
            if abs(x + 0.06 - xm) < 0.08:
                continue
            parts.append(("bulk", box(x + 0.03, iy0 + 0.1, x + 0.09, iy1 - 0.3).buffer(0.03, quad_segs=4)))
            parts.append(("paved", box(x + 0.135, iy0 + 0.05, x + 0.143, y1 - APRON_KM)))
        parts += [("tank", Point(x, iy1 - 0.12).buffer(0.024, quad_segs=6)) for x in np.arange(ix0 + 0.03, ix1, 0.07)]
    elif kind == "oil":
        X, Y = (a.ravel() for a in np.meshgrid(np.arange(ix0 + 0.05, ix1 - 0.04, 0.13), np.arange(iy0 + 0.05, iy1 - 0.04, 0.13)))
        parts += [("tank", Point(x, y).buffer(0.045, quad_segs=8)) for x, y in zip(X, Y) if abs(x - xm) > 0.07]
    elif kind == "roro":
        X, Y = (a.ravel() for a in np.meshgrid(np.arange(ix0, ix1 - 0.18, 0.21), np.arange(iy0 + 0.25, iy1 - 0.12, 0.16)))
        parts += [("lot", b) for b in shapely.box(X, Y, X + 0.19, Y + 0.14) if abs(b.centroid.x - xm) > 0.1]
        parts += [("building", box(x, iy0, x + 0.24, iy0 + 0.16)) for x in (ix0, ix1 - 0.24)]
        parts += [("paved", box(x0 - 0.05, y1 - 0.16, x0, y1 - 0.04)), ("paved", box(x1, y1 - 0.16, x1 + 0.05, y1 - 0.04))]
    return parts


def _harbour(cx, cy, W, D, terminals, rng) -> tuple[Polygon, list[tuple[str, Polygon]]]:
    """Dug-basin harbour: a quay front reclaimed out from the shore (+y is the sea), basins cut back
    into it between moles (one terminal each, in `terminals` order along local x), a rail yard and
    warehouses behind, and breakwaters enclosing the outer harbour. An oil terminal at either end
    is left outside the breakwaters with its own jetty."""
    yq, yb = cy + 0.2 * D, cy - 0.23 * D
    xa, xz = cx - 0.46 * W, cx + 0.46 * W
    m = len(terminals)
    mw = (xz - xa - (m - 1) * HARBOUR_BASIN_KM) / m
    parts: list[tuple[str, Polygon]] = []
    moles = []
    for k, kind in enumerate(terminals):
        x0 = xa + k * (mw + HARBOUR_BASIN_KM)
        moles.append((x0, x0 + mw))
        parts += _terminal(kind, x0, x0 + mw, yb, yq)
        xm = x0 + mw / 2
        parts.append(("rail", box(xm - 0.006, yb - 0.14, xm + 0.006, yq - 0.15)))
        if k < m - 1:
            parts.append(("basin", box(x0 + mw, yb, x0 + mw + HARBOUR_BASIN_KM, yq + 0.01)))
    for k in range(6):
        y = yb - 0.14 - 0.028 * k
        parts.append(("rail", box(xa, y - 0.006, xz, y + 0.006)))
    back = box(xa, cy - D / 2 + 0.08, xz, yb - 0.36)
    parts += [("building", b) for b in _within(_grid(back.bounds, (0.2, 0.12), ((0.14, 0.18), (0.07, 0.09)), rng, centred=True), back)]

    yw, top = yq + 0.5 * (cy + D / 2 - yq), cy + 0.48 * D
    bx0, bx1 = xa - 0.2, xz + 0.2
    jetties = []
    for k in (0, m - 1):
        if terminals[k] == "oil" and m > 2:
            x0, x1 = moles[k]
            xm = (x0 + x1) / 2
            jetties += [box(xm - 0.012, yq, xm + 0.012, top), box(xm - 0.28, top - 0.05, xm + 0.28, top)]
            if k == 0:
                bx0 = x1 + HARBOUR_BASIN_KM / 2
            else:
                bx1 = x0 - HARBOUR_BASIN_KM / 2
    mid = (bx0 + bx1) / 2
    walls = [box(bx0 - 0.025, yq, bx0 + 0.025, yw), box(bx1 - 0.025, yq, bx1 + 0.025, yw),
             box(bx0 - 0.025, yw - 0.025, mid - 0.2, yw + 0.025), box(mid + 0.2, yw - 0.025, bx1 + 0.025, yw + 0.025)]
    parts += [("breakwater", w) for w in walls] + [("paved", j) for j in jetties]
    platform = box(cx - W / 2, cy - D / 2, cx + W / 2, yq)
    return shapely.union_all([platform, *walls, *jetties]), parts


def _offshore(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Deep-water container terminal on a reclaimed island: berths along the seaward +y side,
    stacks behind, gate and offices on the -y side (where the bridge lands)."""
    parts = [("paved", box(cx - W / 2, cy + D / 2 - 0.09, cx + W / 2, cy + D / 2))]
    xs = np.arange(cx - W / 2 + 0.12, cx + W / 2 - 0.15, 0.046)
    ys = np.arange(cy - D / 2 + 0.25, cy + D / 2 - 0.4, 0.27)
    X, Y = (a.ravel() for a in np.meshgrid(xs, ys))
    parts += [("stack", b) for b in shapely.box(X, Y, X + 0.03, Y + 0.24)]
    parts += [("paved", box(cx - W / 2, cy - D / 2, cx + W / 2, cy - D / 2 + 0.12))]
    parts += [("building", box(cx + x, cy - D / 2 + 0.14, cx + x + 0.16, cy - D / 2 + 0.22)) for x in (-0.5, -0.2, 0.1)]
    return parts


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


def _road(a, b, w=0.012):
    return ("paved", shapely.LineString([a, b]).buffer(w, cap_style="flat"))


def _airbase(cx, cy, W, D, variant, rng) -> list[tuple[str, Polygon]]:
    """Military airfield: runways along local x with a parallel taxiway on -y. fighter: hardened
    shelters on loops behind the taxiway; heavy: wide apron and big hangars; uav: one short runway
    and rows of small hangars; school: one runway, a ramp of trainers and a campus."""
    two = D >= 1.6 and variant in ("fighter", "heavy")
    ys = [0.3 * D, 0.3 * D - 0.42] if two else [0.32 * D]
    width = 0.06 if variant != "uav" else 0.035
    parts = [("runway", box(cx - 0.46 * W, cy + y - width / 2, cx + 0.46 * W, cy + y + width / 2)) for y in ys]
    ty = cy + min(ys) - 0.2
    parts.append(("paved", box(cx - 0.44 * W, ty - 0.0125, cx + 0.44 * W, ty + 0.0125)))
    for x in (-0.44, -0.2, 0.0, 0.2, 0.44):
        parts.append(("paved", box(cx + x * W - 0.0125, ty, cx + x * W + 0.0125, cy + max(ys))))
    base = cy - 0.5 * D + 0.06  # back edge of the base, -y
    if variant == "fighter":
        for side in (-1, 1):  # dispersal loops with shelters
            lx = cx + side * 0.28 * W
            loop = box(lx - 0.12 * W, base + 0.08, lx + 0.12 * W, ty - 0.1).exterior
            parts.append(("paved", loop.buffer(0.01)))
            parts.append(_road((lx, ty - 0.1), (lx, ty)))
            for k in range(10):
                p = loop.interpolate(k / 10, normalized=True)
                parts.append(("building", Point(p.x, p.y).buffer(0.024, quad_segs=6).intersection(box(p.x - 0.03, p.y - 0.018, p.x + 0.03, p.y + 0.03))))
        apron = box(cx - 0.12 * W, ty - 0.22, cx + 0.12 * W, ty - 0.02)
    else:
        apron = box(cx - 0.3 * W, ty - 0.3, cx + 0.3 * W, ty - 0.02) if variant == "heavy" else box(cx - 0.2 * W, ty - 0.16, cx + 0.2 * W, ty - 0.02)
    parts.append(("paved", apron))
    ax0, ay0, ax1, _ = apron.bounds
    if variant == "heavy":
        parts += [("building", box(x - 0.09, ay0 - 0.16, x + 0.09, ay0 - 0.01)) for x in np.linspace(ax0 + 0.1, ax1 - 0.1, 4)]
    elif variant == "uav":
        parts += [("building", box(x - 0.025, ay0 - 0.06, x + 0.025, ay0 - 0.01)) for x in np.arange(ax0 + 0.03, ax1 - 0.03, 0.07)]
        parts += [("building", box(x - 0.025, ay0 - 0.14, x + 0.025, ay0 - 0.09)) for x in np.arange(ax0 + 0.03, ax1 - 0.03, 0.07)]
    else:
        parts += [("building", box(x - 0.05, ay0 - 0.09, x + 0.05, ay0 - 0.01)) for x in (ax0 + 0.06, ax1 - 0.06)]
    parts.append(("building", Point(cx, ty - 0.27 if variant == "heavy" else ty - 0.2).buffer(0.01, quad_segs=4)))  # tower
    tx = cx + 0.4 * W
    parts += [("tank", Point(tx + dx, base + 0.06 + dy).buffer(0.018, quad_segs=6)) for dx in (-0.05, 0, 0.05) for dy in (0, 0.05)]
    if variant in ("fighter", "heavy"):  # ammunition bunkers in a fenced corner
        bx = cx - 0.42 * W
        parts += [("building", box(bx + i * 0.05, base + j * 0.05, bx + i * 0.05 + 0.025, base + j * 0.05 + 0.02)) for i in range(4) for j in range(2)]
    if variant == "school":
        cells = _grid((cx - 0.15 * W, base, cx + 0.15 * W, ty - 0.2), (0.08, 0.07), ((0.03, 0.05), (0.025, 0.04)), rng, jitter=0.005)
        parts += [("building", p) for p in cells if rng.random() > 0.3]
    else:  # living area
        cells = _grid((cx + 0.05 * W, base, cx + 0.3 * W, base + 0.14), (0.07, 0.06), ((0.035, 0.05), (0.015, 0.02)), rng)
        parts += [("building", p) for p in cells]
    return parts


def _radar(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """Radomes (dome) or a phased-array face (array) on a levelled pad; domes: telescope domes."""
    m = min(W, D)
    parts = [("paved", box(cx - 0.42 * W, cy - 0.42 * D, cx + 0.42 * W, cy + 0.42 * D))]
    if variant == "array":
        parts.append(("building", box(cx - 0.3 * W, cy + 0.05 * D, cx + 0.3 * W, cy + 0.25 * D)))
        parts.append(("building", box(cx - 0.12 * W, cy - 0.3 * D, cx + 0.12 * W, cy - 0.1 * D)))
        parts += [("dish", Point(cx + x * W, cy - 0.3 * D).buffer(0.05 * m, quad_segs=8)) for x in (-0.3, 0.3)]
    else:
        n = 3 if variant == "dome" else 4
        parts += [("dish", Point(cx + (k - (n - 1) / 2) * 0.24 * W, cy + 0.12 * D).buffer(0.1 * m, quad_segs=10)) for k in range(n)]
        parts.append(("building", box(cx - 0.2 * W, cy - 0.3 * D, cx + 0.2 * W, cy - 0.12 * D)))
    return parts


def _antenna(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """Dish antennas on a grid with an operations building; large: deep-space dishes (one big)."""
    parts: list[tuple[str, Polygon]] = []
    big = variant == "large"
    cols, rows = (3, 2) if big else (4, 2)
    for i in range(cols):
        for j in range(rows):
            x, y = cx + (i - (cols - 1) / 2) * W / cols * 0.9, cy + (j - (rows - 1) / 2) * D / rows * 0.7 + 0.08 * D
            r = (0.04 if big else 0.018) * (1.6 if big and i == 0 and j == 0 else 1)
            parts.append(("paved", box(x - 1.3 * r, y - 1.3 * r, x + 1.3 * r, y + 1.3 * r)))
            parts.append(("dish", Point(x, y).buffer(r, quad_segs=10)))
            parts.append(_road((x, y - 1.3 * r), (x, cy - 0.32 * D), 0.006))
    parts.append(_road((cx - 0.42 * W, cy - 0.32 * D), (cx + 0.42 * W, cy - 0.32 * D), 0.008))
    parts.append(("building", box(cx - 0.12 * W, cy - 0.46 * D, cx + 0.12 * W, cy - 0.36 * D)))
    return parts


def _sam(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Air-defence missile site: six launcher pads on a ring road around a radar and command post."""
    R = 0.36 * min(W, D)
    ring = Point(cx, cy).buffer(R, quad_segs=6).exterior
    parts = [("paved", ring.buffer(0.007))]
    for k in range(6):
        a = k * math.pi / 3
        x, y = cx + R * math.cos(a), cy + R * math.sin(a)
        parts.append(("pad", Point(x, y).buffer(0.03, quad_segs=6)))
        parts.append(_road((cx, cy), (x, y), 0.005))
    parts.append(("dish", Point(cx, cy).buffer(0.035, quad_segs=10)))
    parts.append(("building", box(cx + 0.05, cy - 0.06, cx + 0.12, cy - 0.02)))
    return parts


def _range(cx, cy, W, D, variant, rng) -> list[tuple[str, Polygon]]:
    """Training range: a camp and observation posts on the -y edge; air: target rings scattered
    across the ground; armor: looping tank tracks and firing points; cold: ski runs and huts."""
    parts: list[tuple[str, Polygon]] = []
    camp = (cx - 0.38 * W, cy - 0.42 * D)
    cells = _grid((camp[0] - 0.08 * W, camp[1] - 0.05 * D, camp[0] + 0.08 * W, camp[1] + 0.04 * D), (0.07, 0.05), ((0.03, 0.05), (0.015, 0.025)), rng)
    parts += [("building", p) for p in cells]
    if variant == "air":
        for _ in range(9):
            x, y = cx + rng.uniform(-0.35, 0.4) * W, cy + rng.uniform(-0.2, 0.4) * D
            parts += [("pad", Point(x, y).buffer(r, quad_segs=12).exterior.buffer(0.008)) for r in (0.05, 0.12)]
        parts += [("building", Point(cx + x * W, cy - 0.3 * D).buffer(0.012, quad_segs=4)) for x in (-0.1, 0.15, 0.4)]
    elif variant == "armor":
        for k in range(3):
            loop = affinity.scale(Point(cx + (k - 1) * 0.28 * W, cy + 0.05 * D).buffer(1, quad_segs=10), 0.12 * W, 0.3 * D).exterior
            parts.append(("paved", loop.buffer(0.012)))
        parts += [("paved", box(cx + x * W - 0.04, cy - 0.34 * D, cx + x * W + 0.04, cy - 0.3 * D)) for x in (-0.2, 0.0, 0.2)]
        parts.append(("lot", box(camp[0] + 0.1 * W, camp[1] - 0.04 * D, camp[0] + 0.2 * W, camp[1] + 0.03 * D)))
    else:  # cold-weather
        for k in range(5):
            x = cx + (k - 2) * 0.16 * W
            parts.append(("paved", shapely.LineString([(x, cy + 0.4 * D), (x + 0.04 * W, cy - 0.2 * D)]).buffer(0.018)))
        parts += [("building", box(cx + x * W - 0.02, cy + 0.38 * D, cx + x * W + 0.02, cy + 0.42 * D)) for x in (-0.3, 0.0, 0.3)]
    parts.append(_road(camp, (cx + 0.3 * W, cy - 0.42 * D)))
    return parts


def _plant(cx, cy, W, D, variant, rng) -> list[tuple[str, Polygon]]:
    """Industrial plants with a rail siding along -y. assembly: a tall vertical assembly building and
    long halls; propellant: tank farms and spheres; tunnel: wind tunnels as long tubes with spheres;
    hangar: wide hangars on an apron; depot: rows of warehouses; engine: hangars and test cells."""
    parts = [("rail", box(cx - 0.48 * W, cy - 0.44 * D - 0.006, cx + 0.48 * W, cy - 0.44 * D + 0.006))]
    parts.append(_road((cx - 0.48 * W, cy - 0.36 * D), (cx + 0.48 * W, cy - 0.36 * D), 0.01))
    if variant == "assembly":
        parts.append(("building", box(cx - 0.4 * W, cy - 0.25 * D, cx - 0.15 * W, cy + 0.3 * D)))
        parts += [("building", box(cx - 0.08 * W, y - 0.05 * D, cx + 0.42 * W, y + 0.05 * D)) for y in (cy - 0.15 * D, cy + 0.05 * D, cy + 0.25 * D)]
    elif variant == "propellant":
        X, Y = np.meshgrid(np.linspace(cx - 0.35 * W, cx + 0.1 * W, 5), np.linspace(cy - 0.15 * D, cy + 0.35 * D, 4))
        parts += [("tank", Point(x, y).buffer(0.035, quad_segs=8)) for x, y in zip(X.ravel(), Y.ravel())]
        parts += [("building", box(cx + 0.2 * W, cy - 0.25 * D, cx + 0.42 * W, cy + 0.0 * D)), ("building", box(cx + 0.2 * W, cy + 0.1 * D, cx + 0.42 * W, cy + 0.3 * D))]
    elif variant == "tunnel":
        for k, y in enumerate((cy - 0.15 * D, cy + 0.05 * D, cy + 0.25 * D)):
            parts.append(("building", box(cx - 0.42 * W, y - 0.012, cx + (0.25 - 0.1 * k) * W, y + 0.012)))
            parts.append(("tank", Point(cx + (0.33 - 0.1 * k) * W, y).buffer(0.05, quad_segs=10)))
        parts.append(("building", box(cx + 0.3 * W, cy - 0.3 * D, cx + 0.45 * W, cy - 0.2 * D)))
    elif variant == "hangar":
        parts.append(("paved", box(cx - 0.45 * W, cy + 0.1 * D, cx + 0.45 * W, cy + 0.45 * D)))
        parts += [("building", box(x - 0.11 * W, cy - 0.28 * D, x + 0.11 * W, cy + 0.08 * D)) for x in (cx - 0.3 * W, cx, cx + 0.3 * W)]
    elif variant == "engine":
        parts += [("building", box(x - 0.1 * W, cy - 0.25 * D, x + 0.1 * W, cy + 0.15 * D)) for x in (cx - 0.3 * W, cx)]
        parts += [("building", box(cx + 0.25 * W, y - 0.03, cx + 0.42 * W, y + 0.03)) for y in (cy - 0.1 * D, cy + 0.2 * D)]
    else:  # depot
        for y in np.arange(cy - 0.26 * D, cy + 0.4 * D, 0.13 * D):
            parts += [("building", box(x, y, x + 0.18 * W, y + 0.07 * D)) for x in (cx - 0.44 * W, cx - 0.22 * W, cx + 0.04 * W, cx + 0.26 * W)]
            parts.append(("rail", box(cx - 0.46 * W, y - 0.025 * D - 0.004, cx + 0.46 * W, y - 0.025 * D + 0.004)))
    return parts


def _test_stand(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Rocket engine test stands against the +y slope with flame trenches, propellant tanks and a
    control bunker at a safe distance on -y."""
    parts: list[tuple[str, Polygon]] = []
    for x in (-0.25, 0.05, 0.32):
        sx = cx + x * W
        parts.append(("building", box(sx - 0.03, cy + 0.2 * D, sx + 0.03, cy + 0.3 * D)))
        parts.append(("paved", box(sx - 0.012, cy + 0.3 * D, sx + 0.012, cy + 0.45 * D)))
        parts += [("tank", Point(sx + dx, cy + 0.1 * D).buffer(0.02, quad_segs=6)) for dx in (-0.04, 0.04)]
        parts.append(_road((sx, cy + 0.2 * D), (sx, cy - 0.3 * D), 0.008))
    parts.append(_road((cx - 0.4 * W, cy - 0.3 * D), (cx + 0.4 * W, cy - 0.3 * D), 0.01))
    parts.append(("building", box(cx - 0.1 * W, cy - 0.45 * D, cx + 0.1 * W, cy - 0.36 * D)))
    return parts


def _silo(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Interceptor silos on a grid of service roads, with a support compound on -y."""
    parts: list[tuple[str, Polygon]] = []
    xs, ys = np.linspace(cx - 0.36 * W, cx + 0.36 * W, 5), np.linspace(cy - 0.15 * D, cy + 0.38 * D, 4)
    for y in ys:
        parts.append(_road((xs[0], y), (xs[-1], y), 0.006))
        parts += [("pad", Point(x, y).buffer(0.014, quad_segs=8)) for x in xs]
    parts.append(_road((cx, ys[0]), (cx, cy - 0.38 * D), 0.008))
    parts += [("building", box(cx + x * W - 0.04, cy - 0.46 * D, cx + x * W + 0.04, cy - 0.38 * D)) for x in (-0.15, 0.0, 0.15)]
    return parts


def _bunker(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Surface of an underground command centre: portals in the +y hillside, vent shafts, a helipad,
    antennas and a guard post."""
    parts: list[tuple[str, Polygon]] = []
    for x in (-0.3, 0.0, 0.3):
        px = cx + x * W
        parts.append(("paved", box(px - 0.03, cy + 0.15 * D, px + 0.03, cy + 0.42 * D)))
        parts.append(("building", box(px - 0.04, cy + 0.38 * D, px + 0.04, cy + 0.44 * D)))
    parts.append(_road((cx - 0.3 * W, cy + 0.15 * D), (cx + 0.3 * W, cy + 0.15 * D)))
    parts.append(_road((cx, cy + 0.15 * D), (cx, cy - 0.45 * D)))
    parts += [("building", box(cx + x * W - 0.008, cy + 0.0 - 0.008, cx + x * W + 0.008, cy + 0.008)) for x in (-0.38, -0.15, 0.15, 0.38)]
    parts.append(("pad", Point(cx - 0.28 * W, cy - 0.25 * D).buffer(0.03, quad_segs=10)))
    parts += [("dish", Point(cx + x * W, cy - 0.25 * D).buffer(0.02, quad_segs=8)) for x in (0.2, 0.32)]
    parts.append(("building", box(cx - 0.03, cy - 0.45 * D, cx + 0.03, cy - 0.4 * D)))
    return parts


def _launch_track(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Electromagnetic launch track up the slope along local x: a loading terminal, power plant and
    capacitor halls at the low -x end, the guideway, and the exit portal at the high +x end."""
    x0, x1 = cx - 0.5 * W + 0.6, cx + 0.5 * W - 0.15
    parts = [("track", box(x0, cy - 0.012, x1, cy + 0.012))]
    parts += [("building", box(cx - 0.5 * W + 0.05, cy + y - 0.04, cx - 0.5 * W + 0.5, cy + y + 0.04)) for y in (-0.12, 0.12)]
    parts += [("tank", Point(cx - 0.5 * W + 0.1 + 0.08 * k, cy - 0.24).buffer(0.025, quad_segs=6)) for k in range(5)]
    parts.append(("building", box(x0 - 0.1, cy - 0.03, x0, cy + 0.03)))
    parts += [("building", box(x - 0.015, cy + 0.03, x + 0.015, cy + 0.06)) for x in np.linspace(x0 + 1.0, x1 - 0.5, max(2, int((x1 - x0) / 3)))]
    parts.append(("pad", box(x1, cy - 0.04, x1 + 0.1, cy + 0.04)))
    return parts


def _camp(cx, cy, W, D, variant, rng) -> list[tuple[str, Polygon]]:
    """Barracks compound: rows of barracks around a parade ground, motor pool and depots; hq adds a
    large headquarters building; hospital: a hospital block with a helipad; training: a centrifuge,
    a neutral-buoyancy pool and simulator halls."""
    parts = [("paved", box(cx - 0.12 * W, cy - 0.1 * D, cx + 0.12 * W, cy + 0.1 * D))]
    if variant == "training":
        parts.append(("building", Point(cx - 0.3 * W, cy + 0.25 * D).buffer(0.12 * min(W, D), quad_segs=16)))
        parts.append(("basin", box(cx + 0.18 * W, cy + 0.15 * D, cx + 0.4 * W, cy + 0.35 * D)))
        parts.append(("building", box(cx + 0.15 * W, cy - 0.38 * D, cx + 0.42 * W, cy - 0.18 * D)))
    elif variant == "hospital":
        parts.append(("building", box(cx - 0.35 * W, cy + 0.15 * D, cx + 0.35 * W, cy + 0.3 * D)))
        parts += [("building", box(cx + x * W - 0.06 * W, cy + 0.3 * D, cx + x * W + 0.06 * W, cy + 0.42 * D)) for x in (-0.25, 0.0, 0.25)]
        parts.append(("pad", Point(cx + 0.35 * W, cy - 0.3 * D).buffer(0.025, quad_segs=10)))
    else:
        if variant == "hq":
            parts.append(("building", box(cx - 0.1 * W, cy + 0.14 * D, cx + 0.1 * W, cy + 0.3 * D)))
        for side in (-1, 1):
            for k in range(4):
                x = cx + side * (0.2 + 0.07 * k) * W
                parts.append(("building", box(x - 0.025 * W, cy - 0.3 * D, x + 0.025 * W, cy + 0.3 * D)))
        parts.append(("lot", box(cx - 0.4 * W, cy - 0.45 * D, cx - 0.15 * W, cy - 0.35 * D)))
        parts += [("building", box(cx + x * W, cy - 0.45 * D, cx + (x + 0.08) * W, cy - 0.37 * D)) for x in (0.15, 0.27)]
    return parts


def _heliport(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Army aviation heliport: rows of helipads on a paved field, hangars and a tower on -y."""
    parts = [("paved", box(cx - 0.42 * W, cy - 0.05 * D, cx + 0.42 * W, cy + 0.4 * D))]
    for y in (cy + 0.07 * D, cy + 0.27 * D):
        parts += [("pad", Point(x, y).buffer(0.02, quad_segs=10)) for x in np.linspace(cx - 0.35 * W, cx + 0.35 * W, 6)]
    parts += [("building", box(x - 0.07 * W, cy - 0.35 * D, x + 0.07 * W, cy - 0.12 * D)) for x in (cx - 0.3 * W, cx - 0.1 * W, cx + 0.1 * W)]
    parts.append(("building", Point(cx + 0.32 * W, cy - 0.25 * D).buffer(0.01, quad_segs=4)))
    return parts


def _mine(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Open-pit mine: terraced benches and haul roads round the pit on -x; the processing plant,
    a stockpile, a vehicle lot and the tailings pond on +x."""
    pit = lambda f: affinity.scale(Point(cx - 0.18 * W, cy).buffer(1, quad_segs=24), f * 0.3 * W, f * 0.42 * D)
    parts = [("bulk" if k % 2 == 0 else "paved", pit(1 - 0.18 * k).difference(pit(0.82 - 0.18 * k))) for k in range(5)]
    parts.append(("building", box(cx + 0.18 * W, cy - 0.3 * D, cx + 0.34 * W, cy - 0.05 * D)))
    parts += [("building", box(cx + x * W, cy + 0.05 * D, cx + (x + 0.06) * W, cy + 0.2 * D)) for x in (0.18, 0.27)]
    parts.append(("bulk", Point(cx + 0.42 * W, cy - 0.3 * D).buffer(0.05 * min(W, D), quad_segs=8)))
    parts.append(("lot", box(cx + 0.38 * W, cy - 0.15 * D, cx + 0.46 * W, cy)))
    parts.append(("basin", box(cx + 0.18 * W, cy + 0.26 * D, cx + 0.46 * W, cy + 0.44 * D)))
    return parts


def landmark(layout: str, center, angle: float, size, rng, land=None, terminals=(), variant=None) -> tuple[Polygon, list[tuple[str, Polygon]]]:
    """Site outline and parts [(kind, polygon)] of a landmark; kind is building, or for transport
    and military facilities runway, pad, paved (aprons, taxiways, quays, piers), basin (dug harbour
    water, pools), breakwater, stack (containers), bulk (stockpiles), tank, dish (antennas and
    radomes), lot (vehicle parking), rail or track (an electromagnetic launch guideway).
    Local x points along `angle`; the front of a city landmark is at -x, a port faces the sea on +y.
    `land` (needed by ports) is the land area around the site; `terminals` lists a harbour's moles;
    `variant` picks a military layout's kind (see MILITARY_VARIANTS in world.py)."""
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
    elif layout == "dome":
        outline = affinity.scale(Point(cx, cy).buffer(1, quad_segs=24), W / 2, D / 2)
        parts = [("building", affinity.scale(Point(cx, cy).buffer(1, quad_segs=24), 0.46 * W, 0.46 * D))]
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
    elif layout == "harbour":
        outline, parts = _harbour(cx, cy, W, D, list(terminals), rng)
    elif layout == "offshore_port":
        parts = _offshore(cx, cy, W, D)
    elif layout == "airbase":
        parts = _airbase(cx, cy, W, D, variant or "fighter", rng)
    elif layout == "radar":
        parts = _radar(cx, cy, W, D, variant or "dome")
    elif layout == "antenna":
        parts = _antenna(cx, cy, W, D, variant or "small")
    elif layout == "sam":
        parts = _sam(cx, cy, W, D)
    elif layout == "range":
        parts = _range(cx, cy, W, D, variant or "air", rng)
    elif layout == "plant":
        parts = _plant(cx, cy, W, D, variant or "depot", rng)
    elif layout == "test_stand":
        parts = _test_stand(cx, cy, W, D)
    elif layout == "silo":
        parts = _silo(cx, cy, W, D)
    elif layout == "bunker":
        parts = _bunker(cx, cy, W, D)
    elif layout == "launch_track":
        parts = _launch_track(cx, cy, W, D)
    elif layout == "camp":
        parts = _camp(cx, cy, W, D, variant or "barracks", rng)
    elif layout == "heliport":
        parts = _heliport(cx, cy, W, D)
    elif layout == "mine":
        parts = _mine(cx, cy, W, D)
    parts = [(k, p) for k, p in parts if not p.is_empty]
    return rotate(outline, angle, center), [(k, rotate(p, angle, center)) for k, p in parts]
