"""Raster grid in a local equal-area frame, and its mapping to planet lon/lat."""
from __future__ import annotations

import numpy as np

EARTH_RADIUS_KM = 6371.0088


class Frame:
    """Local sinusoidal (equal-area) frame: km offsets <-> lon/lat on the planet sphere.

    The generator works in design kilometres; `scale` maps one design km to that many real km on
    the planet, so the whole region can be resized without retuning any generator parameter.
    """

    def __init__(self, origin_lonlat, size_km, scale=1.0):
        self.lon0, self.lat0 = origin_lonlat
        self.w, self.h = size_km
        self.scale = float(scale)

    def km(self, design_km):
        """Design length -> real km."""
        return design_km * self.scale

    def km2(self, design_km2):
        """Design area -> real km²."""
        return design_km2 * self.scale * self.scale

    def to_lonlat(self, xy: np.ndarray) -> np.ndarray:
        xy = np.asarray(xy, float)
        lat = self.lat0 + np.degrees((xy[..., 1] - self.h / 2) * self.scale / EARTH_RADIUS_KM)
        lon = self.lon0 + np.degrees((xy[..., 0] - self.w / 2) * self.scale / (EARTH_RADIUS_KM * np.cos(np.radians(lat))))
        return np.stack([lon, lat], axis=-1)

    def from_lonlat(self, lon, lat):
        lon, lat = np.asarray(lon, float), np.asarray(lat, float)
        y = np.radians(lat - self.lat0) * EARTH_RADIUS_KM / self.scale + self.h / 2
        x = np.radians(lon - self.lon0) * EARTH_RADIUS_KM * np.cos(np.radians(lat)) / self.scale + self.w / 2
        return x, y

    def bounds_lonlat(self):
        corners = np.array([[0, 0], [self.w, 0], [0, self.h], [self.w, self.h], [self.w / 2, 0], [self.w / 2, self.h]])
        ll = self.to_lonlat(corners)
        return [float(ll[:, 0].min()), float(ll[:, 1].min()), float(ll[:, 0].max()), float(ll[:, 1].max())]


class Grid:
    def __init__(self, size_km, res_km):
        self.w, self.h = size_km
        self.res = res_km
        self.nx = int(round(self.w / res_km))
        self.ny = int(round(self.h / res_km))
        self.xs = (np.arange(self.nx) + 0.5) * res_km
        self.ys = (np.arange(self.ny) + 0.5) * res_km
        self.X, self.Y = np.meshgrid(self.xs, self.ys)
        self.cell = res_km * res_km

    @property
    def shape(self):
        return (self.ny, self.nx)

    def index_of(self, x, y):
        ix = np.clip((np.asarray(x) / self.res).astype(int), 0, self.nx - 1)
        iy = np.clip((np.asarray(y) / self.res).astype(int), 0, self.ny - 1)
        return iy, ix


def block_reduce(a: np.ndarray, factor: int, how="mean") -> np.ndarray:
    ny, nx = a.shape[0] // factor, a.shape[1] // factor
    b = a[: ny * factor, : nx * factor].reshape(ny, factor, nx, factor)
    if how == "mean":
        return b.mean(axis=(1, 3))
    if how == "max":
        return b.max(axis=(1, 3))
    if how == "mode_bool":
        return b.mean(axis=(1, 3)) >= 0.5
    raise ValueError(how)


def polyline_distance(pts, X, Y) -> np.ndarray:
    d = np.full(X.shape, np.inf)
    for (x1, y1), (x2, y2) in zip(pts[:-1], pts[1:]):
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(((X - x1) * dx + (Y - y1) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.minimum(d, np.hypot(X - (x1 + t * dx), Y - (y1 + t * dy)))
    return d


def polyline_param(pts, X, Y):
    """Distance to a polyline and the normalised arc position (0 at the first point) of the nearest point."""
    pts = np.asarray(pts, float)
    seg = np.hypot(*np.diff(pts, axis=0).T)
    start = np.concatenate([[0.0], np.cumsum(seg)])
    d = np.full(X.shape, np.inf)
    s = np.zeros(X.shape)
    for (x1, y1), (x2, y2), s0, ln in zip(pts[:-1], pts[1:], start, seg):
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(((X - x1) * dx + (Y - y1) * dy) / (dx * dx + dy * dy), 0, 1)
        dd = np.hypot(X - (x1 + t * dx), Y - (y1 + t * dy))
        closer = dd < d
        d[closer] = dd[closer]
        s[closer] = (s0 + t * ln)[closer]
    return d, s / start[-1]


def chaikin(coords: np.ndarray, iterations=2, closed=False) -> np.ndarray:
    pts = np.asarray(coords, float)
    for _ in range(iterations):
        if len(pts) < 3:
            return pts
        if closed:
            p, q = pts, np.roll(pts, -1, axis=0)
            new = np.empty((2 * len(p), 2))
            new[0::2] = 0.75 * p + 0.25 * q
            new[1::2] = 0.25 * p + 0.75 * q
            pts = new
        else:
            p, q = pts[:-1], pts[1:]
            mid = np.empty((2 * len(p), 2))
            mid[0::2] = 0.75 * p + 0.25 * q
            mid[1::2] = 0.25 * p + 0.75 * q
            pts = np.vstack([pts[:1], mid[1:-1], pts[-1:]])
    return pts


def line_length_km(coords) -> float:
    c = np.asarray(coords, float)
    return float(np.hypot(*np.diff(c, axis=0).T).sum()) if len(c) > 1 else 0.0
