"""Coastline and elevation synthesis."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .grid import Grid, polyline_distance, polyline_param
from .noise import grid_noise


def land_mask(spec: dict, seed: int, g: Grid, target_km2: float, min_islet_km2=1.0) -> np.ndarray:
    land = spec["land"]
    X, Y = g.X, g.Y
    f = np.zeros(g.shape)
    for cx, cy, rx, ry, ang, w in land["lobes"]:
        a = np.deg2rad(ang)
        u = (X - cx) * np.cos(a) + (Y - cy) * np.sin(a)
        v = -(X - cx) * np.sin(a) + (Y - cy) * np.cos(a)
        f += w * np.exp(-(((u / rx) ** 2 + (v / ry) ** 2) ** 1.3))
    cn = land["coast_noise"]
    f += cn["amplitude"] * grid_noise(seed, cn["scale_km"], cn["octaves"], 0.55, g)
    if cn.get("detail_amplitude"):
        f += cn["detail_amplitude"] * grid_noise(seed + 1, cn["detail_scale_km"], 4, 0.6, g)
    # Rough ground: [cx, cy, rx, ry, amplitude, scale_km], extra fine noise in an ellipse that breaks
    # the coast there into sounds, inlets and islets.
    for k, (cx, cy, rx, ry, amp, scale) in enumerate(land.get("rough", [])):
        env = np.exp(-((((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2) ** 2))
        f += amp * env * grid_noise(seed + 900 + k, scale, 5, 0.6, g)
    for path, width, depth in land.get("fjords", []):
        f -= depth * np.exp(-((polyline_distance(path, X, Y) / width) ** 2))
    border = np.minimum.reduce([X, g.w - X, Y, g.h - Y])
    f -= 1.5 * np.clip((10 - border) / 10, 0, 1)
    if g.noise_h < g.h:
        # a grown frame: open sea goes on past the old top edge, and land there comes from lobes
        # weighted to rise above it
        f -= 1.5 * np.clip((Y - (g.noise_h - 10)) / 10, 0, 1)

    lo, hi = float(f.min()), float(f.max())
    for _ in range(60):
        t = (lo + hi) / 2
        if (f > t).sum() * g.cell > target_km2:
            lo = t
        else:
            hi = t
    mask = f > hi
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1)) * g.cell
    mask &= np.isin(lab, 1 + np.nonzero(sizes >= min_islet_km2)[0])
    return ndimage.binary_fill_holes(mask)


def elevation(spec: dict, seed: int, g: Grid, land: np.ndarray):
    t = spec["terrain"]
    X, Y = g.X, g.Y
    dcoast = ndimage.distance_transform_edt(land) * g.res
    rn = grid_noise(seed + 7, 25, 6, 0.55, g)
    ridged = np.clip(1 - np.abs(grid_noise(seed + 11, 14, 6, 0.5, g)), 0, None)
    e = 120 + 160 * np.clip(grid_noise(seed + 3, 40, 6, 0.5, g) + 0.5, 0, None)
    mount = np.zeros(g.shape)
    # Alpine ridges rise above max_elevation_m towards alpine_max_m; they are added after the rest
    # of the relief is flattened towards max_elevation_m, which they leave as it was.
    alp, alp_mount = np.zeros(g.shape), np.zeros(g.shape)
    for r in t["ridges"]:
        m = np.exp(-((polyline_distance(r["path"], X, Y) / r["width_km"]) ** 2))
        if r.get("alpine"):
            alp_mount = np.maximum(alp_mount, m)
            alp += r["height_m"] * m * (1 + 0.3 * rn)
            continue
        mount = np.maximum(mount, m)
        e += r["height_m"] * m * (1 + 0.3 * rn)
    e += 450 * mount * ridged
    alp += 900 * alp_mount * ridged
    for cx, cy, radius, k in t.get("plains", []):
        e *= 1 - k * np.exp(-((np.hypot(X - cx, Y - cy) / radius) ** 2))
    for v in t.get("valleys", []):
        # A valley floor falling steadily from source to mouth, so the main stream follows it.
        d, s = polyline_param(v["path"], X, Y)
        floor = v["source_m"] * (1 - s) + 4 * s
        m = v.get("strength", 0.9) * np.exp(-((d / v["width_km"]) ** 2))
        e = e * (1 - m) + np.minimum(e, floor) * m
    peak = t.get("max_elevation_m", 2500)
    soft = peak * np.tanh(e / peak)
    if alp_mount.any():
        top = t["alpine_max_m"]
        soft += top * (np.tanh((e + alp) / top) - np.tanh(e / top))
    e = soft
    e *= np.clip(dcoast / 5, 0, 1) ** 0.6
    e[~land] = 0
    return e, dcoast


def drainage_surface(e: np.ndarray, seed: int, g: Grid, land: np.ndarray) -> np.ndarray:
    """Elevation with low-amplitude noise so that streams meander across flat plains."""
    n = grid_noise(seed + 31, 6, 4, 0.5, g)
    return np.where(land, e + 25 * n, 0)
