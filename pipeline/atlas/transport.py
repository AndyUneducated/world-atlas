"""Terrain-aware road routing on a coarse cost grid."""
from __future__ import annotations

import heapq
import math

import numpy as np

# A stretch of road or track carries one name (M112): running on another route's cells costs this many times
# open terrain, and running right beside them this many times, so routes keep apart and only cross.
SHARED_FACTOR = 6.0
BUFFER_FACTOR = 1.5

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
              shared_factor=SHARED_FACTOR, buffer_factor=BUFFER_FACTOR) -> list[int]:
        """Least-cost path. With tunnel_cost, steep terrain costs at most that much per km.

        With ref, the cells of other routes cost shared_factor times open terrain and the cells beside
        them buffer_factor times, so each road and railway builds its own line, one name to each
        stretch (M112, the owner's rule), crossing others but running along them only where the
        terrain leaves no other way through.
        """
        nx, ny = self.nx, self.ny
        cost = self.cost
        base = self.base
        # the tunnel cap first, so that the penalty for running on another route is not capped away
        if tunnel_cost is not None:
            cost = [min(c, tunnel_cost) if b < 40 else c for c, b in zip(cost, self.base)]
            base = np.where(self.base < 40, np.minimum(self.base, tunnel_cost), self.base)
        if ref is not None and self.owner:
            cost = list(cost)
            foreign = [c for c, o in self.owner.items() if o != ref]
            for c in foreign:
                cy, cx = divmod(c, nx)
                for dy, dx, _ in NB8:
                    y, x = cy + dy, cx + dx
                    n = y * nx + x
                    if 0 <= y < ny and 0 <= x < nx and self.owner.get(n) != ref:
                        cost[n] = max(cost[n], base[n] * buffer_factor)
            for c in foreign:
                cost[c] = base[c] * shared_factor
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

    def cells_along(self, points) -> list[int]:
        """The chain of neighbouring cells a polyline (km) passes through, ignoring terrain and water."""
        cells: list[int] = []
        for (ax, ay), (bx, by) in zip(points[:-1], points[1:]):
            n = max(int(math.hypot(bx - ax, by - ay) / (0.25 * self.res)), 1)
            for k in range(n + 1):
                c = self.cell(ax + (bx - ax) * k / n, ay + (by - ay) * k / n)
                if cells and c == cells[-1]:
                    continue
                if len(cells) > 1 and c == cells[-2]:  # along a cell border: no stepping back and forth
                    cells.pop()
                    continue
                if cells and max(abs(c % self.nx - cells[-1] % self.nx), abs(c // self.nx - cells[-1] // self.nx)) > 1:
                    cells += self.straight(cells[-1], c)[1:]
                    continue
                if len(cells) > 1 and max(abs(c % self.nx - cells[-2] % self.nx), abs(c // self.nx - cells[-2] // self.nx)) == 1:
                    cells.pop()  # a corner across a cell's edge: step diagonally instead
                cells.append(c)
        if len(cells) == 1:  # a line within one cell still runs from it to the next one along
            (ax, ay), (bx, by) = points[0], points[-1]
            d = math.hypot(bx - ax, by - ay) or 1.0
            cx, cy = self.xy(cells[0])
            cells.append(self.cell(cx + (bx - ax) / d * self.res, cy + (by - ay) / d * self.res))
        return cells

    def commit(self, path: list[int], road_class: str, discount=0.55, ref: str | None = None):
        for c in path:
            self.cost[c] = min(self.cost[c], discount)
            self.used.setdefault(c, road_class)
            if ref is not None:
                self.owner.setdefault(c, ref)

    def nearest(self, c: int, cells, max_dist: float) -> int | None:
        """The cell of `cells` closest to c, if within max_dist (grid units)."""
        cells = np.fromiter(cells, int)
        if not len(cells):
            return None
        cy, cx = divmod(c, self.nx)
        ys, xs = np.divmod(cells, self.nx)
        d = np.hypot(ys - cy, xs - cx) * self.res
        i = int(np.argmin(d))
        return int(cells[i]) if d[i] <= max_dist else None

    def route_to_any(self, start: int, targets: set[int], max_dist: float, blocked: set[int] = frozenset(),
                     tunnel_cost: float | None = None) -> list[int] | None:
        """Cheapest path from start to whichever of `targets` it reaches first, searching only within
        max_dist (grid units, straight line) of start and never through `blocked`; None if out of reach."""
        nx, ny = self.nx, self.ny
        sy, sx = divmod(start, nx)
        reach = max_dist / self.res
        cost, base = self.cost, self.base
        step_cost = (lambda i: min(cost[i], tunnel_cost) if base[i] < 40 else cost[i]) if tunnel_cost is not None else cost.__getitem__
        dist, prev = {start: 0.0}, {}
        heap = [(0.0, start)]
        while heap:
            d, c = heapq.heappop(heap)
            if c in targets:
                path = [c]
                while c != start:
                    c = prev[c]
                    path.append(c)
                return path[::-1]
            if d > dist[c]:
                continue
            cy, cx = divmod(c, nx)
            for dy, dx, step in NB8:
                y, x = cy + dy, cx + dx
                n = y * nx + x
                if not (0 <= y < ny and 0 <= x < nx) or n in blocked or math.hypot(y - sy, x - sx) > reach:
                    continue
                nd = d + step * 0.5 * (step_cost(c) + step_cost(n))
                if nd < dist.get(n, 1e30):
                    dist[n] = nd
                    prev[n] = c
                    heapq.heappush(heap, (nd, n))
        return None

    def trim_to_network(self, path: list[int]) -> list[int]:
        """Cut a feeder path at the first cell already on the network."""
        for i, c in enumerate(path):
            if c in self.used and i > 0:
                return path[: i + 1]
        return path
