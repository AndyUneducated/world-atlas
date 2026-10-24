"""Terrain-aware road routing on a coarse cost grid."""
from __future__ import annotations

import heapq
import math

import numpy as np

NB8 = [(-1, -1, 1.4142), (-1, 0, 1.0), (-1, 1, 1.4142), (0, -1, 1.0), (0, 1, 1.0), (1, -1, 1.4142), (1, 0, 1.0), (1, 1, 1.4142)]


class Router:
    def __init__(self, elev: np.ndarray, land: np.ndarray, res_km: float, water_cost=40.0):
        self.res = res_km
        self.ny, self.nx = elev.shape
        gy, gx = np.gradient(elev, res_km * 1000.0)
        slope = np.hypot(gx, gy)
        cost = 1 + 60 * slope + 0.0004 * elev
        cost[~land] = water_cost
        self.base = cost.ravel().copy()
        self.cost = cost.ravel().tolist()
        self.used: dict[int, str] = {}

    def cell(self, x_km, y_km) -> int:
        ix = min(max(int(x_km / self.res), 0), self.nx - 1)
        iy = min(max(int(y_km / self.res), 0), self.ny - 1)
        return iy * self.nx + ix

    def xy(self, c: int):
        cy, cx = divmod(c, self.nx)
        return ((cx + 0.5) * self.res, (cy + 0.5) * self.res)

    def route(self, start: int, goal: int, tunnel_cost: float | None = None) -> list[int]:
        """Least-cost path. With tunnel_cost, steep terrain costs at most that much per km."""
        nx, ny = self.nx, self.ny
        cost = self.cost if tunnel_cost is None else [min(c, tunnel_cost) if b < 40 else c for c, b in zip(self.cost, self.base)]
        gy, gx = divmod(goal, nx)
        dist, prev = {start: 0.0}, {}
        heap = [(0.0, 0.0, start)]
        while heap:
            _, d, c = heapq.heappop(heap)
            if c == goal:
                break
            if d > dist.get(c, 1e30):
                continue
            cy, cx = divmod(c, nx)
            for dy, dx, step in NB8:
                y, x = cy + dy, cx + dx
                if 0 <= y < ny and 0 <= x < nx:
                    n = y * nx + x
                    nd = d + step * 0.5 * (cost[c] + cost[n])
                    if nd < dist.get(n, 1e30):
                        dist[n] = nd
                        prev[n] = c
                        heapq.heappush(heap, (nd + 0.5 * math.hypot(x - gx, y - gy), nd, n))
        path, c = [goal], goal
        while c != start:
            c = prev[c]
            path.append(c)
        return path[::-1]

    def commit(self, path: list[int], road_class: str, discount=0.55):
        for c in path:
            self.cost[c] = min(self.cost[c], discount)
            self.used.setdefault(c, road_class)

    def trim_to_network(self, path: list[int]) -> list[int]:
        """Cut a feeder path at the first cell already on the network."""
        for i, c in enumerate(path):
            if c in self.used and i > 0:
                return path[: i + 1]
        return path
