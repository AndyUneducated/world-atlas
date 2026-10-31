"""Climate on the city and district cards, from the model in world/climate.yaml: monthly mean highs and lows,
precipitation, sunshine and day length, the extremes, polar night and midnight sun, and the climate type.
A district's climate comes from its latitude, mean elevation, distance to the sea and the land and hills the
prevailing wind crosses before it arrives; a city shows the climate of its most populous district.
Runs after the regions merge, on the whole world's entities and division shapes."""
from __future__ import annotations

import hashlib
import math
from pathlib import Path

import numpy as np
from shapely import prepared, transform
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

from .dem_tiles import _decode
from .world import World

DAYS = np.array([31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
MID = np.cumsum(DAYS) - DAYS / 2  # day of year at mid-month
KM_LAT = 110.57


def _rng(eid: str) -> np.random.Generator:
    return np.random.default_rng(int(hashlib.sha1(("climate:" + eid).encode()).hexdigest()[:8], 16))


def _km_lon(lat: float) -> float:
    return 111.32 * math.cos(math.radians(lat))


def day_lengths(lat: float) -> np.ndarray:
    """Hours from sunrise to sunset (upper limb, with refraction) for every day of the year."""
    n = np.arange(1, 366)
    decl = np.radians(23.44) * np.sin(2 * np.pi * (284 + n) / 365)
    phi = math.radians(lat)
    cos_w = (math.sin(math.radians(-0.833)) - math.sin(phi) * np.sin(decl)) / (math.cos(phi) * np.cos(decl))
    return 2 * np.degrees(np.arccos(np.clip(cos_w, -1, 1))) / 15


def elevation_at(dem: Path, lon: float, lat: float, z: int = 10) -> float:
    """Ground height (m) at a point from the terrarium tiles, the mean of the 3×3 pixels round it."""
    n = 2**z
    fx = (lon + 180) / 360 * n
    fy = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    tile = dem / str(z) / str(int(fx)) / f"{int(fy)}.png"
    if not tile.exists():
        return 0.0
    e = _decode(tile)
    px, py = int((fx % 1) * e.shape[1]), int((fy % 1) * e.shape[0])
    win = e[max(py - 1, 0):py + 2, max(px - 1, 0):px + 2]
    return max(0.0, float(win.mean()))


def _zonal(model: dict, lat: float) -> float:
    pts = sorted((float(k), v) for k, v in model["zonal_mean_c"].items())
    return float(np.interp(abs(lat), [p[0] for p in pts], [p[1] for p in pts]))


def _season(values: np.ndarray, peak_day: float, sharpness: float = 1.0) -> np.ndarray:
    """A yearly cycle with its maximum on peak_day, zero mean and unit range; sharpness > 1 gives a short
    summer peak over a long flat winter."""
    g = (1 + np.cos(2 * np.pi * (values - peak_day) / 365.25)) / 2
    g = g**sharpness
    g = g - g.mean()
    return g / (g.max() - g.min())


def koppen(t: np.ndarray, p: np.ndarray, north: bool = True) -> str:
    """Climate type from monthly mean temperatures (°C) and precipitation (mm)."""
    tann, pann = float(t.mean()), float(p.sum())
    summer = slice(3, 9) if north else None  # April to September
    p_summer = float(p[summer].sum()) if north else float(p[[0, 1, 2, 9, 10, 11]].sum())
    hot, cold = float(t.max()), float(t.min())
    if hot < 10:
        return "ET" if hot >= 0 else "EF"
    share = p_summer / pann if pann else 0
    threshold = 20 * tann + (280 if share >= 0.7 else 140 if share >= 0.3 else 0)
    if pann < threshold:
        return ("BW" if pann < threshold / 2 else "BS") + ("h" if tann >= 18 else "k")
    if cold >= 18:
        dry = float(p.min())
        if dry >= 60:
            return "Af"
        if dry >= 100 - pann / 25:
            return "Am"
        return "Aw"
    sm = p[3:9] if north else p[[0, 1, 2, 9, 10, 11]]
    wm = p[[0, 1, 2, 9, 10, 11]] if north else p[3:9]
    if sm.min() < 40 and sm.min() < wm.max() / 3:
        second = "s"
    elif wm.min() < sm.max() / 10:
        second = "w"
    else:
        second = "f"
    warm = int((t >= 10).sum())
    third = "a" if hot >= 22 else "b" if warm >= 4 else "d" if cold < -38 else "c"
    return ("C" if cold > 0 else "D") + second + third


class _Land:
    """The territories' land and the districts on it, for distances to the sea and the wind's path."""

    def __init__(self, features: list[dict], entities: dict):
        terr = [shape(f["geometry"]) for f in features if f["properties"].get("subtype") == "dependency"]
        self.terr = terr
        self.prep = [prepared.prep(g) for g in terr]
        boroughs = [(f["id"] if "id" in f else f["properties"]["id"], shape(f["geometry"]))
                    for f in features if f["properties"].get("subtype") == "borough"]
        self.ids = [i for i, _ in boroughs]
        self.tree = STRtree([g for _, g in boroughs])
        self.elev = {i: entities.get(i, {}).get("stats", {}).get("elev_mean_m", 0) for i in self.ids}

    def on_land(self, lon: float, lat: float) -> bool:
        p = Point(lon, lat)
        return any(g.contains(p) for g in self.prep)

    def coast_km(self, lon: float, lat: float) -> float:
        kx, ky = _km_lon(lat), KM_LAT
        best = math.inf
        for g in self.terr:
            local = transform(g.boundary, lambda xy: np.column_stack(((xy[:, 0] - lon) * kx, (xy[:, 1] - lat) * ky)))
            best = min(best, local.distance(Point(0, 0)))
        return best

    def upwind(self, lon: float, lat: float, wind_from: float, own: str) -> tuple[float, float]:
        """Land crossed by the wind before it reaches the point (km, up to 400) and the highest district
        mean elevation on that land (m)."""
        dx, dy = math.sin(math.radians(wind_from)), math.cos(math.radians(wind_from))
        fetch, top = 400.0, 0.0
        for d in (5, 10, 20, 30, 45, 60, 80, 100, 130, 160, 200, 250, 300, 350, 400):
            x, y = lon + dx * d / _km_lon(lat), lat + dy * d / KM_LAT
            if not self.on_land(x, y):
                fetch = d
                break
            for k in self.tree.query(Point(x, y), predicate="within"):
                if self.ids[k] != own:
                    top = max(top, self.elev[self.ids[k]])
        return fetch, top


def district(eid: str, e: dict, terr: dict, model: dict, land: _Land, elev: float) -> dict:
    lon, lat = e["center"]
    rng = _rng(eid)
    pert = model["perturbation"]
    coast = land.coast_km(lon, lat)
    fetch, top = land.upwind(lon, lat, terr["wind_from_deg"], eid)
    cont = max(1 - math.exp(-coast / 120), 0.45 * (1 - math.exp(-fetch / 400)))
    shadow = min(max((top - elev) / 1500, 0), 1)
    tropic = abs(lat) < 23.5
    polar = min(max((abs(lat) - 55) / 15, 0), 1)

    # temperature
    tann = (_zonal(model, lat) + terr["ocean_offset_c"] - model["lapse_c_per_km"] * elev / 1000
            - 1.5 * cont * min(abs(lat) / 60, 1) + rng.uniform(-1, 1) * pert["temperature_c"])
    if tropic:
        swing = 0.8 + 0.12 * abs(lat) + 2.5 * cont * abs(lat) / 15
        shape_ = _season(MID, 120)
    else:
        swing = (0.5 + 0.0038 * lat**2) * (1 + 0.8 * cont)
        shape_ = _season(MID, 200 + 20 * (1 - cont), 1 + 0.6 * polar)
    t = tann + swing * shape_

    # precipitation
    profile = terr["profile"]
    if profile == "tropical":
        a = min(max((abs(lat) - 2) / 8, 0), 1) * 0.85
        m = np.arange(1, 13)
        weights = 1 + a * np.cos(2 * np.pi * (m - 8) / 12) + 0.35 * (1 - a) * np.cos(4 * np.pi * (m - 4.5) / 12)
        weights = weights + 0.25 * shadow * (np.cos(2 * np.pi * (m - 8) / 12) - 1)  # a lee coast has a longer dry season
    else:
        base = np.array(model["profiles"][profile], dtype=float)
        weights = base / base.mean() * (1 - min(cont * 1.2, 1) * 0.6) + np.array(model["profiles"]["continental"]) * min(cont * 1.2, 1) * 0.6
    weights = np.clip(weights, 0.03, None)
    weights = weights / weights.mean()
    lift = {"maritime": 0.55, "arctic": 0.25, "tropical": 0.35}[profile]
    total = (terr["precip_mm"] * (0.75 + 0.5 * math.exp(-fetch / 120)) * (1 + lift * min(elev, 2500) / 1000)
             * (1 - 0.45 * shadow) * (1 + rng.uniform(-1, 1) * pert["precip"]))
    if polar and elev > 1200:  # the ice cap's plateau is a cold desert
        total *= math.exp(-(elev - 1200) / 2500)
    p = total * weights * DAYS / DAYS.sum()

    # day length and sunshine
    days = day_lengths(lat)
    bounds = np.concatenate(([0], np.cumsum([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])))
    daylight = np.array([days[bounds[i]:bounds[i + 1]].mean() for i in range(12)])
    share = np.clip(terr["sun_share"] * (1.3 - 0.3 * p / p.mean()) + 0.05 * cont + rng.uniform(-1, 1) * pert["sunshine"], 0.12, 0.82)
    sun = daylight * DAYS * share

    # daily range and extremes
    dtr = terr["day_range_c"] + 5 * cont + 1.2 * elev / 1000
    dtr_m = dtr * (0.65 + 0.7 * np.clip(share * np.minimum(daylight / 12, 1.2), 0, 1))
    hi, lo = t + dtr_m / 2, t - dtr_m / 2
    if tropic:
        rec_hi, rec_lo = hi.max() + 3.5, lo.min() - 4
    else:
        rec_hi = hi.max() + 6 + 7 * cont
        rec_lo = lo.min() - (9 + 11 * cont) * (1 + 0.3 * polar)
    rec_hi += rng.uniform(-0.8, 0.8)
    rec_lo += rng.uniform(-1.2, 1.2)

    return {
        "type": koppen(t, p, lat >= 0),
        "months": {
            "hi": [round(float(v), 1) for v in hi],
            "lo": [round(float(v), 1) for v in lo],
            "precip": [int(round(float(v))) for v in p],
            "sun": [int(round(float(v))) for v in sun],
            "daylight": [round(float(v), 1) for v in daylight],
        },
        "mean_c": round(float(t.mean()), 1),
        "precip_mm": int(round(float(p.sum()))),
        "sun_h": int(round(float(sun.sum()), -1)),
        "record": {"hi": round(float(rec_hi), 1), "lo": round(float(rec_lo), 1)},
        "polar_night_days": int((days < 0.01).sum()),
        "midnight_sun_days": int((days > 23.99).sum()),
        "elevation_m": int(round(elev)),
        "coast_km": round(coast, 1),
    }


def annotate(world: World, entities: dict, divisions: list[dict], dem: Path) -> None:
    """Add a climate to every district (at its centre, at the ground height there or the district's mean
    height if lower: people live in the valleys), and to every city from its most populous district."""
    model = world.climate
    if not model:
        return
    land = _Land(divisions, entities)
    terrs = model["territories"]
    for eid, d in world.divisions.items():
        e = entities.get(eid)
        if d["subtype"] != "borough" or not e or "center" not in e:
            continue
        tid = next((a for a in world.ancestors(eid) if a in terrs), None)
        if tid:
            elev = min(elevation_at(dem, *e["center"]), float(e.get("stats", {}).get("elev_mean_m", 0)))
            e["climate"] = district(eid, e, terrs[tid], model, land, max(elev, 0.0))
    for eid, d in world.divisions.items():
        e = entities.get(eid)
        if d["subtype"] != "locality" or not e:
            continue
        kids = [entities[c["id"]] for c in world.children(eid) if "climate" in entities.get(c["id"], {})]
        if not kids:
            continue
        main = max(kids, key=lambda k: (k.get("population", 0), k.get("center") == e.get("center")))
        e["climate"] = {**main["climate"], "at": main["id"]}
