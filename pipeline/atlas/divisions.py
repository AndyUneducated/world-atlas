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
            out[(comp > 0) & (comp != keep)] = -1
    hole = mask & (out < 0)
    if hole.any():
        valid = mask & (out >= 0)
        _, (iy, ix) = ndimage.distance_transform_edt(~valid, return_indices=True)
        out[hole] = out[iy, ix][hole]
    out[~mask] = -1
    return out


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
    return best, best_err


def pole_of_inaccessibility(mask: np.ndarray, xs, ys):
    d = ndimage.distance_transform_edt(mask)
    iy, ix = np.unravel_index(np.argmax(d), d.shape)
    return float(xs[ix]), float(ys[iy])
