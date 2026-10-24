"""Street networks of city built-up areas: arterials (主干道), collectors (次干道), local streets (支路).

All lengths here are real km; the caller scales geometry from design km before and after.

Each district's built-up area gets a network in its style:
- Arterials follow the district's two main axes through its centre (planned and mixed
  districts) or radiate from the centre (organic ones); mixed and organic districts add a ring.
- Planned districts are one continuous grid: collectors halfway between arterials, local
  streets evenly between those.
- Mixed and organic districts are split into neighbourhoods (Voronoi cells about
  `neighbourhood_km` across) whose boundaries are collectors. Inside each neighbourhood a grid
  at its own angle holds the local streets; its centre line is a collector.
- The finished network is bent by one smooth displacement field per district, so streets that
  met still meet and parallel streets stay parallel.
- Local streets stop at rivers; arterials and collectors bridge them.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import shapely
import yaml
from shapely.geometry import LineString, MultiPoint, Point
from shapely.ops import substring

CLASSES = ("arterial", "collector", "local")
MIN_PIECE_KM = {"arterial": 0.2, "collector": 0.12, "local": 0.06}


def zh_number(n: int) -> str:
    digits = "〇一二三四五六七八九"
    if n < 100:
        tens, ones = divmod(n, 10)
        return (digits[tens] if tens > 1 else "") + ("十" if tens else "") + (digits[ones] if ones or not tens else "")
    out, zero = "", False
    for unit, size in (("万", 10000), ("千", 1000), ("百", 100), ("十", 10), ("", 1)):
        d, n = divmod(n, size)
        if d >= 10:
            out += zh_number(d) + unit
        elif d:
            out += ("零" if zero else "") + digits[d] + unit
            zero = False
        elif out:
            zero = True
    return out


def roman(n: int) -> str:
    out = ""
    for v, s in ((40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= v:
            out, n = out + s, n - v
    return out


@dataclass
class Street:
    cls: str
    key: tuple
    geom: object
    district: int
    names: dict = field(default_factory=dict)
    status: str = "generated"


class Field:
    """Smooth 2-D displacement field from a few random plane waves per component, roughly unit amplitude."""

    def __init__(self, rng: np.random.Generator, wavelength_km: float, n: int = 6):
        ang = rng.uniform(0, 2 * math.pi, (2, n))
        k = 2 * math.pi / (wavelength_km * rng.uniform(0.7, 1.4, (2, n)))
        self.kx, self.ky = k * np.cos(ang), k * np.sin(ang)
        self.ph = rng.uniform(0, 2 * math.pi, (2, n))
        self.norm = math.sqrt(n / 2)

    def __call__(self, xy: np.ndarray) -> np.ndarray:
        x, y = xy[:, :1], xy[:, 1:2]
        return np.column_stack([np.sin(x * self.kx[c] + y * self.ky[c] + self.ph[c]).sum(1) / self.norm for c in range(2)])


def parallel_lines(area, origin, angle: float, spacing: float):
    """Lines at `angle` through origin + k·spacing (along the normal), long enough to cross `area`."""
    ux, uy = math.cos(angle), math.sin(angle)
    nx, ny = -uy, ux
    minx, miny, maxx, maxy = area.bounds
    corners = np.array([[minx, miny], [minx, maxy], [maxx, miny], [maxx, maxy]]) - origin
    across, along = corners @ (nx, ny), corners @ (ux, uy)
    a0, a1 = along.min() - 0.1, along.max() + 0.1
    for k in range(math.floor(across.min() / spacing), math.ceil(across.max() / spacing) + 1):
        ox, oy = origin[0] + k * spacing * nx, origin[1] + k * spacing * ny
        yield k, LineString([(ox + a0 * ux, oy + a0 * uy), (ox + a1 * ux, oy + a1 * uy)])


def poisson_points(poly, spacing: float, rng: np.random.Generator) -> list[tuple[float, float]]:
    minx, miny, maxx, maxy = poly.bounds
    n = int(poly.area / spacing ** 2 * 15) + 30
    cand = rng.uniform((minx, miny), (maxx, maxy), (n, 2))
    cand = cand[shapely.contains_xy(poly, cand[:, 0], cand[:, 1])]
    pts: list[tuple[float, float]] = []
    for x, y in cand:
        if all((x - px) ** 2 + (y - py) ** 2 >= spacing ** 2 for px, py in pts):
            pts.append((float(x), float(y)))
    return pts


def pieces(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "LineString":
        return [geom]
    return [g for g in getattr(geom, "geoms", []) if g.geom_type == "LineString"]


def keep(geom, cls):
    parts = [p for p in pieces(geom) if p.length >= MIN_PIECE_KM[cls]]
    if not parts:
        return None
    return parts[0] if len(parts) == 1 else shapely.MultiLineString(parts)


def mostly_inside(lines: list, area, share: float) -> np.ndarray:
    if not lines or area is None or area.is_empty:
        return np.zeros(len(lines), bool)
    arr = np.array(lines, dtype=object)
    inside = shapely.length(shapely.intersection(arr, area))
    return inside > share * shapely.length(arr)


def district_streets(built, core, style: str, angle: float, rng: np.random.Generator, p: dict, di: int) -> list[Street]:
    """Unbent street network of one district's built-up area `built` (real km)."""
    out: list[Street] = []
    radius = math.sqrt(built.area / math.pi)

    arterials = []
    if style in ("planned", "mixed"):
        spacing = p["arterial_spacing_km"] * (1.0 if style == "planned" else 1.3)
        for axis in (0, 1):
            for k, ln in parallel_lines(built, core, angle + axis * math.pi / 2, spacing):
                arterials.append(((di, "grid", axis, k), ln))
    else:
        n = 6
        for j in range(n):
            a = angle + j * 2 * math.pi / n + rng.normal(0, 0.18)
            far = (core[0] + 3 * radius * math.cos(a), core[1] + 3 * radius * math.sin(a))
            arterials.append(((di, "radial", j), LineString([core, far])))
    if style != "planned" and built.area > 12:
        ring = Point(core).buffer(0.55 * radius, quad_segs=24).exterior
        arterials.append(((di, "ring"), ring))
    art_geoms = []
    for key, ln in arterials:
        g = keep(ln.intersection(built), "arterial")
        if g is not None:
            out.append(Street("arterial", key, g, di))
            art_geoms.append(g)
    art_zone = shapely.union_all(art_geoms).buffer(0.12) if art_geoms else None

    pts = poisson_points(built, p["neighbourhood_km"], rng)
    if style == "planned":
        for axis in (0, 1):
            half = np.array(core) + spacing / 2 * np.array([-math.sin(angle + axis * math.pi / 2), math.cos(angle + axis * math.pi / 2)])
            for k, ln in parallel_lines(built, half, angle + axis * math.pi / 2, spacing):
                g = keep(ln.intersection(built), "collector")
                if g is not None:
                    out.append(Street("collector", (di, "mid", axis, k), g, di))
        cells = []
    elif len(pts) >= 2:
        cells = [c.intersection(built) for c in shapely.voronoi_polygons(MultiPoint(pts), extend_to=built.envelope.buffer(1)).geoms]
        edges = shapely.union_all([c.boundary for c in cells]).difference(built.boundary.buffer(0.03))
        edges = [e for e in pieces(shapely.line_merge(edges)) if e.length >= MIN_PIECE_KM["collector"]]
        on_art = mostly_inside(edges, art_zone, 0.5)
        for ei, e in enumerate(edges):
            if not on_art[ei]:
                out.append(Street("collector", (di, "edge", ei), e, di))
    else:
        cells = [built]
    major_zone = shapely.union_all([s.geom for s in out]) if out else None

    if style == "planned":
        # one continuous grid; lines divide each half-block evenly and are grouped per band between majors
        lo, hi = p["local_spacing_km"][style]
        per = max(2, round(spacing / 2 / rng.uniform(lo, hi)))
        sp = spacing / 2 / per
        near = major_zone.buffer(0.3 * sp) if major_zone is not None else None
        for axis in (0, 1):
            cand = [(k, keep(ln.intersection(built), "local"))
                    for k, ln in parallel_lines(built, core, angle + axis * math.pi / 2, sp) if k % per]
            cand = [(k, g) for k, g in cand if g is not None]
            dup = mostly_inside([g for _, g in cand], near, 0.6)
            for (k, g), d in zip(cand, dup):
                if not d:
                    out.append(Street("local", (di, "cell", k // per, axis, k), g, di))

    spread = {"planned": 0.02, "mixed": 0.35}.get(style)
    for ci, cell in enumerate(cells):
        if cell.is_empty or cell.area < 0.04:
            continue
        a = angle + rng.normal(0, spread) if spread is not None else rng.uniform(0, math.pi)
        lo, hi = p["local_spacing_km"][style]
        sp = rng.uniform(lo, hi)
        origin = np.array(cell.representative_point().coords[0]) + rng.uniform(-sp / 2, sp / 2, 2)
        axes = (0, 1) if style != "organic" or rng.random() < 0.65 else (0,)
        near = major_zone.buffer(0.45 * sp) if major_zone is not None else None
        for axis in axes:
            step = sp if axis == 0 else sp * rng.choice([1.0, 1.0, 1.5, 2.2])
            cand = []
            for k, ln in parallel_lines(cell, origin, a + axis * math.pi / 2, step):
                cls = "collector" if k == 0 and cell.area > 0.6 else "local"
                g = keep(ln.intersection(cell), cls)
                if g is None:
                    continue
                if cls == "local" and style == "organic" and rng.random() < 0.12:
                    continue
                if cls == "local" and style != "planned" and rng.random() < 0.15:
                    part = max(pieces(g), key=lambda q: q.length)
                    g = keep(substring(part, 0, part.length * rng.uniform(0.35, 0.8)), cls)
                    if g is None:
                        continue
                cand.append((k, cls, g))
            dup = mostly_inside([g for _, _, g in cand], near, 0.6)
            for (k, cls, g), d in zip(cand, dup):
                if cls == "local" and d:
                    continue
                out.append(Street(cls, (di, "cell", ci, axis, k), g, di))
    return out


def bend(streets: list[Street], fld: Field, amp: float, step: float = 0.04):
    if amp <= 0:
        return
    for s in streets:
        s.geom = shapely.transform(shapely.segmentize(s.geom, step), lambda c: c + amp * fld(c))


# ── names ─────────────────────────────────────────────────────────


def _row(s: str) -> dict:
    zh, en, v, b = (x.strip() for x in s.split("|"))
    return {"zh": zh, "en": en, "art-x-viking": v, "art-x-buckham": b}


class Namer:
    """Four-language street names from stems and class suffixes, unique within a city."""

    def __init__(self, path: Path, places: list[dict]):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        self.suffixes = {cls: [_row(s) for s in rows] for cls, rows in data["suffixes"].items()}
        self.themes = {t: [_row(s) for s in rows] for t, rows in data["themes"].items()}
        self.themes["places"] = places
        self.numbered = [_row(s) for s in data["numbered"]]
        self.styles = data["styles"]
        self.used: set[str] = set()
        self.used_stems: set[str] = set()
        self.banned_stems: set[str] = set()

    def reserve(self, names: dict):
        self.used.add(names["zh"])
        zh = names["zh"]
        for suf in sorted({s["zh"] for pool in self.suffixes.values() for s in pool}, key=len, reverse=True):
            if zh.endswith(suf):
                self.used_stems.add(zh.removesuffix(suf))
                self.banned_stems.add(zh.removesuffix(suf))
                break

    @staticmethod
    def compose(stem: dict, suffix: dict, n: int = 0) -> dict:
        zh = stem["zh"] + (zh_number(n) if n else "") + suffix["zh"]
        en = f"{stem['en']} {suffix['en']}" + (f" {n}" if n else "")
        out = {"zh": zh, "en": en}
        v = stem.get("art-x-viking")
        if v:
            vs = suffix["art-x-viking"]
            viking = "-".join(v.split()) + "-" + vs.capitalize() if " " in v else v + vs
            out["art-x-viking"] = viking + (f" {roman(n)}" if n else "")
        b = stem.get("art-x-buckham")
        if b:
            out["art-x-buckham"] = f"{suffix['art-x-buckham']} {b}" + (f" {roman(n)}" if n else "")
        return out

    def theme(self, style: str, rng: np.random.Generator) -> str:
        weights = self.styles[style]
        names = list(weights)
        w = np.array([weights[t] for t in names], float)
        return names[rng.choice(len(names), p=w / w.sum())]

    def stem(self, theme: str, rng: np.random.Generator) -> dict:
        pool = [s for s in self.themes[theme] if s["zh"] not in self.banned_stems] or self.themes[theme]
        fresh = [s for s in pool if s["zh"] not in self.used_stems]
        s = (fresh or pool)[rng.integers(len(fresh or pool))]
        self.used_stems.add(s["zh"])
        return s

    def suffix(self, cls: str, rng: np.random.Generator) -> dict:
        pool = self.suffixes[cls]
        w = np.array([3.0] + [1.0] * (len(pool) - 1))
        return pool[rng.choice(len(pool), p=w / w.sum())]

    def single(self, cls: str, style: str, rng: np.random.Generator) -> dict:
        for _ in range(40):
            t = self.theme(style, rng)
            if t == "numbered":
                t = "civic"
            names = self.compose(self.stem(t, rng), self.suffix(cls, rng))
            if names["zh"] not in self.used:
                self.used.add(names["zh"])
                return names
        return self.series(cls, style, rng, 1)[0]

    def series(self, cls: str, style: str, rng: np.random.Generator, count: int) -> list[dict]:
        """Names for `count` parallel streets: one stem and suffix with ordinals 1..count."""
        for _ in range(40):
            t = self.theme(style, rng)
            stem = self.numbered[rng.integers(2)] if t == "numbered" else self.stem(t, rng)
            suffix = self.suffix(cls, rng) if t != "numbered" else self.suffixes["collector"][0]
            names = [self.compose(stem, suffix, n + 1) for n in range(count)]
            if not any(nm["zh"] in self.used for nm in names):
                self.used.update(nm["zh"] for nm in names)
                return names
        # pools used up: continue a numbered series past its highest ordinal
        stem, suffix = self.numbered[rng.integers(2)], self.suffixes["collector"][0]
        start = 1
        while any(self.compose(stem, suffix, start + n)["zh"] in self.used for n in range(count)):
            start += 1
        names = [self.compose(stem, suffix, start + n) for n in range(count)]
        self.used.update(nm["zh"] for nm in names)
        return names


def assign_names(streets: list[Street], namer: Namer, styles: list[str], rng: np.random.Generator, named: dict[tuple, dict]):
    """Name every street; `named` maps arterial keys to fixed names (and status)."""
    for s in streets:
        if s.key in named:
            s.names = dict(named[s.key]["names"])
            s.status = named[s.key].get("status", "canon")
            namer.reserve(s.names)
    groups: dict[tuple, list[Street]] = {}
    for s in streets:
        if s.names:
            continue
        if s.key[1] == "cell":
            groups.setdefault(s.key[:4] + (s.cls,), []).append(s)
        else:
            groups.setdefault((s.key,), []).append(s)
    for gk in sorted(groups, key=repr):
        members = sorted(groups[gk], key=lambda s: s.key[-1] if isinstance(s.key[-1], int) else 0)
        style = styles[members[0].district]
        if 3 <= len(members) <= 10 and members[0].cls == "local" and rng.random() < 0.45:
            for s, names in zip(members, namer.series("local", style, rng, len(members))):
                s.names = names
        else:
            for s in members:
                s.names = namer.single(s.cls, style, rng)
