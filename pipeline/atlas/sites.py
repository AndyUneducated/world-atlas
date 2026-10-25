"""Landmark sites: outlines and parts of places with a `site`, fitted to the shore."""
from __future__ import annotations

import hashlib
import math

import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points

from . import buildings
from .common import log
from .world import COASTAL_LAYOUTS, FACILITY_LAYOUTS

SITE_SNAP_KM = 6.0  # how far (real km) a port or facility site may move to fit the shore
SEA_BRIDGE_HALF_WIDTH_KM = 0.017  # a six-lane sea bridge deck


def main_axis(poly) -> float:
    """Direction (radians) of the long side of a polygon's minimum rotated rectangle."""
    ring = np.array(poly.minimum_rotated_rectangle.exterior.coords)
    edges = np.diff(ring[:3], axis=0)
    ex, ey = max(edges, key=lambda e: math.hypot(*e))
    return math.atan2(ey, ex)


def sea_coast(land):
    """The shoreline of `land` against the sea (exterior rings only, so lake shores are left out)."""
    return shapely.MultiLineString([p.exterior for p in getattr(land, "geoms", [land])])


def seaward(land, q: Point, r=0.4) -> float | None:
    """Direction (radians, east = 0) from the shore point q out to sea, or None inland."""
    t = np.linspace(0, 2 * np.pi, 32, endpoint=False)
    wet = ~shapely.contains_xy(land, q.x + r * np.cos(t), q.y + r * np.sin(t))
    return math.atan2(np.sin(t[wet]).sum(), np.cos(t[wet]).sum()) if wet.any() else None


def fit_site(cfg, centre, a, size, land, coast, seed, pid, built_sites):
    """Site outline and parts placed at `centre` (real km), then fitted to the shore: a port or
    harbour moves to the nearest sea coast within SITE_SNAP_KM, and a facility steps inland until it
    is dry. So a site keeps its role when the district centre it is offset from moves after a
    repartition. An offshore port stays at sea, with a bridge to the coast next to the harbour it
    names in bridge_to (in `built_sites`), or else to the nearest coast."""
    layout = cfg["layout"]

    def build(c):
        rng = np.random.default_rng([seed, int(hashlib.sha1(pid.encode()).hexdigest()[:8], 16)])
        return buildings.landmark(layout, c, a, size, rng, land, cfg.get("terminals", ()))

    p = Point(centre)
    if layout in COASTAL_LAYOUTS:
        q = nearest_points(coast, p)[0]
        if q.distance(p) > SITE_SNAP_KM:
            return build(centre)
        if "angle_deg" not in cfg and (out := seaward(land, q)) is not None:
            a = out - math.pi / 2  # the layout's +y faces the sea
        return build((q.x, q.y))
    site, parts = build(centre)
    if layout == "offshore_port":
        to = built_sites.get(cfg.get("bridge_to"))
        shore = coast.difference(to.buffer(0.3)) if to is not None else coast
        land_at = nearest_points(shore, to.centroid if to is not None else site.centroid)[0]
        start = nearest_points(site.exterior, land_at)[0]
        deck = LineString([start, land_at])
        return site, parts + [("bridge", deck.buffer(SEA_BRIDGE_HALF_WIDTH_KM, cap_style="flat"))]
    if layout in FACILITY_LAYOUTS and site.intersection(land).area < 0.95 * site.area:
        q = nearest_points(coast, p)[0]
        ux, uy = (p.x - q.x, p.y - q.y) if land.contains(p) else (q.x - p.x, q.y - p.y)
        n = math.hypot(ux, uy) or 1.0
        reach = SITE_SNAP_KM + (0.0 if land.contains(p) else n)
        for k in range(1, int(reach / 0.2) + 1):
            c = (p.x + ux / n * 0.2 * k, p.y + uy / n * 0.2 * k)
            moved = build(c)
            if moved[0].intersection(land).area >= 0.95 * moved[0].area:
                return moved
    return site, parts


def landmark_sites(world, d, core, angle, built, land, seed):
    """Site outlines and parts (real km) of the places in district `d` that have a `site`.

    City landmarks follow the street grid `angle`; an explicit site.angle_deg is absolute (east = 0).
    `built` is the district's built-up area (None without urban cover), `land` the dry land around it."""
    out, coast = [], None
    for pid, pl in world.places.items():
        if pl["in"] != d["id"] or not pl.get("site"):
            continue
        cfg = pl["site"]
        ox, oy = pl.get("offset_km", (0, 0))
        size = (cfg["size_m"][0] / 1000, cfg["size_m"][1] / 1000)
        a = math.radians(cfg["angle_deg"]) if "angle_deg" in cfg else angle
        if cfg["layout"] in FACILITY_LAYOUTS:
            coast = coast or sea_coast(land)
        site, parts = fit_site(cfg, (core[0] + ox, core[1] + oy), a, size, land, coast, seed, pid, {o: s for o, s, _ in out})
        zh = pl["names"]["zh"]
        if cfg["layout"] in COASTAL_LAYOUTS:
            dry = site.intersection(land).area
            if not any(k == "paved" for k, _ in parts) or dry < 0.25 * size[0] * size[1] or dry > 0.95 * site.area:
                log(f"  WARN {zh}: port site does not straddle the coast")
        elif cfg["layout"] == "offshore_port":
            if site.intersection(land).area > 0.05 * site.area:
                log(f"  WARN {zh}: offshore port site runs onto land")
        elif cfg["layout"] in FACILITY_LAYOUTS:
            if site.intersection(land).area < 0.95 * site.area:
                log(f"  WARN {zh}: site runs into water")
        elif cfg["layout"] == "park":  # reserves, ski areas and waterfalls may lie outside town
            if not land.contains(site.centroid):
                log(f"  WARN {zh}: park site lies in water")
        elif built is None or not built.buffer(0.05).contains(site.centroid):
            log(f"  WARN {zh}: site lies outside the built-up area")
        for other, osite, _ in out:
            if site.intersects(osite):
                log(f"  WARN {pl['names']['zh']}: site overlaps {world.places[other]['names']['zh']}")
        out.append((pid, site, parts))
    return out


def core_zone(built, core, km2: float):
    """The part of the built-up area `built` (real km) nearest `core` that covers about km2."""
    r = math.sqrt(km2 / math.pi)
    zone = built
    for _ in range(8):
        zone = built.intersection(Point(core).buffer(r, quad_segs=32))
        if zone.area >= 0.97 * min(km2, built.area):
            break
        r *= min(2.0, math.sqrt(km2 / zone.area)) if zone.area > 0 else 2.0
    return zone
