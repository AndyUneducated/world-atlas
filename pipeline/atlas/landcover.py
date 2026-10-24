"""Land cover classes from elevation, slope, aspect, wetness and distance to settlements."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .noise import value_noise
from .relief import slope_aspect

# Order is the class index written to the map data; earlier classes win where rules overlap.
CLASSES = ("urban", "wetland", "farmland", "rock", "tundra", "forest")


def classify(elev, land, g, real_km_per_cell, km_per_design, seed, settlements, acc, p):
    """elev/land/acc on grid g; settlements: [(x, y, population)] in design km.

    p: the generator's landcover section (real units). Returns an int raster, -1 off land.
    """
    slope, north = slope_aspect(elev, real_km_per_cell)
    ext = (g.w, g.h)
    n1 = value_noise(seed + 401, 18, 4, 0.5, ext, g.shape)
    n2 = value_noise(seed + 402, 7, 4, 0.5, ext, g.shape)

    urban = np.zeros(g.shape, bool)
    for x, y, pop in settlements:
        r = np.sqrt(pop / p["urban_density_per_km2"] / np.pi) / km_per_design
        d = np.hypot(g.X - x, g.Y - y)
        urban |= d < r * (1 + 0.9 * n2)
    urban &= land & (slope < p["urban_max_slope_deg"])
    reach = ndimage.distance_transform_edt(~urban) * g.res * km_per_design

    wet = np.log1p(acc) - 0.6 * slope
    wetland = land & (elev < p["wetland_max_elev_m"]) & (slope < 1.5) & (wet + 2.5 * n1 > p["wetland_wetness"])
    farmland = land & (elev < p["farm_max_elev_m"]) & (slope < p["farm_max_slope_deg"]) & (reach < p["farm_reach_km"] * (1 + n1))
    treeline = p["treeline_m"] - p["treeline_aspect_m"] * north + 160 * n1
    rock = land & ((elev > treeline + p["rock_above_treeline_m"]) | (slope > p["rock_slope_deg"]))
    tundra = land & (elev > treeline)

    out = np.full(g.shape, -1, dtype=np.int16)
    out[land] = CLASSES.index("forest")
    for name, m in (("tundra", tundra), ("rock", rock), ("farmland", farmland), ("wetland", wetland), ("urban", urban)):
        out[m] = CLASSES.index(name)
    return _majority(out, land)


def _majority(classes: np.ndarray, land: np.ndarray, size: int = 3) -> np.ndarray:
    """Remove single-cell speckle: each land cell takes the most common class around it."""
    votes = np.stack([ndimage.uniform_filter((classes == k).astype(np.float32), size) for k in range(len(CLASSES))])
    out = np.argmax(votes, axis=0).astype(np.int16)
    out[~land] = -1
    return out
