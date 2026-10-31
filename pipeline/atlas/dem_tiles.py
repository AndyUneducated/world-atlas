"""Terrarium-encoded raster-dem tiles (XYZ, Web Mercator) for MapLibre hillshade, packed into one PMTiles archive."""
from __future__ import annotations

import hashlib
import io
import math
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from scipy import ndimage

from .cache import CACHE_DIR

MIN_ZOOM = 3
TILE_PX = 256
EQUATOR_M = 40075016.686


def max_zoom(generators) -> int:
    """The first zoom at which a tile pixel is no larger than the elevation cell, for the finest region.
    Deeper tiles would only interpolate the same cells; the map overzooms the last level instead."""
    out = MIN_ZOOM
    for spec in generators:
        f = spec["frame"]
        cell_m = f["resolution_km"] * f.get("scale", 1.0) * 1000
        px0 = EQUATOR_M * math.cos(math.radians(f["origin_lonlat"][1])) / TILE_PX
        out = max(out, math.ceil(math.log2(px0 / cell_m)))
    return out


def zoom_range(generators) -> range:
    return range(MIN_ZOOM, max_zoom(generators) + 1)


def _tile_range(bounds, z):
    w, s, e, n = bounds
    k = 2 ** z

    def tx(lon):
        return int((lon + 180) / 360 * k)

    def ty(lat):
        r = math.radians(lat)
        return int((1 - math.asinh(math.tan(r)) / math.pi) / 2 * k)

    return range(tx(w), tx(e) + 1), range(ty(n), ty(s) + 1)


def _decode(path: Path) -> np.ndarray:
    with Image.open(path) as im:
        rgb = np.asarray(im.convert("RGB"), float)
    return rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768.0


def _encode(e: np.ndarray, path: Path):
    v = e + 32768.0
    rgb = np.stack([np.floor(v / 256), np.floor(v % 256), np.floor((v - np.floor(v)) * 256)], axis=-1)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb.astype(np.uint8), "RGB").save(path, optimize=True)


def merge_dem_tiles(src_dir: Path, out_dir: Path, zooms: range) -> int:
    """Add one region's tiles at these zooms to out_dir; a tile another region already wrote keeps the higher
    of the two elevations.

    Tiles are hard links to the region's cached ones where the file system allows, so a merged tile
    replaces its link rather than writing through it into the cache."""
    count = 0
    for src in (p for z in zooms for p in (src_dir / str(z)).rglob("*.png")):
        dst = out_dir / src.relative_to(src_dir)
        if dst.exists():
            merged = np.maximum(_decode(src), _decode(dst))
            dst.unlink()
            _encode(merged, dst)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            _link(src, dst)
        count += 1
    return count


def _link(src, dst):
    """Hard-link a finished tile (tiles are replaced, never written in place), copying where links fail."""
    try:
        os.link(src, dst)
    except OSError:
        shutil.copyfile(src, dst)


def write_dem_tiles(out_dir: Path, elev: np.ndarray, grid, frame, bounds, zooms: range, size=TILE_PX, sea_level_m=-40.0):
    """sea_level_m: elevation written for open water, below 0 so styles can mask the sea.
    A tile already written keeps the higher of the two elevations."""
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
                path = out_dir / str(z) / str(tx) / f"{ty}.png"
                if path.exists():
                    e = np.maximum(e, _decode(path))
                _encode(e, path)
                count += 1
    return count


def cached_dem_tiles(out_dir: Path, name: str, elev: np.ndarray, grid, frame, bounds, zooms: range, enabled: bool = True) -> int:
    """write_dem_tiles, reusing the tiles of an earlier build when the elevation, frame and zooms are unchanged."""
    h = hashlib.sha256(elev.tobytes())
    h.update(repr((elev.shape, grid.res, frame.lon0, frame.lat0, frame.scale, bounds, zooms)).encode())
    h.update(Path(__file__).read_bytes())
    store = CACHE_DIR / f"dem-{name}-{h.hexdigest()[:16]}"
    if enabled and (store / "done").exists():
        shutil.copytree(store, out_dir, dirs_exist_ok=True, ignore=shutil.ignore_patterns("done"), copy_function=_link)
        return sum(1 for _ in out_dir.rglob("*.png"))
    n = write_dem_tiles(out_dir, elev, grid, frame, bounds, zooms)
    for old in CACHE_DIR.glob(f"dem-{name}-*"):
        shutil.rmtree(old)
    shutil.copytree(out_dir, store, copy_function=_link)
    (store / "done").touch()
    return n


def pack_dem_tiles(src_dir: Path, archive: Path, bounds, zooms: range, size=TILE_PX, sea_level_m=-40.0) -> tuple[int, int]:
    """Write the merged tiles under src_dir into one PMTiles archive covering bounds, with open water wherever no
    region wrote a tile, so every tile the map asks for exists. Identical tiles (all the open sea) are stored once.
    Returns the number of tiles and how many of them are open water."""
    v = sea_level_m + 32768.0
    buf = io.BytesIO()
    Image.fromarray(np.full((size, size, 3), [v // 256, v % 256, (v % 1) * 256], np.uint8), "RGB").save(buf, "PNG", optimize=True)
    sea = buf.getvalue()
    tiles = []
    for z in zooms:
        xs_r, ys_r = _tile_range(bounds, z)
        tiles += [(zxy_to_tileid(z, tx, ty), src_dir / str(z) / str(tx) / f"{ty}.png") for tx in xs_r for ty in ys_r]
    tiles.sort()
    open_water = 0
    archive.parent.mkdir(parents=True, exist_ok=True)
    with open(archive, "wb") as f:
        w = Writer(f)
        for tile_id, path in tiles:
            if path.exists():
                w.write_tile(tile_id, path.read_bytes())
            else:
                w.write_tile(tile_id, sea)
                open_water += 1
        west, south, east, north = bounds
        w.finalize({"tile_type": TileType.PNG, "tile_compression": Compression.NONE,
                    "min_lon_e7": round(west * 1e7), "min_lat_e7": round(south * 1e7),
                    "max_lon_e7": round(east * 1e7), "max_lat_e7": round(north * 1e7), "center_zoom": zooms.start},
                   {"name": "terrain", "encoding": "terrarium"})
    return len(tiles), open_water
