"""Detection of coastal landforms (islands, bays, fjords, capes, straits) from the land mask.

Each detector returns candidates in design km: {"kind", "at": (x, y), "metrics", "geom"?}.
Names are attached later by matching candidates to entries in world/features/*.yaml whose
`detect.at_km` lies nearby, so a feature keeps its identity as long as the coast keeps its shape.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .vectorize import polygonize_labels


def _edt(mask: np.ndarray) -> np.ndarray:
    """Distance (pixels) from each True pixel to the nearest False pixel."""
    return ndimage.distance_transform_edt(mask)


def _xy(xs, ys, iy, ix):
    return float(xs[ix]), float(ys[iy])


def islands(land, xs, ys, res, min_km2):
    lab, n = ndimage.label(land)
    if n < 2:
        return []
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)) * res * res
    main = 1 + int(np.argmax(sizes))
    out = []
    for k in range(1, n + 1):
        if k == main or sizes[k - 1] < min_km2:
            continue
        m = lab == k
        d = _edt(m)
        iy, ix = np.unravel_index(np.argmax(d), d.shape)
        poly = polygonize_labels(np.where(m, 0, -1), res).get(0)
        out.append({"kind": "island", "at": _xy(xs, ys, iy, ix), "geom": poly, "mask": m,
                    "metrics": {"area_km2": float(sizes[k - 1])}})
    return out


def bays(land, xs, ys, res, close_km, min_km2, fjord_elongation=3.2):
    """Sea enclosed by a morphological closing of the land: water the coast wraps around."""
    r = close_km / res
    grown = _edt(~land) <= r
    closed = _edt(grown) > r
    water = closed & ~land
    lab, n = ndimage.label(water)
    out = []
    for k, sl in enumerate(ndimage.find_objects(lab), start=1):
        m = lab[sl] == k
        area = m.sum() * res * res
        touches_edge = sl[0].start == 0 or sl[1].start == 0 or sl[0].stop == land.shape[0] or sl[1].stop == land.shape[1]
        if area < min_km2 or touches_edge:
            continue
        iy, ix = np.nonzero(m)
        pts = np.column_stack([ix, iy]).astype(float)
        ev = np.sort(np.linalg.eigvalsh(np.cov(pts.T)))[::-1] if len(pts) > 2 else np.array([1.0, 1.0])
        elongation = float(np.sqrt(ev[0] / max(ev[1], 1e-6)))
        full = np.zeros(land.shape, bool)
        full[sl] = m
        d = _edt(full)
        cy, cx = np.unravel_index(np.argmax(d), d.shape)
        poly = polygonize_labels(np.where(full, 0, -1), res, smooth=3, simplify_km=0.08).get(0)
        out.append({"kind": "fjord" if elongation >= fjord_elongation else "bay", "at": _xy(xs, ys, cy, cx), "geom": poly,
                    "metrics": {"area_km2": float(area), "elongation": round(elongation, 2),
                                "length_km": float(4 * np.sqrt(ev[0]) * res)}})
    return out


def capes(land, xs, ys, res, open_km, min_prominence_km):
    """Land left over by a morphological opening: tips that stick out from the main coast (islands excluded)."""
    r = open_km / res
    core = _edt(land) > r
    opened = _edt(~core) <= r
    lab, n = ndimage.label(land)
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    tips = (lab == 1 + int(np.argmax(sizes))) & ~opened
    lab, n = ndimage.label(tips)
    if not n:
        return []
    reach = ndimage.distance_transform_edt(~opened) * res
    out = []
    for k, sl in enumerate(ndimage.find_objects(lab), start=1):
        m = lab[sl] == k
        local = np.where(m, reach[sl], 0)
        prominence = float(local.max())
        if prominence < min_prominence_km:
            continue
        iy, ix = np.unravel_index(np.argmax(local), local.shape)
        out.append({"kind": "cape", "at": _xy(xs, ys, iy + sl[0].start, ix + sl[1].start),
                    "metrics": {"prominence_km": round(prominence, 2), "area_km2": float(m.sum() * res * res)}})
    return out


def straits(land, xs, ys, res, max_gap_km, min_island_km2):
    """Narrowest sea gap between each island and the nearest other land."""
    lab, n = ndimage.label(land)
    if n < 2:
        return []
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)) * res * res
    out = []
    for k in range(1, n + 1):
        if sizes[k - 1] < min_island_km2 or k == 1 + int(np.argmax(sizes)):
            continue
        own = lab == k
        dist, (ny_, nx_) = ndimage.distance_transform_edt(~(land & ~own), return_indices=True)
        d = np.where(own, dist, np.inf)
        iy, ix = np.unravel_index(np.argmin(d), d.shape)
        gap = float(d[iy, ix]) * res
        if gap > max_gap_km:
            continue
        oy, ox = int(ny_[iy, ix]), int(nx_[iy, ix])
        mx, my = (xs[ix] + xs[ox]) / 2, (ys[iy] + ys[oy]) / 2
        angle = float(np.degrees(np.arctan2(ys[oy] - ys[iy], xs[ox] - xs[ix])))
        out.append({"kind": "strait", "at": (float(mx), float(my)),
                    "metrics": {"width_km": round(gap, 2), "island_area_km2": float(sizes[k - 1]), "angle_deg": round(angle, 1)}})
    return out


def match(candidates: list[dict], entries: list[dict], radius_km: float):
    """Pair YAML entries (with detect.kind / detect.at_km) to candidates of the same kind, nearest first."""
    pairs = []
    for ei, e in enumerate(entries):
        ex, ey = e["detect"]["at_km"]
        for ci, c in enumerate(candidates):
            if c["kind"] != e["detect"]["kind"]:
                continue
            d = float(np.hypot(c["at"][0] - ex, c["at"][1] - ey))
            if d <= e["detect"].get("radius_km", radius_km):
                pairs.append((d, ei, ci))
    used_e, used_c, out = set(), set(), {}
    for d, ei, ci in sorted(pairs):
        if ei in used_e or ci in used_c:
            continue
        used_e.add(ei)
        used_c.add(ci)
        out[ei] = ci
    return out
