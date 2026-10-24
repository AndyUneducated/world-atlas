"""Routable road graph built from the grid paths produced by the Router."""
from __future__ import annotations

import math
from collections import defaultdict

# Design speeds per road class, km/h (rural sections, JTG B01 design-speed bands).
SPEED_KMH = {"motorway": 100, "trunk": 80, "primary": 70, "secondary": 50, "tertiary": 40}
ROAD_RANK = {"motorway": 0, "trunk": 1, "primary": 2, "secondary": 3, "tertiary": 4}


def build_graph(roads, terminals: dict[str, int], nx: int, res_km: float):
    """
    roads: list of (road_index, road_class, cell_path).
    terminals: entity id -> grid cell that must become a graph node.
    Returns (node_cells, edges, places) where each edge is
    (a, b, length_km, minutes, road_index, cell_chain).
    """
    adj: dict[int, dict[int, tuple[int, int]]] = defaultdict(dict)
    for ri, cls, path in roads:
        rank = ROAD_RANK[cls]
        for a, b in zip(path[:-1], path[1:]):
            if a == b:
                continue
            for u, v in ((a, b), (b, a)):
                old = adj[u].get(v)
                if old is None or rank < old[0]:
                    adj[u][v] = (rank, ri)

    def nearest_cell(c):
        cy, cx = divmod(c, nx)
        return min(adj, key=lambda k: (divmod(k, nx)[0] - cy) ** 2 + (divmod(k, nx)[1] - cx) ** 2)

    places = {eid: (c if c in adj else nearest_cell(c)) for eid, c in terminals.items()}
    is_node = {c for c, nb in adj.items() if len(nb) != 2} | set(places.values())

    def step_km(a, b):
        (ay, ax), (by, bx) = divmod(a, nx), divmod(b, nx)
        return math.hypot(ax - bx, ay - by) * res_km

    node_index: dict[int, int] = {}
    edges, seen = [], set()
    for start in sorted(is_node):
        for first in sorted(adj[start]):
            if (start, first) in seen:
                continue
            chain, prev, cur = [start, first], start, first
            while cur not in is_node:
                nxt = next((n for n in adj[cur] if n != prev), None)
                if nxt is None:
                    break
                prev, cur = cur, nxt
                chain.append(cur)
            for u, v in zip(chain[:-1], chain[1:]):
                seen.add((u, v))
                seen.add((v, u))
            if cur not in is_node or cur == start and len(chain) < 4:
                continue
            length = sum(step_km(u, v) for u, v in zip(chain[:-1], chain[1:]))
            minutes = sum(step_km(u, v) / SPEED_KMH[_CLASS_BY_RANK[adj[u][v][0]]] * 60 for u, v in zip(chain[:-1], chain[1:]))
            ranks = [adj[u][v] for u, v in zip(chain[:-1], chain[1:])]
            road = min(ranks)[1]
            for c in (start, cur):
                node_index.setdefault(c, len(node_index))
            edges.append((node_index[start], node_index[cur], round(length, 2), round(minutes, 2), road, chain))
    for c in places.values():
        node_index.setdefault(c, len(node_index))
    node_cells = sorted(node_index, key=node_index.get)
    return node_cells, edges, {eid: node_index[c] for eid, c in places.items()}


_CLASS_BY_RANK = {v: k for k, v in ROAD_RANK.items()}
