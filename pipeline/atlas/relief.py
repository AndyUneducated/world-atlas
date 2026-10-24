"""Detection of mountain landforms (peaks, passes, glaciers) from the elevation grid.

Candidates follow the same shape as pipeline/atlas/coast.py: {"kind", "at": (x, y) design km,
"metrics", "mask"?}, and are named by matching `detect` entries in world/features/*.yaml.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

_NEIGHBOURS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def slope_aspect(elev: np.ndarray, real_km_per_cell: float):
    """Slope in degrees, and northness: +1 where the ground falls away to the north, -1 to the south."""
    gy, gx = np.gradient(elev, real_km_per_cell * 1000)  # rows run south to north
    grad = np.hypot(gx, gy)
    northness = np.where(grad > 1e-4, -gy / np.maximum(grad, 1e-9), 0)
    return np.degrees(np.arctan(grad)), northness


def prominence(elev: np.ndarray, land: np.ndarray):
    """Topographic prominence of every summit, by flooding the land from the top down.

    Returns {summit cell: (prominence_m, key saddle cell or -1)}; cells are flat indices.
    The highest summit of each island has its own elevation as prominence and no saddle.
    """
    ny, nx = elev.shape
    flat = elev.ravel()
    order = np.argsort(-flat, kind="stable")
    order = order[land.ravel()[order]]
    parent = np.full(flat.size, -1, dtype=np.int64)
    summit = {}
    out = {}

    def find(a):
        root = a
        while parent[root] != root:
            root = parent[root]
        while parent[a] != root:
            parent[a], a = root, parent[a]
        return root

    for c in order.tolist():
        y, x = divmod(c, nx)
        roots = set()
        for dy, dx in _NEIGHBOURS:
            yy, xx = y + dy, x + dx
            if 0 <= yy < ny and 0 <= xx < nx:
                nb = yy * nx + xx
                if parent[nb] >= 0:
                    roots.add(find(nb))
        if not roots:
            parent[c] = c
            summit[c] = c
            continue
        ranked = sorted(roots, key=lambda r: -flat[summit[r]])
        main = ranked[0]
        for r in ranked[1:]:
            s = summit[r]
            out[s] = (float(flat[s] - flat[c]), c)
            parent[r] = main
        parent[c] = main
    for r, s in summit.items():
        if parent[r] == r:
            out[s] = (float(flat[s]), -1)
    return out


def peaks(elev, land, xs, ys, min_elev_m, min_prominence_m):
    prom = prominence(elev, land)
    nx = elev.shape[1]
    out = []
    for s, (p, saddle) in prom.items():
        if p < min_prominence_m or elev.flat[s] < min_elev_m:
            continue
        y, x = divmod(s, nx)
        out.append({"kind": "peak", "at": (float(xs[x]), float(ys[y])), "cell": s, "saddle": saddle,
                    "metrics": {"elev_m": float(elev.flat[s]), "prominence_m": p}})
    return sorted(out, key=lambda c: -c["metrics"]["elev_m"])


def passes(elev, peak_list, xs, ys, min_elev_m):
    """Key saddles of the detected peaks: the lowest point on the highest route to higher ground."""
    nx = elev.shape[1]
    out, seen = [], set()
    for pk in peak_list:
        s = pk["saddle"]
        if s < 0 or s in seen or elev.flat[s] < min_elev_m:
            continue
        seen.add(s)
        y, x = divmod(s, nx)
        out.append({"kind": "pass", "at": (float(xs[x]), float(ys[y])),
                    "metrics": {"elev_m": float(elev.flat[s]), "summit_m": pk["metrics"]["elev_m"]}})
    return out


def glaciers(elev, land, xs, ys, res, real_km_per_cell, snowline_m, aspect_m, max_slope_deg, min_km2):
    """Ice above a snowline that is lower on north-facing slopes (shaded) and higher on south-facing ones."""
    slope, northness = slope_aspect(elev, real_km_per_cell)
    line = snowline_m - aspect_m * northness
    ice = land & (elev >= line) & (slope <= max_slope_deg)
    ice = ndimage.binary_opening(ice, iterations=1)
    ice = ndimage.binary_closing(ice, iterations=2) & land
    lab, n = ndimage.label(ice)
    out = []
    for k, sl in enumerate(ndimage.find_objects(lab), start=1):
        m = lab[sl] == k
        area = float(m.sum() * res * res)
        if area < min_km2:
            continue
        full = np.zeros(land.shape, bool)
        full[sl] = m
        e = np.where(full, elev, -1)
        iy, ix = np.unravel_index(np.argmax(e), e.shape)
        ny_, nx_ = np.nonzero(full)
        out.append({"kind": "glacier", "at": (float(xs[int(np.median(nx_))]), float(ys[int(np.median(ny_))])), "mask": full,
                    "metrics": {"area_km2": area, "elev_max_m": float(elev[iy, ix]), "elev_min_m": float(elev[full].min())}})
    return sorted(out, key=lambda c: -c["metrics"]["area_km2"])
