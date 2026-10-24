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
        # move about half the pairwise imbalance per step, spread over the shared boundary and
        # split among each label's trading partners so a label between two donors doesn't overshoot
        linked = counts.reshape(n, n) > 0
        partners = np.maximum((linked | linked.T).sum(axis=1), 1)
        share = np.maximum(partners[src], partners[dest[cand]])
        prob = np.minimum(1.0, best_gain[cand] / (2.0 * counts[pair] * share))
        move = rng.random(prob.shape) < prob
        ys, xs = np.nonzero(cand)
        grid[ys[move], xs[move]] = dest[cand][move]
        if it % 8 == 7:
            grid = _contiguous(grid, mask)
    return _contiguous(grid, mask)


def _fit_islands(grid, mask, sea, targets, cell, seed=0):
    """Grow or erode the coast of divisions that own whole islands until they match their target.

    Such a division has no land neighbour to trade pixels with, so its area is set by the coastline.
    Growth only takes sea pixels at least two pixels away from any other land.
    """
    rng = np.random.default_rng(seed)
    grid, mask, sea = grid.copy(), mask.copy(), sea.copy()
    for k in range(len(targets)):
        own = grid == k
        if not own.any() or (grid[ndimage.binary_dilation(own) & ~own] >= 0).any():
            continue
        for _ in range(50):
            diff = int(round(targets[k] / cell)) - int(own.sum())
            if diff == 0:
                break
            if diff > 0:
                foreign = ndimage.binary_dilation(~sea & ~own, iterations=2)
                ring = ndimage.binary_dilation(own) & sea & ~foreign
                ring[[0, -1], :] = ring[:, [0, -1]] = False
            else:
                ring = own & ~ndimage.binary_erosion(own)
            ys, xs = np.nonzero(ring)
            if not len(ys):
                break
            pick = rng.permutation(len(ys))[: min(abs(diff), max(1, len(ys) // 3))]
            grid[ys[pick], xs[pick]] = k if diff > 0 else -1
            mask[ys[pick], xs[pick]] = diff > 0
            sea[ys[pick], xs[pick]] = diff < 0
            own = grid == k
    return grid, mask


def partition(mask, wx, wy, seeds, targets, cell, tolerance=0.01, rounds=16, sea=None):
    """Label mask so that label i covers ~targets[i] km².

    Returns (raster with -1 outside the mask, relative errors, mask). Divisions that own whole
    islands get their coastline adjusted into `sea` (default: everything outside the mask), so the
    returned mask can differ slightly from the input.
    """
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
        sea = ~mask if sea is None else sea
        for _ in range(4):
            best, mask = _fit_islands(best, mask, sea & ~mask, targets, cell)
            targets = targets * mask.sum() * cell / targets.sum()
        (y0, y1), (x0, x1) = [(max(int(a.min()) - 1, 0), int(a.max()) + 2) for a in np.nonzero(mask)]
        win = (slice(y0, y1), slice(x0, x1))
        best[win] = _refine(best[win], mask[win], targets, cell, tolerance)
        best_err = np.abs(np.bincount(best[mask], minlength=len(seeds)) * cell - targets) / targets
    return best, best_err, mask


def pole_of_inaccessibility(mask: np.ndarray, xs, ys):
    d = ndimage.distance_transform_edt(mask)
    iy, ix = np.unravel_index(np.argmax(d), d.shape)
    return float(xs[ix]), float(ys[iy])
