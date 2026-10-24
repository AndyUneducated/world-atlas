"""Area-constrained partitioning of land into administrative divisions.

Each division grows from an anchor point; an additively weighted power diagram is
balanced iteratively until every division matches its target area, then cleaned
so that every division is a single contiguous region.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage


def _balance(px, py, seeds, targets, cell, w, iters):
    D = (px[:, None] - seeds[None, :, 0]) ** 2 + (py[:, None] - seeds[None, :, 1]) ** 2
    for it in range(iters):
        lab = np.argmin(D - w[None, :], axis=1)
        area = np.bincount(lab, minlength=len(seeds)) * cell
        w = w + 0.8 * (targets - area) * (0.993 ** it + 0.05)
    return np.argmin(D - w[None, :], axis=1), w


def _contiguous(labels: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = labels.copy()
    for v in np.unique(out[mask]):
        comp, n = ndimage.label(out == v)
        if n > 1:
            sizes = ndimage.sum(np.ones_like(comp), comp, range(1, n + 1))
            keep = 1 + int(np.argmax(sizes))
            for k, sl in enumerate(ndimage.find_objects(comp), start=1):
                if k == keep:
                    continue
                win = tuple(slice(max(s.start - 1, 0), s.stop + 1) for s in sl)
                piece = comp[win] == k
                ring = ndimage.binary_dilation(piece) & ~piece
                # offshore islands stay with their division; only land-locked fragments are reassigned
                if (labels[win][ring] >= 0).any():
                    out[win][piece] = -1
    hole = mask & (out < 0)
    if hole.any():
        valid = mask & (out >= 0)
        _, (iy, ix) = ndimage.distance_transform_edt(~valid, return_indices=True)
        out[hole] = out[iy, ix][hole]
    out[~mask] = -1
    return out


_SHIFTS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _refine(grid, mask, targets, cell, tolerance, seed=0, iters=1200):
    """Trade boundary pixels from oversized to undersized neighbours until areas match."""
    rng = np.random.default_rng(seed)
    n = len(targets)
    grid = grid.copy()
    for it in range(iters):
        area = np.bincount(grid[mask], minlength=n) * cell
        if (np.abs(area - targets) / targets).max() <= tolerance * 0.8:
            break
        surplus = (area - targets) / cell
        best_gain = np.zeros(grid.shape)
        dest = np.full(grid.shape, -1)
        for dy, dx in _SHIFTS:
            nb = np.roll(grid, (dy, dx), axis=(0, 1))
            ok = mask & (grid >= 0) & (nb >= 0) & (nb != grid)
            gain = np.where(ok, surplus[np.where(grid >= 0, grid, 0)] - surplus[np.where(nb >= 0, nb, 0)], 0)
            take = gain > best_gain
            best_gain[take], dest[take] = gain[take], nb[take]
        cand = best_gain > 0.5
        if not cand.any():
            break
        src = grid[cand]
        pair = src * n + dest[cand]
        counts = np.bincount(pair, minlength=n * n)
        # move about half the pairwise imbalance per step, spread over the shared boundary
        prob = np.minimum(1.0, best_gain[cand] / (2.0 * counts[pair]))
        move = rng.random(prob.shape) < prob
        ys, xs = np.nonzero(cand)
        grid[ys[move], xs[move]] = dest[cand][move]
        if it % 8 == 7:
            grid = _contiguous(grid, mask)
    return _contiguous(grid, mask)


def partition(mask, wx, wy, seeds, targets, cell, tolerance=0.01, rounds=16):
    """Return an int raster (-1 outside mask) with label i covering ~targets[i] km²."""
    seeds = np.asarray(seeds, float)
    targets = np.asarray(targets, float)
    targets = targets * mask.sum() * cell / targets.sum()
    idx = np.flatnonzero(mask)
    px, py = wx.ravel()[idx], wy.ravel()[idx]
    w = np.zeros(len(seeds))
    best, best_err = None, None
    for rnd in range(rounds):
        lab, w = _balance(px, py, seeds, targets, cell, w, 500 if rnd == 0 else 120)
        grid = np.full(mask.size, -1)
        grid[idx] = lab
        grid = _contiguous(grid.reshape(mask.shape), mask)
        area = np.bincount(grid[mask], minlength=len(seeds)) * cell
        err = np.abs(area - targets) / targets
        if best_err is None or err.max() < best_err.max():
            best, best_err = grid, err
        if err.max() <= tolerance:
            break
        w = w + 0.8 * (targets - area)
    if best_err.max() > tolerance:
        (y0, y1), (x0, x1) = [(max(int(a.min()) - 1, 0), int(a.max()) + 2) for a in np.nonzero(mask)]
        win = (slice(y0, y1), slice(x0, x1))
        best = best.copy()
        best[win] = _refine(best[win], mask[win], targets, cell, tolerance)
        best_err = np.abs(np.bincount(best[mask], minlength=len(seeds)) * cell - targets) / targets
    return best, best_err


def pole_of_inaccessibility(mask: np.ndarray, xs, ys):
    d = ndimage.distance_transform_edt(mask)
    iy, ix = np.unravel_index(np.argmax(d), d.shape)
    return float(xs[ix]), float(ys[iy])
