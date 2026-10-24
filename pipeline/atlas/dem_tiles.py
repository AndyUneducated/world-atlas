"""Terrarium-encoded raster-dem tiles (XYZ, Web Mercator) for MapLibre hillshade."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def _tile_range(bounds, z):
    w, s, e, n = bounds
    k = 2 ** z

    def tx(lon):
        return int((lon + 180) / 360 * k)

    def ty(lat):
        r = math.radians(lat)
        return int((1 - math.asinh(math.tan(r)) / math.pi) / 2 * k)

    return range(tx(w), tx(e) + 1), range(ty(n), ty(s) + 1)


def write_dem_tiles(out_dir: Path, elev: np.ndarray, grid, frame, bounds, zooms=range(3, 11), size=256, sea_level_m=-40.0):
    """sea_level_m: elevation written for open water, below 0 so styles can mask the sea."""
    count = 0
    for z in zooms:
        k = 2 ** z
        xs_r, ys_r = _tile_range(bounds, z)
        for tx in xs_r:
            for ty in ys_r:
                i = (np.arange(size) + 0.5) / size
                lon = (tx + i) / k * 360 - 180
                lat = np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * (ty + i) / k))))
                LON, LAT = np.meshgrid(lon, lat)
                x, y = frame.from_lonlat(LON, LAT)
                e = ndimage.map_coordinates(elev, [y / grid.res - 0.5, x / grid.res - 0.5], order=1, mode="constant", cval=sea_level_m)
                v = e + 32768.0
                rgb = np.stack([np.floor(v / 256), np.floor(v % 256), np.floor((v - np.floor(v)) * 256)], axis=-1)
                path = out_dir / str(z) / str(tx)
                path.mkdir(parents=True, exist_ok=True)
                Image.fromarray(rgb.astype(np.uint8), "RGB").save(path / f"{ty}.png", optimize=True)
                count += 1
    return count
