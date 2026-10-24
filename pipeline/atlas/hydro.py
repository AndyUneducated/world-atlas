"""Hydrology: depression-filled drainage, flow accumulation and river extraction."""
from __future__ import annotations

import heapq

import numpy as np
from scipy import ndimage

NB8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


class Drainage:
    """Priority-flood drainage tree. rec[c] is the downstream cell of c (-1 = outlet to sea)."""

    def __init__(self, elev: np.ndarray, land: np.ndarray, cell_km2: float):
        ny, nx = elev.shape
        self.shape = (ny, nx)
        ef = elev.ravel().tolist()
        done = (~land).ravel().tolist()
        rec = [-1] * (ny * nx)
        order = []
        coast = land & ndimage.binary_dilation(~land)
        heap = []
        for c in np.flatnonzero(coast).tolist():
            done[c] = True
            heap.append((ef[c], c))
        heapq.heapify(heap)
        while heap:
            z, c = heapq.heappop(heap)
            order.append(c)
            cy, cx = divmod(c, nx)
            for dy, dx in NB8:
                y, x = cy + dy, cx + dx
                if 0 <= y < ny and 0 <= x < nx:
                    n = y * nx + x
                    if not done[n]:
                        done[n] = True
                        rec[n] = c
                        heapq.heappush(heap, (max(ef[n], z + 1e-3), n))
        acc = [cell_km2] * (ny * nx)
        for c in reversed(order):
            r = rec[c]
            if r >= 0:
                acc[r] += acc[c]
        self.rec = np.array(rec)
        self.acc = np.array(acc).reshape(ny, nx)
        self.land = land
        self._upstream = None

    def upstream(self):
        if self._upstream is None:
            ups = [[] for _ in range(self.rec.size)]
            for c, r in enumerate(self.rec.tolist()):
                if r >= 0:
                    ups[r].append(c)
            self._upstream = ups
        return self._upstream

    def _sea_neighbour(self, c):
        ny, nx = self.shape
        cy, cx = divmod(c, nx)
        for dy, dx in NB8:
            y, x = cy + dy, cx + dx
            if 0 <= y < ny and 0 <= x < nx and not self.land[y, x]:
                return y * nx + x
        return None

    def river_chains(self, min_km2: float):
        """Split the river network into chains between heads, confluences and mouths."""
        accf = self.acc.ravel()
        is_river = (accf >= min_km2) & self.land.ravel()
        ups = self.upstream()
        up_count = {c: sum(1 for u in ups[c] if is_river[u]) for c in np.flatnonzero(is_river).tolist()}
        chains = []
        for start, k in up_count.items():
            if k == 1:
                continue
            chain = [start]
            c = int(self.rec[start])
            while c >= 0 and is_river[c]:
                chain.append(c)
                if up_count[c] != 1:
                    break
                c = int(self.rec[c])
            if c < 0:
                mouth = self._sea_neighbour(chain[-1])
                if mouth is not None:
                    chain.append(mouth)
            if len(chain) >= 2:
                chains.append((chain, float(accf[chain[-2] if len(chain) > 1 else chain[-1]])))
        return chains

    def main_stem(self, through_mask: np.ndarray, min_km2: float, taken: frozenset = frozenset()):
        """Largest stream crossing through_mask that is not already taken, traced from its source
        to the sea, or to the confluence with a taken river (a tributary)."""
        accf = self.acc.ravel()
        cand = np.where(through_mask.ravel() & self.land.ravel(), accf, 0)
        if taken:
            cand[list(taken)] = 0
        start = int(np.argmax(cand))
        if cand[start] < min_km2:
            return None
        return self.stem(start, min_km2, taken)

    def outlets(self, min_km2: float):
        """(stem, drainage) of every river reaching the sea with at least min_km2 upstream, largest first."""
        accf = self.acc.ravel()
        mouths = np.flatnonzero((self.rec == -1) & self.land.ravel() & (accf >= min_km2))
        return [(self.stem(int(c), min_km2), float(accf[c])) for c in sorted(mouths.tolist(), key=lambda c: -accf[c])]

    def stem(self, start: int, min_km2: float, taken: frozenset = frozenset()):
        """Cells from the source of the largest headwater above start, through start, down to the sea
        (or to the first taken cell)."""
        accf = self.acc.ravel()
        down = [start]
        c = int(self.rec[start])
        while c >= 0:
            down.append(c)
            if c in taken:
                break
            c = int(self.rec[c])
        if down[-1] not in taken:
            mouth = self._sea_neighbour(down[-1])
            if mouth is not None:
                down.append(mouth)
        ups = self.upstream()
        up = []
        c = start
        while True:
            kids = [u for u in ups[c] if accf[u] >= min_km2 and u not in taken]
            if not kids:
                break
            c = max(kids, key=lambda u: accf[u])
            up.append(c)
        return list(reversed(up)) + down
