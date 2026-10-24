"""Terrain-aware road routing on a coarse cost grid."""
from __future__ import annotations

import heapq
import math

import numpy as np

NB8 = [(-1, -1, 1.4142), (-1, 0, 1.0), (-1, 1, 1.4142), (0, -1, 1.0), (0, 1, 1.0), (1, -1, 1.4142), (1, 0, 1.0), (1, 1, 1.4142)]


class Router:
    def __init__(self, elev: np.ndarray, land: np.ndarray, res_km: float, water_cost=40.0, slope_weight=60.0):
        """slope_weight: extra cost per unit gradient (railways use more than roads)."""
        self.res = res_km
        self.ny, self.nx = elev.shape
        gy, gx = np.gradient(elev, res_km * 1000.0)
        slope = np.hypot(gx, gy)
        cost = 1 + slope_weight * slope + 0.0004 * elev
        cost[~land] = water_cost
        self.base = cost.ravel().copy()
        self.cost = cost.ravel().tolist()
        self.used: dict[int, str] = {}
        self.owner: dict[int, str] = {}

    def cell(self, x_km, y_km) -> int:
        ix = min(max(int(x_km / self.res), 0), self.nx - 1)
        iy = min(max(int(y_km / self.res), 0), self.ny - 1)
        return iy * self.nx + ix

    def xy(self, c: int):
        cy, cx = divmod(c, self.nx)
        return ((cx + 0.5) * self.res, (cy + 0.5) * self.res)

    def route(self, start: int, goal: int, tunnel_cost: float | None = None, ref: str | None = None,
              shared_factor=1.3, buffer_factor=1.15) -> list[int]:
        """Least-cost path. With tunnel_cost, steep terrain costs at most that much per km.

        With ref, the corridors of other trunk routes cost slightly more than open terrain, so
        each route builds its own line (every road segment carries one route) and only joins
        another where the terrain leaves no cheaper way through.
        """
        nx, ny = self.nx, self.ny
        cost = self.cost
        if ref is not None and self.owner:
            cost = list(cost)
            foreign = [c for c, o in self.owner.items() if o != ref]
            for c in foreign:
                cy, cx = divmod(c, nx)
                for dy, dx, _ in NB8:
                    y, x = cy + dy, cx + dx
                    n = y * nx + x
                    if 0 <= y < ny and 0 <= x < nx and self.owner.get(n) != ref:
                        cost[n] = max(cost[n], self.base[n] * buffer_factor)
            for c in foreign:
                cost[c] = self.base[c] * shared_factor
        if tunnel_cost is not None:
            cost = [min(c, tunnel_cost) if b < 40 else c for c, b in zip(cost, self.base)]
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

    def straight(self, start: int, goal: int) -> list[int]:
        """Cells of the straight line between two cells, ignoring terrain and water (bridges and tunnels)."""
        (ay, ax), (by, bx) = divmod(start, self.nx), divmod(goal, self.nx)
        n = max(abs(bx - ax), abs(by - ay), 1)
        cells: list[int] = []
        for k in range(n + 1):
            c = round(ay + (by - ay) * k / n) * self.nx + round(ax + (bx - ax) * k / n)
            if not cells or cells[-1] != c:
                cells.append(c)
        return cells

    def commit(self, path: list[int], road_class: str, discount=0.55, ref: str | None = None):
        for c in path:
            self.cost[c] = min(self.cost[c], discount)
            self.used.setdefault(c, road_class)
            if ref is not None:
                self.owner.setdefault(c, ref)

    def trim_to_network(self, path: list[int]) -> list[int]:
        """Cut a feeder path at the first cell already on the network."""
        for i, c in enumerate(path):
            if c in self.used and i > 0:
                return path[: i + 1]
        return path
