"""Land cover classes from elevation, slope, aspect, wetness and distance to settlements."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

from .noise import grid_noise
from .relief import slope_aspect

# Order is the class index written to the map data; earlier classes win where rules overlap.
CLASSES = ("urban", "wetland", "farmland", "rock", "tundra", "forest", "desert", "scrub", "rainforest", "savanna")


def classify(elev, land, g, real_km_per_cell, km_per_design, seed, settlements, acc, p):
    """elev/land/acc on grid g; settlements: [(x, y, population)] in design km.

    p: the generator's landcover section (real units). Returns an int raster, -1 off land.
    """
    slope, north = slope_aspect(elev, real_km_per_cell)
    n1 = grid_noise(seed + 401, 18, 4, 0.5, g)
    n2 = grid_noise(seed + 402, 7, 4, 0.5, g)

    # Each settlement's built-up area is a noisy disc on buildable land, sized to its population.
    # Mountain towns with no gentle ground near their centre build on steeper terraces instead.
    buildable = land & (slope < p["urban_max_slope_deg"])
    terraced = land & (slope < p.get("urban_terrace_slope_deg", p["urban_max_slope_deg"]))
    cell_km2 = (g.res * km_per_design) ** 2
    urban = np.zeros(g.shape, bool)
    small = np.zeros(g.shape, bool)  # towns too small to survive the speckle filter
    for x, y, pop in settlements:
        target = max(pop / p["urban_density_per_km2"], cell_km2)
        d = np.hypot(g.X - x, g.Y - y) / np.clip(1 + 0.6 * n2, 0.35, None)
        r0 = np.sqrt(target / np.pi) / km_per_design
        for ground in (buildable, terraced):
            r = r0
            for _ in range(5):
                area = np.count_nonzero(ground & (d < r)) * cell_km2
                r *= 2.0 if area == 0 else min(2.0, max(0.5, np.sqrt(target / area)))
            disc = ground & (d < r)
            if r <= 3 * r0 and np.count_nonzero(disc) * cell_km2 >= 0.5 * target:
                break
        cap = p.get("urban_max_area_ratio")
        if cap and np.count_nonzero(disc) * cell_km2 > cap * target:  # far from buildable ground: keep the nearest
            idx = np.flatnonzero(disc)
            disc = np.zeros_like(disc)
            disc.ravel()[idx[np.argsort(d.ravel()[idx])[:int(np.ceil(target / cell_km2))]]] = True
        urban |= disc
        if np.count_nonzero(disc) < 9:
            small |= disc
    reach = ndimage.distance_transform_edt(~urban) * g.res * km_per_design

    wet = np.log1p(acc) - 0.6 * slope
    wetland = land & (elev < p["wetland_max_elev_m"]) & (slope < 1.5) & (wet + 2.5 * n1 > p["wetland_wetness"])
    farmland = land & (elev < p["farm_max_elev_m"]) & (slope < p["farm_max_slope_deg"]) & (reach < p["farm_reach_km"] * (1 + n1))
    treeline = p["treeline_m"] - p["treeline_aspect_m"] * north + 160 * n1
    rock = land & ((elev > treeline + p["rock_above_treeline_m"]) | (slope > p["rock_slope_deg"]))
    tundra = land & (elev > treeline)

    out = np.full(g.shape, -1, dtype=np.int16)
    # the wild cover where no rule below applies: forest, or (in the tropics) rainforest, which gives way
    # to montane forest above montane_m
    out[land] = CLASSES.index(p.get("base", "forest"))
    if "montane_m" in p:
        out[land & (elev > p["montane_m"] + 150 * n1)] = CLASSES.index("forest")
    # Dry zones: {kind: desert, scrub or savanna, ellipse: [cx, cy, rx, ry] in design km, max_elev_m};
    # ground there below that height takes that cover instead, with ragged edges, except along streams
    # and on north-facing slopes, which stay wooded
    for k, z in enumerate(p.get("dry_zones", [])):
        cx, cy, rx, ry = z["ellipse"]
        edge = ((g.X - cx) / rx) ** 2 + ((g.Y - cy) / ry) ** 2 + 0.5 * grid_noise(seed + 410 + k, 12, 4, 0.5, g)
        lift = z["max_elev_m"] * (1 - 0.5 * north) + 250 * n1
        out[land & (edge < 1) & (elev < lift) & (wet < z.get("wet_max", 6.5))] = CLASSES.index(z["kind"])
    for name, m in (("tundra", tundra), ("rock", rock), ("farmland", farmland), ("wetland", wetland), ("urban", urban)):
        out[m] = CLASSES.index(name)
    out = _majority(out, land)
    out[small] = CLASSES.index("urban")
    return out


def _majority(classes: np.ndarray, land: np.ndarray, size: int = 3) -> np.ndarray:
    """Remove single-cell speckle: each land cell takes the most common class around it."""
    votes = np.stack([ndimage.uniform_filter((classes == k).astype(np.float32), size) for k in range(len(CLASSES))])
    out = np.argmax(votes, axis=0).astype(np.int16)
    out[~land] = -1
    return out
