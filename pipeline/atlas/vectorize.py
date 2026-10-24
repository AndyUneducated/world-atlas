"""Topology-preserving raster-to-vector conversion.

Boundaries between labelled cells are traced once as shared arcs (between junction
nodes), smoothed with fixed endpoints, and polygonised. Adjacent polygons therefore
share identical edges: no gaps, no overlaps, and parents dissolve cleanly.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np
import shapely
from shapely.geometry import LineString, Point

from .grid import chaikin


def _arcs(labels: np.ndarray):
    ny, nx = labels.shape
    stride = nx + 1
    adj: dict[int, list[int]] = defaultdict(list)

    def add(a, b):
        adj[a].append(b)
        adj[b].append(a)

    iy, ix = np.nonzero(labels[:, :-1] != labels[:, 1:])
    for y, x in zip(iy.tolist(), ix.tolist()):
        add(y * stride + x + 1, (y + 1) * stride + x + 1)
    iy, ix = np.nonzero(labels[:-1, :] != labels[1:, :])
    for y, x in zip(iy.tolist(), ix.tolist()):
        add((y + 1) * stride + x, (y + 1) * stride + x + 1)

    seen: set[tuple[int, int]] = set()

    def walk(a, b):
        path = [a, b]
        seen.add((min(a, b), max(a, b)))
        prev, cur = a, b
        while len(adj[cur]) == 2:
            nxt = adj[cur][0] if adj[cur][1] == prev else adj[cur][1]
            key = (min(cur, nxt), max(cur, nxt))
            if key in seen:
                break
            seen.add(key)
            path.append(nxt)
            prev, cur = cur, nxt
        return path

    arcs = []
    for node, nbrs in adj.items():
        if len(nbrs) != 2:
            for n in nbrs:
                if (min(node, n), max(node, n)) not in seen:
                    arcs.append(walk(node, n))
    for node, nbrs in adj.items():
        for n in nbrs:
            if (min(node, n), max(node, n)) not in seen:
                arcs.append(walk(node, n))
    return arcs, stride


def polygonize_labels(labels: np.ndarray, res_km: float, smooth=3, simplify_km=0.03, min_area_km2=0.01):
    """labels: int raster, negative = background. Returns {label: (Multi)Polygon in km}."""
    arcs, stride = _arcs(labels)
    lines = []
    for arc in arcs:
        a = np.array(arc)
        pts = np.column_stack([a % stride, a // stride]).astype(float) * res_km
        closed = arc[0] == arc[-1]
        if closed:
            sm = chaikin(pts[:-1], smooth, closed=True)
            sm = np.vstack([sm, sm[:1]])
        else:
            sm = chaikin(pts, smooth)
        line = LineString(sm)
        if simplify_km:
            line = line.simplify(simplify_km, preserve_topology=False)
        lines.append(line)
    faces = shapely.get_parts(shapely.polygonize(lines))
    ny, nx = labels.shape
    groups: dict[int, list] = defaultdict(list)
    for face in faces:
        if face.area < min_area_km2:
            continue
        p = face.representative_point()
        ix = min(max(int(p.x / res_km), 0), nx - 1)
        iy = min(max(int(p.y / res_km), 0), ny - 1)
        lab = int(labels[iy, ix])
        if lab >= 0:
            groups[lab].append(face)
    return {lab: shapely.union_all(parts) for lab, parts in groups.items()}


def to_lonlat(geom, frame, decimals=5):
    return shapely.transform(geom, lambda c: np.round(frame.to_lonlat(c), decimals))


def point_lonlat(frame, x, y, decimals=5):
    lon, lat = frame.to_lonlat(np.array([x, y]))
    return Point(round(float(lon), decimals), round(float(lat), decimals))
