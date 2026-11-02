"""Deterministic, resolution-independent fractal value noise."""
from __future__ import annotations

import numpy as np
from scipy import ndimage


def value_noise(seed: int, scale_km: float, octaves: int, persistence: float, extent_km, shape) -> np.ndarray:
    """Unit-variance fBm. The random lattice depends only on (seed, scale, extent),
    so the same field is reproduced at any output resolution."""
    rng = np.random.default_rng(seed)
    w, h = extent_km
    out = np.zeros(shape)
    amp, s = 1.0, scale_km
    for _ in range(octaves):
        gx, gy = max(4, int(w / s) + 4), max(4, int(h / s) + 4)
        lattice = rng.standard_normal((gy, gx))
        z = ndimage.zoom(lattice, (shape[0] / gy, shape[1] / gx), order=3, mode="mirror")
        out += amp * z[: shape[0], : shape[1]]
        amp *= persistence
        s /= 2
    return out / out.std()


# Rows below a grown frame's old top edge that ease into the new field.
_BLEND_KM = 12.0


def grid_noise(seed: int, scale_km: float, octaves: int, persistence: float, g) -> np.ndarray:
    """value_noise over grid g. A frame grown northward past g.noise_h keeps its old field below that
    height, so the land already there comes out the same, easing into a field of its own above."""
    if g.noise_h >= g.h:
        return value_noise(seed, scale_km, octaves, persistence, (g.w, g.h), g.shape)
    ny0 = int(round(g.noise_h / g.res))
    base = np.zeros(g.shape)
    base[:ny0] = value_noise(seed, scale_km, octaves, persistence, (g.w, g.noise_h), (ny0, g.shape[1]))
    new = value_noise(seed + 7919, scale_km, octaves, persistence, (g.w, g.h), g.shape)
    t = np.clip((g.ys - (g.noise_h - _BLEND_KM)) / _BLEND_KM, 0, 1)[:, None]
    return (base * (1 - t) + new * t) / np.sqrt((1 - t) ** 2 + t ** 2)
