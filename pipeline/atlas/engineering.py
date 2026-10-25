"""Structure profile, cost estimate and speed limits of a route (standards in world/transport/engineering.yaml)."""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import shapely


@dataclass
class Profile:
    """Per sample along the route; samples are path cells, or finer when profiled on a fine grid."""
    step_km: np.ndarray  # real km from the previous sample; step_km[0] == 0
    bridge: np.ndarray  # bool per sample
    tunnel: np.ndarray  # bool per sample
    rise_m_per_km: float
    river_bridges: int
    own: np.ndarray  # bool per sample: built under this route (not riding on an earlier one)
    cell: np.ndarray  # path index of each sample, non-decreasing

    @property
    def km(self) -> float:
        return float(self.step_km.sum())


def _fit_grade(terrain: np.ndarray, step_km: np.ndarray, smooth_km: float, max_grade: float) -> np.ndarray:
    """Grade line: a moving average of the ground, then limited to max_grade both ways."""
    dist = np.cumsum(step_km)
    half = smooth_km / 2
    lo = np.searchsorted(dist, dist - half, "left")
    hi = np.searchsorted(dist, dist + half, "right")
    csum = np.concatenate([[0.0], np.cumsum(terrain)])
    line = (csum[hi] - csum[lo]) / np.maximum(hi - lo, 1)
    line[0], line[-1] = terrain[0], terrain[-1]
    for i in range(1, len(line)):
        d = max_grade * step_km[i] * 1000
        line[i] = min(max(line[i], line[i - 1] - d), line[i - 1] + d)
    for i in range(len(line) - 2, -1, -1):
        d = max_grade * step_km[i + 1] * 1000
        line[i] = min(max(line[i], line[i + 1] - d), line[i + 1] + d)
    return line


def profile(path: list[int], router, elev: np.ndarray, water: np.ndarray, km_per_cell: float, std: dict,
            line_km=None, rivers=None, ref: str | None = None, urban_depth: np.ndarray | None = None,
            fine: tuple[np.ndarray, float] | None = None) -> Profile:
    """Where a route needs bridges and tunnels.

    path: router cells; elev, water: arrays on the router grid; km_per_cell: real km per cell side.
    line_km and rivers (design-km geometries) count river crossings. With ref, cells owned by
    another route are marked as not built under this one. urban_depth (router grid, real km
    inside the built-up area, 0 outside) applies the standard's urban rule: viaduct through
    built-up land, cut-and-cover tunnel deeper than tunnel_depth_km.
    fine: (elevation, resolution in design km) of a finer grid; the ground is then sampled at
    that spacing between cell centres, so hills and gullies smaller than a router cell count.
    """
    nx = router.nx
    path = np.asarray(path)
    own = np.array([ref is None or router.owner.get(int(c), ref) == ref for c in path])
    cy, cx = np.divmod(path, nx)
    cell_step = np.hypot(np.diff(cx), np.diff(cy)) * router.res
    if fine is None:
        cell = np.arange(len(path))
        step = np.concatenate([[0.0], cell_step]) * km_per_cell / router.res
        ground = elev[cy, cx]
    else:
        fe, fres = fine
        k = np.maximum(np.ceil(cell_step / fres).astype(int), 1)
        frac = np.concatenate([[0.0]] + [np.arange(1, n + 1) / n for n in k])
        prev = np.concatenate([[0], np.repeat(np.arange(len(path) - 1), k)])
        x = (cx[prev] + 0.5 + frac * (cx[np.minimum(prev + 1, len(path) - 1)] - cx[prev])) * router.res
        y = (cy[prev] + 0.5 + frac * (cy[np.minimum(prev + 1, len(path) - 1)] - cy[prev])) * router.res
        cell = np.where(frac > 0.5, prev + 1, prev)
        cell[0] = 0
        step = np.concatenate([[0.0], np.repeat(cell_step / k, k)]) * km_per_cell / router.res
        iy = np.clip((y / fres).astype(int), 0, fe.shape[0] - 1)
        ix = np.clip((x / fres).astype(int), 0, fe.shape[1] - 1)
        ground = np.maximum(fe[iy, ix], 0.0)
    wet = water[cy, cx][cell]
    ground = np.where(wet, 0.0, ground)
    grade = _fit_grade(ground, np.maximum(step, 1e-6), std["smooth_km"], std["max_grade"])
    tunnel = ~wet & (ground - grade > std["tunnel_above_m"])
    bridge = wet | (grade - ground > std["bridge_below_m"])
    if (urban := std.get("urban")) and urban_depth is not None:
        depth = urban_depth[cy, cx][cell]
        tunnel |= ~wet & (depth >= urban.get("tunnel_depth_km", math.inf))
        bridge |= (depth > 0) & ~tunnel
    rise = float(np.abs(np.diff(grade)).sum() / max(step.sum(), 1e-6))
    crossings = 0
    if line_km is not None and rivers is not None:
        hit = line_km.intersection(rivers)
        crossings = 0 if hit.is_empty else len(shapely.get_parts(hit))
    return Profile(step, bridge, tunnel, rise, crossings, own[cell], cell)


def structure_km(p: Profile, std: dict, i0: int = 0, i1: int | None = None, owned: bool = False) -> tuple[float, float, float]:
    """(total, bridge, tunnel) real km over path cells i0..i1; river bridges are spread along the whole route.

    owned: count only the cells built under this route.
    """
    sl = slice(int(np.searchsorted(p.cell, i0, "left")), None if i1 is None else int(np.searchsorted(p.cell, i1, "right")))
    step = p.step_km[sl] * (p.own[sl] if owned else 1)
    total = float(step.sum())
    bridge = float(step[p.bridge[sl]].sum())
    tunnel = float(step[p.tunnel[sl]].sum())
    if p.km > 0:
        bridge += p.river_bridges * std.get("river_bridge_km", 0) * total / p.km
    return total, min(bridge, total), min(tunnel, total - min(bridge, total))


def estimate(p: Profile, std: dict, climate: dict, stations: int = 0) -> dict:
    """Construction cost and yearly upkeep in USD of the stretches built under this route."""
    total, bridge, tunnel = structure_km(p, std, owned=True)
    grade = max(total - bridge - tunnel, 0.0)
    hill = 1 + (std.get("hill_factor", 1.5) - 1) * min(p.rise_m_per_km / 60, 1)
    c, u = std["cost_musd_per_km"], std["upkeep_kusd_per_km"]
    build = (grade * c["grade"] * hill + bridge * c["bridge"] + tunnel * c["tunnel"] + stations * std.get("station_musd", 0)) * 1e6
    upkeep = (grade * u["grade"] + bridge * u["bridge"] + tunnel * u["tunnel"]) * 1e3 + stations * std.get("station_upkeep_musd", 0) * 1e6
    build *= climate.get("construction", 1)
    upkeep *= climate.get("upkeep", 1)
    return {
        "length_km": round(total, 1),
        "bridge_km": round(bridge, 1),
        "tunnel_km": round(tunnel, 1),
        "river_bridges": p.river_bridges,
        **({"stations": stations} if stations else {}),
        "construction_usd": round_money(build),
        "upkeep_usd_per_year": round_money(upkeep),
    }


def round_money(v: float) -> int:
    if v <= 0:
        return 0
    digits = int(math.floor(math.log10(v))) - 2
    return int(round(v / 10 ** digits) * 10 ** digits)


def segment_speed(p: Profile, std: dict, i0: int, i1: int, density: float, rules: dict) -> int | None:
    """Speed limit of one stretch, km/h: the grade's floor in towns and mountains, else None (no limit)."""
    total, bridge, tunnel = structure_km(p, std, i0, i1)
    if density >= rules["urban_density"]:
        return std["speed"]["min"]
    if total > 0 and (bridge + tunnel) / total >= rules["mountain_structure_share"]:
        return std["speed"]["min"]
    return None


def speed_summary(limits: list[int | None]) -> dict:
    """Card summary: the limits that apply along the route, highest first; None (no limit) leads."""
    return {"limits": sorted(set(limits), key=lambda v: -1 if v is None else -v)}
