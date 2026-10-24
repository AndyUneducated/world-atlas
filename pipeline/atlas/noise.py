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
