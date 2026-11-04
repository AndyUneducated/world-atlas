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
plants, engine test stands, silo fields, bunkers, launch tracks, camps and heliports, and private
estates, detention centres, border crossings, vineyards, racing circuits, chip fabs, works (number
plates, wineries, toilet-paper recycling and tissue mills, a brewery, a car workshop), zoo houses,
clinics, triangular offices, shops, garden apartments, a ship-sized pool, an outdoor air plant, statue
squares, fashion buildings, a chip-shaped workshop, the houses of a brewery estate, a fruit plantation,
a spine-shaped clinic, a camera-shaped studio, an armoury, a shooting range, a chair-shaped museum and
a drone tower.
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


def _wall(poly, w=0.004) -> tuple[str, Polygon]:
    """A wall or fence along the edge of `poly`."""
    return ("wall", poly.exterior.buffer(w / 2))


def _villa(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Mansion in a W × D box, gate on -x: a drive to a round forecourt, the main house with two wings,
    a pool on its terrace with a fountain beyond, a tennis court, three guest houses, a garage with
    its car park and a helipad, on lawns inside a wall."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    m = min(W, D)
    parts = [("green", rel(-0.48, -0.48, 0.48, 0.48)), _wall(rel(-0.49, -0.49, 0.49, 0.49))]
    parts.append(_road((cx - 0.5 * W, cy), (cx - 0.24 * W, cy), 0.004 + 0.01 * m))
    parts.append(("paved", Point(cx - 0.24 * W, cy).buffer(0.07 * m, quad_segs=12)))
    parts.append(("building", shapely.union_all([rel(-0.16, -0.08, 0.04, 0.08), rel(-0.16, -0.22, -0.09, 0.22), rel(-0.03, -0.22, 0.04, 0.22)])))
    parts.append(("paved", rel(0.06, -0.13, 0.25, 0.13)))
    parts.append(("basin", rel(0.1, -0.06, 0.21, 0.06)))
    parts.append(("basin", Point(cx + 0.34 * W, cy).buffer(0.025 * m, quad_segs=10)))
    parts.append(("paved", box(cx + 0.33 * W - 0.018, cy + 0.3 * D - 0.009, cx + 0.33 * W + 0.018, cy + 0.3 * D + 0.009)))
    parts += [("building", rel(x, -0.42, x + 0.07, -0.33)) for x in (-0.32, -0.12, 0.08)]
    parts += [("building", rel(-0.42, 0.24, -0.3, 0.34)), ("lot", rel(-0.42, 0.1, -0.3, 0.21))]
    parts.append(("pad", Point(cx + 0.36 * W, cy - 0.32 * D).buffer(min(0.012, 0.06 * m), quad_segs=10)))
    return parts


def _estate(cx, cy, W, D, variant, rng) -> list[tuple[str, Polygon]]:
    """Private estate, gate on -x. villa: one mansion on its lawns (see _villa); compound: the mansion
    on the -x third, then a lake, a staff village and a private airstrip with a hangar along +y, all in
    one wall; bunker: a small house and helipads above a hollowed hill, with the bunker portal, air
    shafts and a guard post."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    if variant == "compound":
        parts = [("green", rel(-0.49, -0.49, 0.49, 0.49)), _wall(rel(-0.495, -0.495, 0.495, 0.495))]
        parts += _villa(cx - 0.3 * W, cy - 0.1 * D, 0.36 * W, 0.7 * D)[2:]
        parts.append(("basin", affinity.scale(Point(cx + 0.05 * W, cy - 0.15 * D).buffer(1, quad_segs=24), 0.1 * W, 0.18 * D)))
        cells = _grid((cx + 0.22 * W, cy - 0.44 * D, cx + 0.46 * W, cy + 0.05 * D), (0.03, 0.025), ((0.012, 0.018), (0.01, 0.014)), rng)
        parts += [("building", p) for p in cells]
        parts.append(_road((cx - 0.5 * W, cy - 0.1 * D), (cx + 0.34 * W, cy - 0.1 * D), 0.005))
        ry = cy + 0.36 * D
        parts.append(("runway", box(cx - 0.3 * W, ry - 0.015, cx + 0.45 * W, ry + 0.015)))
        parts.append(("paved", box(cx + 0.25 * W, ry - 0.09, cx + 0.42 * W, ry - 0.015)))
        parts.append(("building", box(cx + 0.28 * W, ry - 0.08, cx + 0.36 * W, ry - 0.03)))
        return parts
    if variant == "bunker":
        m = min(W, D)
        parts = [_wall(rel(-0.49, -0.49, 0.49, 0.49)), _wall(rel(-0.47, -0.47, 0.47, 0.47), 0.003)]
        parts.append(_road((cx - 0.5 * W, cy), (cx + 0.26 * W, cy), 0.008))
        parts.append(("building", box(cx - 0.47 * W, cy - 0.012, cx - 0.47 * W + 0.016, cy + 0.012)))
        parts.append(("green", box(cx - 0.2 * W - 0.05, cy + 0.03, cx - 0.2 * W + 0.05, cy + 0.11)))
        parts.append(("building", box(cx - 0.2 * W - 0.025, cy + 0.045, cx - 0.2 * W + 0.025, cy + 0.08)))
        parts += [("pad", Point(cx + x * W, cy - 0.25 * D).buffer(0.02, quad_segs=10)) for x in (-0.3, -0.2, -0.1)]
        parts.append(("paved", box(cx + 0.26 * W, cy - 0.05, cx + 0.26 * W + 0.12, cy + 0.05)))
        parts.append(("building", box(cx + 0.26 * W + 0.12, cy - 0.025, cx + 0.26 * W + 0.15, cy + 0.025)))
        step = 0.12 * m
        parts += [("tank", Point(x, y).buffer(0.012, quad_segs=8))
                  for x in np.arange(cx + 0.02 * W, cx + 0.44 * W, step) for y in np.arange(cy + 0.12 * D, cy + 0.44 * D, step)]
        return parts
    return _villa(cx, cy, W, D)


def _detention(cx, cy, W, D, rng) -> list[tuple[str, Polygon]]:
    """Detention centre, gate on -x: a double fence with watchtowers along it, the intake hall with a
    bus bay and car park at the gate, rows of cell blocks each with an exercise yard, container cells
    stacked in an overflow yard on +x and a helipad."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    outer, inner = rel(-0.49, -0.49, 0.49, 0.49), box(cx - 0.49 * W + 0.03, cy - 0.49 * D + 0.03, cx + 0.49 * W - 0.03, cy + 0.49 * D - 0.03)
    parts = [_wall(outer, 0.005), _wall(inner, 0.003)]
    ring = inner.exterior
    n = max(8, int(ring.length / 0.25))
    for k in range(n):
        p = ring.interpolate(k / n, normalized=True)
        parts.append(("building", box(p.x - 0.006, p.y - 0.006, p.x + 0.006, p.y + 0.006)))
    parts.append(("building", rel(-0.4, -0.16, -0.3, 0.16)))
    parts.append(("paved", rel(-0.47, -0.42, -0.4, -0.2)))
    parts.append(("lot", rel(-0.47, 0.2, -0.4, 0.42)))
    for half in (-1, 1):
        y0, y1 = (cy + 0.04 * D, cy + 0.4 * D) if half > 0 else (cy - 0.4 * D, cy - 0.04 * D)
        for x in np.arange(cx - 0.24 * W, cx + 0.2 * W, 0.06):
            parts.append(("building", box(x, y0, x + 0.02, y1)))
            parts.append(("paved", box(x + 0.026, y0 + 0.2 * (y1 - y0), x + 0.052, y1 - 0.2 * (y1 - y0))))
    for x in np.arange(cx + 0.26 * W, cx + 0.44 * W, 0.016):
        parts += [("stack", box(x, y, x + 0.012, y + 0.03)) for y in np.arange(cy - 0.4 * D, cy + 0.28 * D, 0.036)]
    parts.append(("pad", Point(cx + 0.36 * W, cy + 0.38 * D).buffer(0.014, quad_segs=10)))
    return parts


def _refugee(cx, cy, W, D, rng) -> list[tuple[str, Polygon]]:
    """Refugee camp, gate on -x: a fence, the reception centre, warehouse and lorry yard at the gate,
    a main lane along x crossed by gravel lanes into sectors of shelter rows, and on the first lanes
    a clinic, a school, a market lot and water tanks."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [_wall(rel(-0.49, -0.49, 0.49, 0.49), 0.003)]
    parts += [("paved", rel(-0.47, -0.22, -0.31, 0.22)), ("lot", rel(-0.47, 0.25, -0.33, 0.44))]
    parts += [("building", rel(-0.45, -0.18, -0.37, -0.04)), ("building", rel(-0.45, 0.04, -0.37, 0.18))]
    parts.append(("paved", box(cx - 0.31 * W, cy - 0.006, cx + 0.48 * W, cy + 0.006)))
    xs = np.linspace(cx - 0.28 * W, cx + 0.47 * W, 6)
    parts += [("paved", box(x - 0.004, cy - 0.47 * D, x + 0.004, cy + 0.47 * D)) for x in xs]
    services = [("building", rel(-0.26, 0.06, -0.17, 0.16)), ("building", rel(-0.26, -0.16, -0.16, -0.06)),
                ("lot", rel(-0.15, 0.03, -0.1, 0.12))]
    services += [("tank", Point(cx - 0.12 * W + 0.03 * k, cy - 0.09 * D).buffer(0.012, quad_segs=8)) for k in range(3)]
    parts += services
    keep_out = shapely.union_all([p for _, p in services]).buffer(0.01)
    for i in range(len(xs) - 1):
        x0, x1 = xs[i] + 0.012, xs[i + 1] - 0.012
        for y0, y1 in ((cy + 0.018, cy + 0.46 * D), (cy - 0.46 * D, cy - 0.018)):
            parts += [("building", p) for p in _grid((x0, y0, x1, y1), (0.036, 0.026), ((0.014, 0.02), (0.007, 0.01)), rng, centred=True)
                      if not p.intersects(keep_out)]
    return parts


def _checkpoint(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Border crossing, traffic along local x with the border on +x: a plaza of lanes split by
    islands and crossed by the inspection booths, gates in the wall at the +x edge, the
    secondary inspection sheds with their car park on -y and the main building and kennels on +y."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [("paved", rel(-0.49, -0.25, 0.49, 0.3))]
    for y in np.arange(cy - 0.24 * D + 0.012, cy + 0.29 * D, 0.012):
        parts.append(("lot", box(cx - 0.15 * W, y - 0.001, cx + 0.35 * W, y + 0.001)))
    parts.append(("building", rel(0.0, -0.25, 0.04, 0.3)))
    parts += [_wall(rel(0.45, -0.5, 0.47, -0.25), 0.006), _wall(rel(0.45, 0.3, 0.47, 0.5), 0.006)]
    parts += [("building", box(cx + 0.46 * W - 0.004, y - 0.002, cx + 0.46 * W + 0.004, y + 0.002)) for y in np.arange(cy - 0.24 * D, cy + 0.3 * D, 0.024)]
    parts += [("building", rel(x, -0.45, x + 0.12, -0.32)) for x in (-0.35, -0.15, 0.05)]
    parts.append(("lot", rel(-0.45, -0.3, 0.25, -0.27)))
    parts.append(("building", rel(-0.35, 0.34, 0.1, 0.46)))
    parts += [("building", rel(x, 0.36, x + 0.04, 0.44)) for x in (0.18, 0.25)]
    return parts


def _smooth(points, rounds=4):
    """Chaikin corner-cutting of a closed polygon given as [(x, y)]."""
    p = np.asarray(points, float)
    for _ in range(rounds):
        q = np.roll(p, -1, axis=0)
        p = np.stack([0.75 * p + 0.25 * q, 0.25 * p + 0.75 * q], axis=1).reshape(-1, 2)
    return p


def _vineyard(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """One grape variety's block, gate on -x: rows of vines (vine_red or vine_white) across local y on a
    cover crop, either side of a central track, rose bushes at the row ends, frost fans along the
    track, a headland track, a tool shed with its yard and an irrigation pond."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    kind = "vine_white" if variant == "white" else "vine_red"
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49))]
    parts.append(_road((cx - 0.5 * W, cy), (cx + 0.47 * W, cy), 0.004))
    parts.append(_road((cx - 0.44 * W, cy - 0.47 * D), (cx - 0.44 * W, cy + 0.47 * D), 0.003))
    step = min(0.02, max(0.01, 0.025 * min(W, D)))
    for y0, y1 in ((cy + 0.008, cy + 0.45 * D), (cy - 0.45 * D, cy - 0.008)):
        for x in np.arange(cx - 0.4 * W, cx + 0.45 * W, step):
            parts.append((kind, box(x, y0, x + 0.45 * step, y1)))
        for x in np.arange(cx - 0.4 * W, cx + 0.45 * W, 4 * step):
            yr = y1 + 0.004 if y1 > cy else y0 - 0.004
            parts.append(("pad", Point(x + 0.22 * step, yr).buffer(0.0025, quad_segs=6)))
    parts += [("tank", Point(x, cy).buffer(0.004, quad_segs=6)) for x in np.arange(cx - 0.3 * W, cx + 0.45 * W, 0.15)]
    parts.append(("paved", box(cx - 0.48 * W, cy + 0.3 * D, cx - 0.48 * W + 0.05, cy + 0.3 * D + 0.035)))
    parts.append(("building", box(cx - 0.48 * W + 0.005, cy + 0.3 * D + 0.017, cx - 0.48 * W + 0.03, cy + 0.3 * D + 0.032)))
    parts.append(("basin", Point(cx - 0.47 * W + 0.03, cy - 0.38 * D).buffer(min(0.03, 0.06 * min(W, D)), quad_segs=12)))
    return parts


CIRCUIT = [(-0.38, -0.36), (0.3, -0.36), (0.42, -0.3), (0.42, -0.14), (0.3, -0.04), (0.36, 0.1), (0.44, 0.26), (0.36, 0.4),
           (0.22, 0.32), (0.16, 0.14), (0.02, 0.06), (-0.08, 0.2), (-0.04, 0.36), (-0.2, 0.42), (-0.36, 0.34), (-0.3, 0.16),
           (-0.44, 0.06), (-0.46, -0.22)]


def _racetrack(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Private motor-racing circuit, gate on -y: the circuit (track) round a grassed infield, gravel traps
    at the hairpins, the pit lane, garages, race control and paddock inside the main straight on -y,
    grandstands and the spectator car park outside it, a karting track and skid pan in the infield and
    a drag strip along +y."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    loop = Polygon([(cx + x * W, cy + y * D) for x, y in _smooth(CIRCUIT)])
    parts = [("green", loop)]
    parts += [("bulk", Point(cx + x * W, cy + y * D).buffer(0.045 * min(W, D), quad_segs=12))
              for x, y in ((0.46, -0.36), (0.44, 0.43), (-0.48, -0.3), (-0.22, 0.46))]
    parts.append(("track", loop.exterior.buffer(0.008)))
    parts.append(("paved", rel(-0.3, -0.33, 0.24, -0.31)))
    parts += [("building", box(x, cy - 0.3 * D, x + 0.012, cy - 0.3 * D + 0.016)) for x in np.arange(cx - 0.26 * W, cx + 0.18 * W, 0.016)]
    parts.append(("building", box(cx - 0.04 * W - 0.03, cy - 0.3 * D, cx - 0.04 * W + 0.03, cy - 0.3 * D + 0.04)))
    parts.append(("lot", rel(-0.26, -0.26, 0.18, -0.18)))
    parts += [("building", rel(x, -0.44, x + 0.1, -0.415)) for x in (-0.3, -0.17, -0.04, 0.09)]
    parts.append(("building", rel(0.28, 0.43, 0.38, 0.455)))
    parts.append(("lot", rel(-0.46, -0.495, 0.3, -0.46)))
    parts.append(_road((cx - 0.5 * W, cy - 0.475 * D), (cx - 0.46 * W, cy - 0.475 * D), 0.008))
    kart = Polygon([(cx + x * W, cy + y * D) for x, y in _smooth([(-0.26, -0.12), (-0.04, -0.13), (-0.02, -0.04), (-0.12, -0.06),
                                                                   (-0.1, 0.0), (-0.2, 0.01), (-0.18, -0.06), (-0.27, -0.04)])])
    parts.append(("track", kart.exterior.buffer(0.004)))
    parts.append(("paved", Point(cx + 0.2 * W, cy - 0.16 * D).buffer(0.05 * min(W, D), quad_segs=16)))
    parts.append(("track", rel(-0.42, 0.465, 0.24, 0.485)))
    parts.append(("pad", Point(cx + 0.36 * W, cy - 0.47 * D).buffer(0.012, quad_segs=10)))
    return parts


def _fab(cx, cy, W, D, variant, rng) -> list[tuple[str, Polygon]]:
    """Semiconductor plant, gate on -x. logic and memory: cleanroom fab modules (memory: two, with a third
    pad cleared for the next) bridged to the central utility building, cooling towers, a bulk gas and
    chemical yard, ultrapure water and wastewater basins, a substation, offices and the staff car park;
    packaging: rows of assembly and test halls, a bonded warehouse and truck docks; mask: a compact
    mask shop and its utilities."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [_wall(rel(-0.495, -0.495, 0.495, 0.495), 0.004)]
    parts.append(_road((cx - 0.5 * W, cy - 0.3 * D), (cx + 0.46 * W, cy - 0.3 * D), 0.01))
    parts.append(("building", rel(-0.47, -0.22, -0.36, 0.0)))
    parts.append(("lot", rel(-0.47, -0.47, -0.12, -0.34)))
    if variant == "packaging":
        for y in (-0.22, 0.02, 0.24):
            parts += [("building", rel(x, y, x + 0.17, y + 0.17)) for x in (-0.3, -0.1, 0.1)]
        parts.append(("building", rel(0.3, -0.22, 0.46, 0.18)))
        parts.append(("paved", rel(0.3, 0.2, 0.46, 0.44)))
        parts += [("lot", rel(0.31, y, 0.45, y + 0.025)) for y in (0.24, 0.3, 0.36)]
        return parts
    if variant == "mask":
        parts.append(("building", rel(-0.25, -0.2, 0.2, 0.25)))
        parts.append(("building", rel(0.25, -0.15, 0.42, 0.1)))
        parts += [("tank", Point(cx + x * W, cy + 0.35 * D).buffer(0.01, quad_segs=8)) for x in (0.25, 0.3, 0.35, 0.4)]
        parts.append(("green", rel(-0.3, 0.3, 0.15, 0.45)))
        return parts
    modules = ((-0.32, -0.08), (-0.04, 0.2)) if variant == "memory" else ((-0.32, 0.2),)
    for x0, x1 in modules:
        parts.append(("building", rel(x0, -0.2, x1, 0.18)))
    if variant == "memory":
        parts.append(("paved", rel(-0.32, 0.22, 0.2, 0.42)))
    parts.append(("building", rel(0.25, -0.18, 0.36, 0.14)))
    parts += [("building", rel(modules[-1][1], y, 0.25, y + 0.015)) for y in (-0.08, 0.06)]
    parts += [("tank", Point(cx + 0.42 * W, cy + y * D).buffer(0.03 * min(W, D), quad_segs=12)) for y in np.linspace(-0.2, 0.14, 4)]
    gx, gy = np.meshgrid(np.linspace(-0.46, -0.38, 3), np.linspace(0.08, 0.2, 3))
    parts += [("tank", Point(cx + x * W, cy + y * D).buffer(0.008, quad_segs=8)) for x, y in zip(gx.ravel(), gy.ravel())]
    parts.append(("paved", rel(-0.47, 0.06, -0.37, 0.22)))
    parts += [("basin", rel(x, 0.3 if variant != "memory" else -0.47, x + 0.08, 0.38 if variant != "memory" else -0.4)) for x in (0.0, 0.1)]
    parts += [("basin", Point(cx + x * W, cy + 0.36 * D).buffer(0.035 * min(W, D), quad_segs=12)) for x in (0.3, 0.4)]
    parts.append(("paved", rel(-0.47, 0.3, -0.36, 0.44)))
    parts += [("building", rel(x, 0.34, x + 0.025, 0.4)) for x in (-0.45, -0.41)]
    return parts


def _works(cx, cy, W, D, variant, rng) -> list[tuple[str, Polygon]]:
    """Light industry, gate on -x. plates: a number-plate works, the aluminium coil yard, the blanking and
    embossing hall, the painting line and curing oven, a warehouse with truck docks and the visitor
    centre; winery: the crush pad, a fermentation hall and tank yard, the barrel cellar dug into the slope
    under a grassed roof, the bottling hall and the tasting room on its terrace with a pond; recycling: the
    sealed receiving hall, a grid of digesters, the sterilising tower, a press house and the clean-water
    ponds; tissue: the long paper-machine hall, the jumbo-roll and converting halls, a warehouse with
    truck docks and its yard; brewery: the brewhouse and its three copper kettles, the fermenting-tank
    yard, the tall dealcoholisation tower, the bottling hall, a warehouse with docks and a garden;
    garage: the main workshop, the paint booth and dyno cell, the parts store, a test strip and parking."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [_road((cx - 0.5 * W, cy), (cx - 0.3 * W, cy), 0.008), ("lot", rel(-0.48, -0.45, -0.32, -0.15))]
    if variant == "winery":
        parts.append(("paved", rel(-0.3, -0.12, -0.12, 0.12)))
        parts.append(("building", rel(-0.1, -0.2, 0.12, 0.05)))
        gx, gy = np.meshgrid(np.linspace(-0.08, 0.1, 6), np.linspace(0.12, 0.22, 3))
        parts.append(("paved", rel(-0.1, 0.08, 0.12, 0.26)))
        r = 0.3 * min(0.036 * W, 0.05 * D)
        parts += [("tank", Point(cx + x * W, cy + y * D).buffer(r, quad_segs=8)) for x, y in zip(gx.ravel(), gy.ravel())]
        parts.append(("green", rel(0.15, -0.4, 0.46, 0.0)))
        parts += [("building", rel(0.17, y, 0.44, y + 0.04)) for y in (-0.36, -0.26, -0.16, -0.06)]
        parts.append(("building", rel(0.15, 0.06, 0.32, 0.24)))
        parts.append(("green", rel(-0.3, 0.3, 0.46, 0.48)))
        parts.append(("building", rel(-0.2, 0.32, 0.05, 0.42)))
        parts.append(("paved", rel(0.05, 0.32, 0.18, 0.42)))
        parts.append(("basin", affinity.scale(Point(cx + 0.32 * W, cy + 0.39 * D).buffer(1, quad_segs=16), 0.1 * W, 0.06 * D)))
        return parts
    if variant == "recycling":
        parts.append(("building", rel(-0.3, -0.2, -0.08, 0.2)))
        gx, gy = np.meshgrid(np.linspace(0.0, 0.2, 4), np.linspace(-0.25, 0.25, 4))
        r = 0.32 * min(0.067 * W, 0.17 * D)
        parts += [("tank", Point(cx + x * W, cy + y * D).buffer(r, quad_segs=10)) for x, y in zip(gx.ravel(), gy.ravel())]
        parts.append(("building", Point(cx + 0.3 * W, cy - 0.3 * D).buffer(0.06 * min(W, D), quad_segs=12)))
        parts.append(("building", rel(0.26, 0.2, 0.44, 0.4)))
        parts += [("basin", rel(0.28, y, 0.46, y + 0.12)) for y in (-0.12, 0.04)]
        parts += [("green", rel(-0.48, 0.3, 0.2, 0.47)), ("green", rel(-0.3, -0.47, 0.2, -0.32))]
        return parts
    if variant == "tissue":
        parts.append(("building", rel(-0.25, -0.08, 0.3, 0.08)))
        parts.append(("building", rel(-0.25, 0.14, 0.05, 0.4)))
        parts.append(("building", rel(0.1, 0.14, 0.4, 0.4)))
        parts.append(("building", rel(0.34, -0.4, 0.46, 0.06)))
        parts.append(("paved", rel(0.1, -0.44, 0.32, -0.16)))
        parts += [("lot", rel(0.12, y, 0.3, y + 0.03)) for y in (-0.41, -0.33, -0.25)]
        parts.append(("green", rel(-0.3, -0.45, 0.06, -0.14)))
        return parts
    if variant == "brewery":
        parts.append(("building", rel(-0.28, -0.1, -0.04, 0.2)))
        parts += [("tank", Point(cx + x * W, cy + 0.32 * D).buffer(0.022 * min(W, D) * 2, quad_segs=10)) for x in (-0.24, -0.14, -0.04)]
        gx, gy = np.meshgrid(np.linspace(0.04, 0.22, 4), np.linspace(-0.05, 0.25, 3))
        parts += [("tank", Point(cx + x * W, cy + y * D).buffer(0.026 * min(W, D), quad_segs=8)) for x, y in zip(gx.ravel(), gy.ravel())]
        parts.append(("building", rel(0.28, 0.0, 0.36, 0.4)))
        parts.append(("building", rel(0.0, -0.42, 0.3, -0.16)))
        parts.append(("building", rel(0.34, -0.42, 0.46, -0.08)))
        parts.append(("paved", rel(0.36, -0.06, 0.48, 0.04)))
        parts.append(("green", rel(0.38, 0.1, 0.47, 0.45)))
        return parts
    if variant == "garage":
        parts.append(("building", rel(-0.28, -0.05, 0.12, 0.4)))
        parts.append(("building", rel(0.16, 0.2, 0.3, 0.4)))
        parts.append(("building", rel(0.34, 0.2, 0.46, 0.4)))
        parts.append(("building", rel(0.16, -0.1, 0.46, 0.14)))
        parts.append(("paved", rel(-0.28, -0.3, 0.46, -0.22)))
        parts.append(("lot", rel(-0.2, -0.45, 0.46, -0.34)))
        return parts
    parts.append(("stack", rel(-0.3, 0.2, -0.12, 0.45)))
    for x in np.arange(cx - 0.29 * W, cx - 0.13 * W, 0.02):
        parts += [("tank", Point(x, y).buffer(0.006, quad_segs=6)) for y in np.arange(cy + 0.22 * D, cy + 0.44 * D, 0.02)]
    parts.append(("building", rel(-0.1, -0.15, 0.3, 0.15)))
    parts.append(("building", rel(-0.1, 0.2, 0.3, 0.26)))
    parts.append(("building", rel(0.3, 0.19, 0.45, 0.27)))
    parts += [("tank", Point(cx + x * W, cy + 0.32 * D).buffer(0.008, quad_segs=8)) for x in (0.32, 0.37, 0.42)]
    parts.append(("building", rel(0.32, -0.4, 0.46, 0.1)))
    parts.append(("paved", rel(0.1, -0.45, 0.3, -0.2)))
    parts += [("lot", rel(0.12, y, 0.29, y + 0.02)) for y in (-0.42, -0.36, -0.3)]
    parts.append(("building", rel(-0.3, -0.12, -0.16, 0.08)))
    parts.append(("green", rel(-0.3, -0.35, -0.16, -0.16)))
    return parts


def _zoo(cx, cy, W, D, variant, rng) -> list[tuple[str, Polygon]]:
    """One house of a zoo, entrance on -x: a visitors' path round the site, the life-support plant (tanks)
    behind the house, and per taxon (SITE_VARIANTS["zoo"] in world.py): primates, forest islands in a moat with climbing
    towers; felids, walled paddocks round a viewing pavilion; ungulates, a savanna paddock with a
    waterhole and barns; marine_mammals, show and holding pools with a seating arc; polar, the cold
    house with a pool and rock islands; birds, a netted aviary dome over trees and a lake; reptiles,
    glass domes and a sand yard; amphibians, a humid house among ponds; freshwater, a winding river
    channel through the aquarium; marine, the ocean tank hall and seawater tanks; insects, the
    butterfly dome, gardens and rearing houses; arachnids, a star-shaped dark house; cephalopods,
    round tanks round a dark hall; coral, a reef lagoon beside the coral greenhouse."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    m = min(W, D)
    ell = lambda x, y, rx, ry: affinity.scale(Point(cx + x * W, cy + y * D).buffer(1, quad_segs=24), rx * W, ry * D)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49))]
    parts.append(("paved", rel(-0.46, -0.46, 0.46, 0.46).difference(rel(-0.44, -0.44, 0.44, 0.44))))
    parts.append(_road((cx - 0.5 * W, cy), (cx - 0.44 * W, cy), 0.006))
    parts += [("tank", Point(cx + 0.4 * W, cy + y * D).buffer(0.02 * m, quad_segs=8)) for y in (0.3, 0.38)]
    parts.append(("building", rel(0.34, 0.25, 0.38, 0.42)))
    v = variant
    if v == "primates":
        islands = [ell(x, y, 0.12, 0.12) for x, y in ((-0.15, 0.12), (0.14, 0.1), (0.0, -0.17))]
        parts.append(("basin", ell(0.0, 0.0, 0.36, 0.36).difference(shapely.union_all(islands))))
        parts += [("building", Point(cx + x * W, cy + y * D).buffer(0.012 * m / 0.4, quad_segs=6)) for x, y in ((-0.15, 0.12), (0.14, 0.1), (0.0, -0.17))]
        parts.append(("building", rel(-0.4, -0.12, -0.3, 0.12)))
    elif v == "felids":
        parts.append(("building", Point(cx, cy).buffer(0.08 * m, quad_segs=6)))
        for a in range(4):
            sector = shapely.Polygon([(cx, cy), *[(cx + 0.4 * W * math.cos(t), cy + 0.4 * D * math.sin(t)) for t in np.linspace(a * math.pi / 2 + 0.1, (a + 1) * math.pi / 2 - 0.1, 8)]])
            parts.append(_wall(sector, 0.003))
            parts.append(("building", Point(cx + 0.28 * W * math.cos(a * math.pi / 2 + 0.78), cy + 0.28 * D * math.sin(a * math.pi / 2 + 0.78)).buffer(0.02 * m, quad_segs=4)))
    elif v == "ungulates":
        parts.append(_wall(rel(-0.38, -0.38, 0.3, 0.38), 0.003))
        parts.append(("basin", ell(-0.05, 0.05, 0.1, 0.07)))
        parts += [("building", rel(x, -0.36, x + 0.08, -0.3)) for x in (-0.3, -0.15, 0.0, 0.15)]
        parts += [("bulk", ell(x, y, 0.05, 0.035)) for x, y in ((0.12, 0.2), (-0.22, 0.22), (0.15, -0.12))]
    elif v == "marine_mammals":
        parts.append(("basin", ell(0.05, 0.05, 0.25, 0.18)))
        parts.append(("building", ell(0.05, 0.05, 0.36, 0.3).difference(ell(0.05, 0.05, 0.3, 0.24)).intersection(rel(-0.4, -0.4, 0.4, -0.05))))
        parts += [("basin", ell(x, 0.36, 0.06, 0.05)) for x in (-0.3, -0.15, 0.0)]
        parts.append(("building", rel(-0.42, -0.1, -0.32, 0.2)))
    elif v == "polar":
        parts.append(("building", rel(-0.38, -0.3, -0.05, 0.3)))
        parts.append(("basin", ell(0.17, 0.0, 0.2, 0.3)))
        parts += [("bulk", ell(x, y, 0.05, 0.04)) for x, y in ((0.12, 0.12), (0.22, -0.1), (0.1, -0.18))]
    elif v == "birds":
        dome = ell(0.0, 0.0, 0.4, 0.4)
        parts.append(_wall(dome, 0.003))
        parts.append(("basin", ell(0.1, -0.08, 0.14, 0.1)))
        parts += [("building", ell(x, y, 0.04, 0.04)) for x, y in ((-0.2, 0.15), (0.15, 0.22), (-0.1, -0.25))]
        parts.append(_wall(ell(0.0, 0.0, 0.25, 0.25), 0.002))
    elif v == "reptiles":
        parts.append(("building", rel(-0.38, -0.12, 0.05, 0.12)))
        parts += [("building", ell(x, y, 0.08, 0.08)) for x, y in ((-0.25, 0.28), (-0.05, 0.3), (0.15, 0.28))]
        parts.append(("bulk", rel(0.1, -0.38, 0.4, -0.05)))
        parts += [("basin", ell(x, -0.25, 0.03, 0.03)) for x in (0.18, 0.3)]
    elif v == "amphibians":
        parts.append(("building", rel(-0.2, -0.15, 0.15, 0.15)))
        parts += [("basin", ell(x, y, 0.07, 0.05)) for x, y in ((-0.3, 0.25), (-0.1, 0.32), (0.15, 0.3), (0.28, -0.05), (-0.3, -0.28), (0.05, -0.3), (0.25, -0.3))]
    elif v == "freshwater":
        t = np.linspace(-0.42, 0.42, 60)
        river = shapely.LineString([(cx + x * W, cy + 0.22 * D * math.sin(x * 9)) for x in t]).buffer(0.035 * m, cap_style="round")
        parts.append(("basin", river))
        parts.append(("building", rel(-0.12, -0.38, 0.22, -0.2)))
        parts.append(("building", rel(-0.12, 0.25, 0.22, 0.4)))
    elif v == "marine":
        parts.append(("building", rel(-0.38, -0.3, 0.2, 0.3)))
        parts.append(("basin", ell(-0.09, 0.0, 0.14, 0.14)))
        parts += [("tank", Point(cx + x * W, cy + y * D).buffer(0.04 * m, quad_segs=10)) for x, y in ((0.3, -0.25), (0.3, -0.05), (0.3, 0.15))]
    elif v == "insects":
        parts.append(("building", ell(-0.1, 0.05, 0.22, 0.22)))
        parts += [("green", ell(x, y, 0.06, 0.05)) for x, y in ((0.2, 0.25), (0.25, -0.2), (-0.3, -0.3))]
        parts += [("building", rel(x, -0.4, x + 0.06, -0.33)) for x in (-0.1, 0.0, 0.1, 0.2)]
    elif v == "arachnids":
        star = shapely.Polygon([(cx + (0.3 if k % 2 == 0 else 0.14) * W * math.cos(k * math.pi / 8), cy + (0.3 if k % 2 == 0 else 0.14) * D * math.sin(k * math.pi / 8)) for k in range(16)])
        parts.append(("building", star))
        parts.append(("bulk", rel(0.3, -0.4, 0.42, -0.2)))
    elif v == "cephalopods":
        parts.append(("building", ell(-0.05, 0.0, 0.16, 0.16)))
        parts += [("basin", ell(-0.05 + 0.3 * math.cos(a), 0.3 * math.sin(a), 0.06, 0.06)) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)]
    elif v == "coral":
        parts.append(("basin", ell(0.08, 0.0, 0.3, 0.32)))
        parts += [("bulk", ell(x, y, 0.06, 0.03)) for x, y in ((0.0, 0.1), (0.15, -0.1), (0.12, 0.2))]
        parts.append(("building", rel(-0.42, -0.25, -0.26, 0.25)))
    return parts


def _clinic(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Dental clinic, gate on -y: the main building shaped like a molar (crown on +y, two roots on -y)
    in a garden, a drop-off loop and car park, a smile-shaped pond and a helipad."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    crown = shapely.union_all([Point(cx + x * W, cy + 0.18 * D).buffer(0.12 * W, quad_segs=16) for x in (-0.1, 0.1)] + [rel(-0.22, -0.05, 0.22, 0.2)])
    roots = [shapely.Polygon([(cx + a * W, cy - 0.04 * D), (cx + b * W, cy - 0.04 * D), (cx + c * W, cy - 0.3 * D)]) for a, b, c in ((-0.22, -0.02, -0.14), (0.02, 0.22, 0.14))]
    tooth = shapely.union_all([crown, *roots]).buffer(0.01 * min(W, D), quad_segs=8)
    parts = [("green", rel(-0.48, -0.48, 0.48, 0.48)), ("building", tooth)]
    parts.append(("paved", Point(cx, cy - 0.38 * D).buffer(0.08 * min(W, D), quad_segs=16).difference(Point(cx, cy - 0.38 * D).buffer(0.05 * min(W, D), quad_segs=16))))
    parts.append(_road((cx, cy - 0.5 * D), (cx, cy - 0.44 * D), 0.006))
    parts += [("lot", rel(-0.46, -0.46, -0.2, -0.3)), ("lot", rel(0.2, -0.46, 0.46, -0.3))]
    smile = shapely.LineString([(cx + x * W, cy + 0.42 * D - 0.06 * D * math.cos(x * math.pi / 0.6)) for x in np.linspace(-0.3, 0.3, 30)]).buffer(0.015 * min(W, D))
    parts.append(("basin", smile))
    parts.append(("pad", Point(cx + 0.38 * W, cy + 0.38 * D).buffer(0.012, quad_segs=10)))
    return parts


def _triangle(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """Triangular office building on a lawn, apex on +x, entrance plaza on -x and a car-park deck on -y.
    hollow: the triangle pierced by three triangular light wells; mountain: a triangular ring of offices
    round a green stepped 'mountain' under the roof, with a pavilion on its summit."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    tri = lambda x0, x1, h, oy=0.0: shapely.Polygon([(cx + x0 * W, cy + (oy - h) * D), (cx + x0 * W, cy + (oy + h) * D), (cx + x1 * W, cy + oy * D)])
    outer = tri(-0.34, 0.4, 0.4)
    parts = [("green", rel(-0.48, -0.48, 0.48, 0.48))]
    if variant == "mountain":
        court = tri(-0.22, 0.2, 0.25)
        parts += [("building", outer.difference(court)), ("green", court), ("building", tri(-0.1, 0.06, 0.08))]
    else:
        wells = shapely.union_all([tri(-0.26, -0.1, 0.1, oy) for oy in (-0.18, 0.18)] + [tri(-0.02, 0.14, 0.1)])
        parts.append(("building", outer.difference(wells)))
    parts += [("paved", rel(-0.48, -0.08, -0.34, 0.08)), ("lot", rel(-0.2, -0.47, 0.3, -0.42))]
    return parts


def _retail(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """Shop on its car park, entrance on -x. mall: a long arcade with three anchor stores and two
    parking decks in a sea of parking; supermarket: a big box at the back (+x) with a loading yard,
    parking in front; fuel: a pump canopy over the forecourt, a kiosk behind and a lone toilet shed."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    if variant == "mall":
        body = shapely.union_all([rel(-0.3, -0.07, 0.3, 0.07), rel(-0.38, -0.17, -0.24, 0.17), rel(0.24, -0.17, 0.38, 0.17),
                                  rel(-0.06, 0.0, 0.08, 0.22)])
        parts = [("lot", rel(-0.48, -0.48, 0.48, 0.48).difference(body.buffer(0.012)))]
        parts += [("building", body), ("building", rel(-0.2, -0.42, -0.06, -0.28)), ("building", rel(0.06, 0.3, 0.2, 0.44))]
        parts += [("green", rel(-0.48, -0.48, 0.48, -0.46)), ("green", rel(-0.48, 0.46, 0.48, 0.48))]
        return parts
    if variant == "fuel":
        parts = [("paved", rel(-0.48, -0.48, 0.48, 0.48)), ("building", rel(-0.34, -0.24, 0.08, 0.24))]
        parts += [("building", rel(0.2, -0.2, 0.44, 0.2)), ("building", rel(0.36, 0.3, 0.44, 0.42)), ("lot", rel(0.2, -0.44, 0.44, -0.28))]
        return parts
    parts = [("lot", rel(-0.47, -0.47, 0.02, 0.47)), ("building", rel(0.06, -0.4, 0.4, 0.4)), ("paved", rel(0.4, -0.3, 0.48, 0.1))]
    parts += [("green", rel(-0.48, -0.48, 0.48, -0.44)), ("green", rel(-0.48, 0.44, 0.48, 0.48))]
    return parts


def _apartments(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """Garden apartment complex, entrance on +x: three-storey blocks in a C round a courtyard with a
    pool and a barbecue shelter, carports and a leasing office by the gate."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [("green", rel(-0.48, -0.48, 0.48, 0.48))]
    parts += [("building", rel(-0.44, y, 0.2, y + 0.14)) for y in (-0.44, 0.3)]
    parts += [("building", rel(-0.44, -0.24, -0.3, 0.24)), ("building", rel(-0.04, -0.2, 0.1, 0.2))]
    parts += [("basin", rel(-0.24, -0.1, -0.1, 0.06)), ("building", rel(-0.22, 0.12, -0.14, 0.2))]
    parts += [("lot", rel(0.26, -0.44, 0.46, 0.44)), ("building", rel(0.3, -0.06, 0.4, 0.06))]
    return parts


def _lido(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """A pool big enough for a ship, entrance on -x: a beach shelving into the water at the -x end, a
    cruise ship moored mid-pool to a pier from the +y deck, lifeguard towers along both decks, the
    changing pavilions on -y, the filter plant's tanks and a little lighthouse at the +x end."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    m = min(W, D)
    water = rel(-0.39, -0.29, 0.39, 0.29).buffer(0.02 * m)
    beach = rel(-0.42, -0.32, -0.3, 0.32)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49).difference(rel(-0.45, -0.42, 0.45, 0.42)))]
    parts.append(("paved", rel(-0.45, -0.42, 0.45, 0.42).difference(water)))
    parts += [("basin", water.difference(beach)), ("bulk", water.intersection(beach))]
    x0, x1, b, y = -0.08, 0.22, 0.055, 0.04
    hull = Polygon([(cx + x0 * W, cy + (y - b) * D), (cx + (x1 - 0.035) * W, cy + (y - b) * D), (cx + x1 * W, cy + y * D),
                    (cx + (x1 - 0.035) * W, cy + (y + b) * D), (cx + x0 * W, cy + (y + b) * D)])
    parts.append(("building", hull))
    parts.append(("paved", rel(0.05, y + b, 0.07, 0.31)))
    parts += [("building", Point(cx + x * W, cy + s * 0.36 * D).buffer(0.006, quad_segs=4)) for x in np.linspace(-0.25, 0.35, 5) for s in (-1, 1)]
    parts += [("building", rel(x, -0.48, x + 0.12, -0.43)) for x in (-0.3, -0.1, 0.1)]
    parts += [("tank", Point(cx + 0.47 * W, cy + y * D).buffer(0.012, quad_segs=8)) for y in (-0.3, -0.18, 0.18, 0.3)]
    parts.append(("building", Point(cx + 0.41 * W, cy).buffer(0.008, quad_segs=8)))
    parts += [("lot", rel(-0.49, -0.3, -0.46, 0.3)), _road((cx - 0.5 * W, cy), (cx - 0.45 * W, cy), 0.008)]
    return parts


def _breeze(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """An outdoor air plant in a park, gate on -y: a round control hall in the middle, eight purifier
    towers on a ring joined to it by duct galleries, a ring path, a cooling pond and the car park."""
    m = min(W, D)
    parts = [("green", box(cx - 0.49 * W, cy - 0.49 * D, cx + 0.49 * W, cy + 0.49 * D))]
    ring = Point(cx, cy).buffer(0.36 * m, quad_segs=32)
    parts.append(("paved", ring.exterior.buffer(0.006)))
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        tx, ty = cx + 0.36 * m * math.cos(a), cy + 0.36 * m * math.sin(a)
        parts.append(("paved", shapely.LineString([(cx, cy), (tx, ty)]).buffer(0.005)))
        parts.append(("building", Point(tx, ty).buffer(0.05 * m, quad_segs=12)))
    parts.append(("building", Point(cx, cy).buffer(0.13 * m, quad_segs=24)))
    parts.append(("basin", affinity.scale(Point(cx + 0.4 * W, cy + 0.4 * D).buffer(1, quad_segs=16), 0.06 * W, 0.05 * D)))
    parts += [("lot", box(cx - 0.2 * W, cy - 0.48 * D, cx + 0.2 * W, cy - 0.43 * D)), _road((cx, cy - 0.5 * D), (cx, cy - 0.43 * D), 0.006)]
    return parts


def _square(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """A town square with a statue on a pedestal in the middle. round: a paved circle round a ring
    fountain, flower beds in the four quarters and a half-ring colonnade on +y; square: a paved square
    with four lawns, a fountain at each corner of the pedestal and arcades along +y and -y."""
    m = min(W, D)
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    disc = lambda r: Point(cx, cy).buffer(r * m, quad_segs=32)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49))]
    if variant == "square":
        parts.append(("paved", rel(-0.42, -0.42, 0.42, 0.42).difference(shapely.union_all(
            [rel(x, y, x + 0.22, y + 0.22) for x in (-0.36, 0.14) for y in (-0.36, 0.14)]))))
        parts += [("basin", Point(cx + x * W, cy + y * D).buffer(0.035 * m, quad_segs=12)) for x in (-0.09, 0.09) for y in (-0.09, 0.09)]
        parts.append(("building", rel(-0.035, -0.035, 0.035, 0.035)))
        parts += [("building", rel(-0.4, y, 0.4, y + 0.04)) for y in (-0.48, 0.44)]
        return parts
    parts.append(("paved", disc(0.43).difference(shapely.union_all([disc(0.12)] + [
        Polygon([(cx, cy)] + [(cx + 0.34 * m * math.cos(a), cy + 0.34 * m * math.sin(a)) for a in np.linspace(q + 0.25, q + math.pi / 2 - 0.25, 8)]).difference(disc(0.2))
        for q in (0, math.pi / 2, math.pi, 1.5 * math.pi)]))))
    parts += [("green", Polygon([(cx, cy)] + [(cx + 0.34 * m * math.cos(a), cy + 0.34 * m * math.sin(a)) for a in np.linspace(q + 0.25, q + math.pi / 2 - 0.25, 8)]).difference(disc(0.2)))
              for q in (0, math.pi / 2, math.pi, 1.5 * math.pi)]
    parts.append(("basin", disc(0.12).difference(disc(0.06))))
    parts.append(("building", disc(0.04)))
    arc = Polygon([(cx + r * m * math.cos(a), cy + r * m * math.sin(a)) for r, seq in ((0.47, np.linspace(0.2, math.pi - 0.2, 24)), (0.44, np.linspace(math.pi - 0.2, 0.2, 24))) for a in seq])
    parts.append(("building", arc))
    return parts


def _fashion(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """Fashion buildings on a lawn, entrance on -x. studio: a slim square tower with a low atelier wing
    and a fabric store; fitting: a tower of three stacked floors each turned a little further, like a
    model turning in front of the mirror; show: a long runway hall with the backstage block at its head,
    a red-carpet forecourt and the car park."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49))]
    if variant == "fitting":
        floor = rel(-0.24, -0.24, 0.24, 0.24)
        parts.append(("building", shapely.union_all([affinity.rotate(floor, a, origin=(cx, cy)) for a in (0, 15, 30)])))
        parts.append(("paved", rel(-0.48, -0.06, -0.36, 0.06)))
        return parts
    if variant == "show":
        parts.append(("building", rel(-0.3, -0.06, 0.4, 0.06).union(rel(-0.44, -0.3, -0.26, 0.3))))
        parts += [("building", rel(-0.2, y, 0.32, y + 0.12)) for y in (-0.3, 0.18)]
        parts += [("paved", rel(0.4, -0.04, 0.48, 0.04)), ("lot", rel(-0.2, -0.47, 0.32, -0.36))]
        return parts
    parts.append(("building", rel(-0.2, -0.2, 0.2, 0.2)))
    parts.append(("building", rel(0.2, -0.42, 0.44, -0.1)))
    parts.append(("building", rel(-0.44, 0.24, -0.16, 0.44)))
    parts.append(("paved", rel(-0.48, -0.06, -0.2, 0.06)))
    return parts


def _chip(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """A building drawn as a chip package: a square body with rows of pins on all four sides, in a
    garden with a paved forecourt on -x."""
    m = min(W, D)
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49)), ("building", box(cx - 0.25 * m, cy - 0.25 * m, cx + 0.25 * m, cy + 0.25 * m))]
    pin = lambda a, b, c, d: box(min(a, c), min(b, d), max(a, c), max(b, d))
    for t in np.linspace(-0.2, 0.2, 6):
        for s in (-1, 1):
            parts.append(("building", pin(cx + (t - 0.012) * m, cy + s * 0.25 * m, cx + (t + 0.012) * m, cy + s * 0.32 * m)))
            parts.append(("building", pin(cx + s * 0.25 * m, cy + (t - 0.012) * m, cx + s * 0.32 * m, cy + (t + 0.012) * m)))
    parts.append(("paved", rel(-0.48, -0.08, -0.36, 0.08)))
    return parts


def _brewhouse(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """One house of a brewery estate, entrance and tap room on -x with its terrace, car park on -y.
    pilsner: a long lagering cellar beside a row of tall tanks and a round copper brewhouse; wheat: a
    round brewhouse tower over a beer garden; ipa: a hop garden of trellis rows and an oast house;
    stout: a square hall, the roastery and a yard of barrels; abbey: a cloister round a garden with a
    bell tower; sour: a barrel house of big wooden foeders and an open coolship pan."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    m = min(W, D)
    dot = lambda x, y, r: Point(cx + x * W, cy + y * D).buffer(r * m, quad_segs=10)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49)), ("building", rel(-0.44, -0.16, -0.26, 0.16)),
             ("paved", rel(-0.26, -0.12, -0.18, 0.12)), ("lot", rel(-0.44, -0.46, -0.1, -0.32))]
    if variant == "pilsner":
        parts.append(("building", rel(-0.05, 0.1, 0.44, 0.3)))
        parts += [("tank", dot(x, -0.05, 0.05)) for x in np.linspace(0.0, 0.4, 6)]
        parts.append(("building", dot(0.25, -0.3, 0.12)))
    elif variant == "wheat":
        parts.append(("building", dot(0.25, 0.12, 0.2)))
        parts += [("paved", dot(x, y, 0.035)) for x in (-0.05, 0.08, 0.21, 0.34) for y in (-0.28, -0.4)]
    elif variant == "ipa":
        parts += [("vine_white", rel(-0.1, y, 0.44, y + 0.025)) for y in np.arange(-0.42, 0.42, 0.07)]
        parts.append(("building", dot(-0.02, 0.32, 0.09).union(rel(-0.02, 0.26, 0.12, 0.38))))
    elif variant == "stout":
        parts.append(("building", rel(-0.05, -0.2, 0.3, 0.3)))
        parts.append(("building", rel(0.33, 0.2, 0.45, 0.4)))
        parts += [("tank", dot(x, y, 0.03)) for x in np.linspace(0.34, 0.44, 3) for y in np.linspace(-0.4, 0.05, 6)]
    elif variant == "abbey":
        parts.append(("building", rel(-0.05, -0.3, 0.42, 0.36).difference(rel(0.05, -0.18, 0.32, 0.24))))
        parts.append(("building", rel(0.42, 0.28, 0.48, 0.42)))
    else:  # sour
        parts.append(("building", rel(-0.05, 0.05, 0.44, 0.42)))
        parts += [("tank", dot(x, y, 0.06)) for x in np.linspace(0.02, 0.38, 4) for y in (-0.08, -0.3)]
        parts.append(("basin", rel(0.12, -0.45, 0.4, -0.4)))
    return parts


def _orchard(cx, cy, W, D, variant) -> list[tuple[str, Polygon]]:
    """A fruit plantation, entrance on -y: blocks of trees in rows (drawn as vine_white crowns) inside
    the frames of retractable greenhouse roofs, farm tracks between the blocks, the packing house, a
    cold store and a pond. durian: four roofed blocks."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49))]
    for bx in (-0.46, 0.02):
        for by in (-0.24, 0.12):
            block = rel(bx, by, bx + 0.44, by + 0.34)
            parts.append(("paved", block.exterior.buffer(0.004)))
            x0, y0, x1, y1 = block.bounds
            for x in np.arange(x0 + 0.025, x1 - 0.015, 0.03):
                parts += [("vine_white", Point(x, y).buffer(0.01, quad_segs=3)) for y in np.arange(y0 + 0.025, y1 - 0.015, 0.03)]
    parts.append(("paved", rel(-0.49, -0.27, 0.49, -0.25)))
    parts.append(("paved", rel(-0.015, -0.49, 0.015, 0.48)))
    parts += [("building", rel(-0.3, -0.46, -0.1, -0.32)), ("building", rel(0.08, -0.45, 0.22, -0.33)), ("lot", rel(-0.46, -0.46, -0.32, -0.34))]
    parts.append(("basin", affinity.scale(Point(cx + 0.38 * W, cy - 0.38 * D).buffer(1, quad_segs=16), 0.07 * W, 0.07 * D)))
    return parts


def _spine(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """A spine clinic drawn as a spine: a column of rounded vertebra blocks along y joined by a glass
    spinal corridor, the pelvis-shaped rehabilitation hall at the foot (-y), gardens, a drop-off and car
    park on -x and a helipad."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    m = min(W, D)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49))]
    bones = [rel(-w, y, w, y + 0.05).buffer(0.01 * m, quad_segs=6) for w, y in
             zip(np.linspace(0.12, 0.2, 7), np.linspace(0.36, -0.12, 7))]
    pelvis = Point(cx, cy - 0.3 * D).buffer(1, quad_segs=24)
    pelvis = affinity.scale(pelvis, 0.3 * W, 0.12 * D).difference(Point(cx, cy - 0.33 * D).buffer(0.05 * m, quad_segs=12))
    parts.append(("building", shapely.union_all(bones + [pelvis, rel(-0.03, -0.25, 0.03, 0.44)])))
    parts += [("lot", rel(-0.47, -0.47, -0.32, -0.05)), ("paved", rel(-0.32, -0.2, -0.22, -0.12))]
    parts.append(("pad", Point(cx + 0.36 * W, cy + 0.38 * D).buffer(0.012, quad_segs=10)))
    return parts


def _camera(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """A photo studio shaped like a camera seen from above: the body, the round lens barrel standing out
    on -y, the viewfinder hump and the shutter-button pavilion on +y, on a lawn with a paved forecourt."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    m = min(W, D)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49))]
    body = rel(-0.36, -0.16, 0.36, 0.22).buffer(0.02 * m, quad_segs=6)
    lens = Point(cx + 0.05 * W, cy - 0.2 * D).buffer(0.2 * m, quad_segs=24)
    parts.append(("building", shapely.union_all([body, lens, rel(-0.1, 0.22, 0.1, 0.32), rel(0.2, 0.22, 0.3, 0.28)])))
    parts.append(("basin", Point(cx + 0.05 * W, cy - 0.2 * D).buffer(0.08 * m, quad_segs=24)))
    parts.append(("paved", rel(-0.48, -0.06, -0.38, 0.06)))
    return parts


def _armoury(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """A collector's armoury: two walls round a gravel yard, the gatehouse on -x, the vault hall in the
    middle and four magazine bunkers in the corners."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49)), _wall(rel(-0.46, -0.46, 0.46, 0.46)), _wall(rel(-0.4, -0.4, 0.4, 0.4))]
    parts.append(("paved", rel(-0.38, -0.38, 0.38, 0.38)))
    parts += [("building", rel(-0.18, -0.16, 0.22, 0.16)), ("building", rel(-0.49, -0.06, -0.38, 0.06))]
    parts += [("building", rel(x, y, x + 0.1, y + 0.1)) for x in (-0.34, 0.24) for y in (-0.34, 0.24)]
    return parts


def _shooting(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """A shooting range firing towards +x: the clubhouse and car park on -x, a covered firing line, long
    lanes with target frames ending at a high earth backstop, a walled pistol bay and a clay field with
    its arc of shooting stands on -y."""
    rel = lambda x0, y0, x1, y1: box(cx + x0 * W, cy + y0 * D, cx + x1 * W, cy + y1 * D)
    parts = [("green", rel(-0.49, -0.49, 0.49, 0.49)), ("building", rel(-0.47, 0.05, -0.36, 0.3)), ("lot", rel(-0.47, -0.25, -0.36, 0.0))]
    parts.append(("building", rel(-0.32, 0.0, -0.29, 0.44)))
    parts += [("paved", rel(-0.29, y, 0.4, y + 0.035)) for y in np.arange(0.02, 0.42, 0.06)]
    parts += [("building", rel(0.36, y, 0.37, y + 0.035)) for y in np.arange(0.02, 0.42, 0.06)]
    parts.append(("bulk", rel(0.42, -0.05, 0.48, 0.47)))
    parts += [_wall(rel(-0.29, -0.2, -0.05, -0.04)), ("building", rel(-0.29, -0.2, -0.27, -0.04))]
    a = np.linspace(math.pi * 0.15, math.pi * 0.85, 7)
    parts += [("pad", Point(cx + 0.2 * W + 0.12 * W * math.cos(t), cy - 0.45 * D + 0.3 * D * math.sin(t)).buffer(0.008, quad_segs=6)) for t in a]
    parts.append(("building", Point(cx + 0.2 * W, cy - 0.45 * D).buffer(0.01, quad_segs=6)))
    return parts


def _chair(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """A museum shaped like an office chair seen from above: five wings radiating from a round hall like
    the legs of a swivel chair's base, each ending in a round castor pavilion, on a lawn with a forecourt."""
    m = min(W, D)
    parts = [("green", box(cx - 0.49 * W, cy - 0.49 * D, cx + 0.49 * W, cy + 0.49 * D))]
    legs = []
    for k in range(5):
        a = math.pi / 2 + k * 2 * math.pi / 5
        ex, ey = cx + 0.36 * m * math.cos(a), cy + 0.36 * m * math.sin(a)
        legs += [shapely.LineString([(cx, cy), (ex, ey)]).buffer(0.035 * m, cap_style="flat"), Point(ex, ey).buffer(0.07 * m, quad_segs=12)]
    parts.append(("building", shapely.union_all(legs + [Point(cx, cy).buffer(0.13 * m, quad_segs=24)])))
    parts.append(("paved", box(cx - 0.48 * W, cy - 0.05 * D, cx - 0.4 * W, cy + 0.05 * D)))
    return parts


def _dronetower(cx, cy, W, D) -> list[tuple[str, Polygon]]:
    """A slim observation tower with four drone pads round its foot and a launch deck, on a lawn."""
    m = min(W, D)
    parts = [("green", box(cx - 0.49 * W, cy - 0.49 * D, cx + 0.49 * W, cy + 0.49 * D))]
    parts.append(("paved", Point(cx, cy).buffer(0.3 * m, quad_segs=24).difference(Point(cx, cy).buffer(0.14 * m, quad_segs=24))))
    parts.append(("building", Point(cx, cy).buffer(0.12 * m, quad_segs=6)))
    parts += [("pad", Point(cx + 0.36 * m * math.cos(a), cy + 0.36 * m * math.sin(a)).buffer(0.07 * m, quad_segs=10)) for a in np.arange(4) * math.pi / 2 + math.pi / 4]
    return parts


def landmark(layout: str, center, angle: float, size, rng, land=None, terminals=(), variant=None) -> tuple[Polygon, list[tuple[str, Polygon]]]:
    """Site outline and parts [(kind, polygon)] of a landmark; kind is building, or for transport
    and military facilities runway, pad, paved (aprons, taxiways, quays, piers), basin (dug harbour
    water, pools), breakwater, stack (containers), bulk (stockpiles, a pool's sand beach), tank, dish (antennas and
    radomes), lot (vehicle parking), rail or track (an electromagnetic launch guideway, a racing circuit),
    green (lawns, gardens, paddocks), wall (walls and fences) and vine_red / vine_white (rows of vines).
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
    elif layout == "courtyard":  # 回字形: four wings round an inner court
        parts = [("building", rel(-0.46, -0.46, 0.46, 0.46).difference(rel(-0.24, -0.22, 0.24, 0.22)))]
    elif layout == "slab":
        parts = [("building", rel(-0.46, -0.34, 0.46, 0.34))]
    elif layout == "lshape":
        parts = [("building", rel(-0.46, -0.46, 0.46, -0.08).union(rel(-0.46, -0.46, -0.1, 0.46)))]
    elif layout == "block":
        s = 0.4 * min(W, D)
        parts = [("building", box(cx - s, cy - s, cx + s, cy + s))]
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
    elif layout == "ring":  # one ring-shaped building round a garden, two car-park blocks outside
        r = 0.4 * min(W, D)
        parts = [("building", Point(cx, cy).buffer(r, quad_segs=32).difference(Point(cx, cy).buffer(0.72 * r, quad_segs=32)))]
        parts += [("building", Point(cx + 0.1 * r, cy - 0.15 * r).buffer(0.12 * r, quad_segs=12))]
        parts += [("building", box(cx + x * W - 0.04 * W, cy - 0.46 * D, cx + x * W + 0.04 * W, cy - 0.42 * D)) for x in (-0.35, 0.35)]
    elif layout == "estate":
        parts = _estate(cx, cy, W, D, variant or "villa", rng)
    elif layout == "detention":
        parts = _detention(cx, cy, W, D, rng)
    elif layout == "checkpoint":
        parts = _checkpoint(cx, cy, W, D)
    elif layout == "refugee":
        parts = _refugee(cx, cy, W, D, rng)
    elif layout == "vineyard":
        parts = _vineyard(cx, cy, W, D, variant or "red")
    elif layout == "racetrack":
        parts = _racetrack(cx, cy, W, D)
    elif layout == "fab":
        parts = _fab(cx, cy, W, D, variant or "logic", rng)
    elif layout == "works":
        parts = _works(cx, cy, W, D, variant or "plates", rng)
    elif layout == "zoo":
        parts = _zoo(cx, cy, W, D, variant or "primates", rng)
    elif layout == "clinic":
        parts = _clinic(cx, cy, W, D)
    elif layout == "triangle":
        parts = _triangle(cx, cy, W, D, variant or "hollow")
    elif layout == "retail":
        parts = _retail(cx, cy, W, D, variant or "supermarket")
    elif layout == "apartments":
        parts = _apartments(cx, cy, W, D)
    elif layout == "lido":
        parts = _lido(cx, cy, W, D)
    elif layout == "breeze":
        parts = _breeze(cx, cy, W, D)
    elif layout == "square":
        parts = _square(cx, cy, W, D, variant or "round")
    elif layout == "fashion":
        parts = _fashion(cx, cy, W, D, variant or "studio")
    elif layout == "chip":
        parts = _chip(cx, cy, W, D)
    elif layout == "brewhouse":
        parts = _brewhouse(cx, cy, W, D, variant or "pilsner")
    elif layout == "orchard":
        parts = _orchard(cx, cy, W, D, variant or "durian")
    elif layout == "spine":
        parts = _spine(cx, cy, W, D)
    elif layout == "camera":
        parts = _camera(cx, cy, W, D)
    elif layout == "armoury":
        parts = _armoury(cx, cy, W, D)
    elif layout == "shooting":
        parts = _shooting(cx, cy, W, D)
    elif layout == "chair":
        parts = _chair(cx, cy, W, D)
    elif layout == "dronetower":
        parts = _dronetower(cx, cy, W, D)
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
