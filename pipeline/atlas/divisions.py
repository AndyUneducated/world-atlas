"""Area-constrained partitioning of land into administrative divisions.

Each division grows from an anchor point; an additively weighted power diagram is
balanced iteratively until every division matches its target area, then cleaned
so that every division is a single contiguous region.
"""
from __future__ import annotations

import math

import numpy as np
from scipy import ndimage


def _nearest(D, w, best, lab, v):
    """argmin over seeds of D - w (first seed on ties), one seed row at a time into preallocated buffers."""
    np.subtract(D[0], w[0], out=best)
    lab.fill(0)
    for j in range(1, len(D)):
        np.subtract(D[j], w[j], out=v)
        m = v < best
        best[m] = v[m]
        lab[m] = j
    return lab


def _balance(px, py, seeds, targets, cell, w, iters):
    D = (px[None, :] - seeds[:, 0, None]) ** 2 + (py[None, :] - seeds[:, 1, None]) ** 2
    best, v, lab = np.empty(len(px)), np.empty(len(px)), np.empty(len(px), np.intp)
    for it in range(iters):
        _nearest(D, w, best, lab, v)
        area = np.bincount(lab, minlength=len(seeds)) * cell
        w = w + 0.8 * (targets - area) * (0.993 ** it + 0.05)
    return _nearest(D, w, best, lab, v).copy(), w


def _overland(out, hole):
    """Holes filled from their labelled land neighbours inward, so a fragment never goes to a division
    across a strait; what no land path reaches is left in `hole`."""
    lab, _ = ndimage.label(hole)
    for sl in ndimage.find_objects(lab):
        win = tuple(slice(max(s.start - 1, 0), s.stop + 1) for s in sl)
        sub, h = out[win], hole[win].copy()
        ny, nx = sub.shape
        while h.any():
            left = int(h.sum())
            for dy, dx in _SHIFTS:
                nb = np.full(sub.shape, -1)
                nb[max(dy, 0): ny + min(dy, 0), max(dx, 0): nx + min(dx, 0)] = \
                    sub[max(-dy, 0): ny + min(-dy, 0), max(-dx, 0): nx + min(-dx, 0)]
                take = h & (nb >= 0)
                sub[take] = nb[take]
                h &= ~take
            if int(h.sum()) == left:
                break
        hole[win] &= h


def _contiguous(labels: np.ndarray, mask: np.ndarray, overland: bool = False, home=None) -> np.ndarray:
    """Each label cut to its largest piece and its offshore islands; land-locked fragments go to the
    nearest labelled pixel, or with `overland` to the labelled land they border. With `home`
    (a pixel (row, col) per label), a label keeps one piece on each landmass instead: the one
    holding its home pixel on its own, the largest on the others (an archipelago district keeps
    a strip of the mainland coast)."""
    out = labels.copy()
    boxes = ndimage.find_objects(out + 1)
    land = ndimage.label(mask)[0] if home is not None else None
    for v in np.unique(out[mask]):
        box = boxes[v]
        comp, n = ndimage.label(out[box] == v)
        if n > 1:
            sizes = np.bincount(comp.ravel())
            if home is None:
                keep = {1 + int(np.argmax(sizes[1:]))}
            else:
                mass = np.zeros(n + 1, int)
                mass[comp.ravel()] = land[box].ravel()
                hy, hx = int(home[v][0]) - box[0].start, int(home[v][1]) - box[1].start
                hk = int(comp[hy, hx]) if 0 <= hy < comp.shape[0] and 0 <= hx < comp.shape[1] else 0
                keep, seen = set(), set()
                for k in ([hk] if hk else []) + list(np.argsort(-sizes[1:], kind="stable") + 1):
                    if mass[k] not in seen:
                        keep.add(int(k))
                        seen.add(mass[k])
            for k, sl in enumerate(ndimage.find_objects(comp), start=1):
                if k in keep:
                    continue
                at = [b.start + s.start for b, s in zip(box, sl)]
                win = tuple(slice(max(a - 1, 0), min(a + (s.stop - s.start) + 1, size)) for a, s, size in zip(at, sl, out.shape))
                piece = np.zeros([w.stop - w.start for w in win], bool)
                piece[tuple(slice(a - w.start, a - w.start + s.stop - s.start) for a, w, s in zip(at, win, sl))] = comp[sl] == k
                ring = ndimage.binary_dilation(piece) & ~piece
                # offshore islands stay with their division; only land-locked fragments are reassigned
                if (labels[win][ring] >= 0).any():
                    out[win][piece] = -1
    hole = mask & (out < 0)
    if overland and hole.any():
        _overland(out, hole)
    if hole.any():
        valid = mask & (out >= 0)
        _, (iy, ix) = ndimage.distance_transform_edt(~valid, return_indices=True)
        out[hole] = out[iy, ix][hole]
    out[~mask] = -1
    return out


_SHIFTS = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _tolerance(targets, cell, tolerance):
    """Relative area tolerance per division: no tighter than one pixel, which a small division can't split."""
    return np.maximum(tolerance, cell / np.asarray(targets, float))


def _boundary(grid, mask):
    """Land pixels with a land neighbour of another label; neighbours as np.roll gives them (wrapping at the edges)."""
    out = np.zeros(grid.shape, bool)
    for dy, dx in _SHIFTS:
        nb = np.roll(grid, (dy, dx), axis=(0, 1))
        out |= mask & (grid >= 0) & (nb >= 0) & (nb != grid)
    return out


# Pixels only change on a boundary, which moves at most one pixel per step, so between two clean-ups
# (every 8 steps) every trade happens within this many pixels of the boundary at the last clean-up.
_BAND = 8


def _refine(grid, mask, targets, cell, tolerance, seed=0, iters=1200, frozen=None, keep=None, home=None):
    """Trade boundary pixels from oversized to undersized neighbours until areas match.

    A pixel goes to whichever neighbour is shorter of its target, so a small division at its target
    can be eaten by a large neighbour far short of its own, or pass pixels on and drift; divisions
    in `frozen` (a boolean per label) take pixels only while under their target and give them only
    while over it, so they never pass pixels on; pixels in `keep` never move. With `home`, clean-up
    is _contiguous overland around each label's home pixel."""
    rng = np.random.default_rng(seed)
    n = len(targets)
    overland = home is not None
    grid = grid.copy()
    ny, nx = grid.shape
    tol = _tolerance(targets, cell, tolerance * 0.8)
    # divisions with no land neighbour (whole islands) can't trade pixels, so they don't hold up the loop
    trading = np.zeros(n, bool)
    trading[grid[_boundary(grid, mask)]] = True
    if not trading.any():
        return _contiguous(grid, mask, overland, home)
    band = None
    for it in range(iters):
        if band is None:
            near = _boundary(grid, mask)
            for _ in range(_BAND):
                near = near | np.roll(near, 1, 0) | np.roll(near, -1, 0) | np.roll(near, 1, 1) | np.roll(near, -1, 1)
            band = np.flatnonzero(near)
            by, bx = np.divmod(band, nx)
            nbs = [((by - dy) % ny) * nx + (bx - dx) % nx for dy, dx in _SHIFTS]
            inside = mask.ravel()[band] if keep is None else mask.ravel()[band] & ~keep.ravel()[band]
            flat = grid.ravel()
            pixels = np.bincount(grid[mask], minlength=n)
            clean = True
        area = pixels * cell
        if (np.abs(area - targets) / targets / tol)[trading].max() <= 1:
            # trading can cut a neck, and clean-up then hands the far side to a neighbour
            if clean or not overland:
                break
            grid = _contiguous(grid, mask, overland, home)
            band = None
            continue
        clean = False
        surplus = (area - targets) / cell
        g0 = flat[band]
        best_gain = np.zeros(len(band))
        dest = np.full(len(band), -1)
        for nbi in nbs:
            nb = flat[nbi]
            ok = inside & (g0 >= 0) & (nb >= 0) & (nb != g0)
            src, dst = np.where(g0 >= 0, g0, 0), np.where(nb >= 0, nb, 0)
            gain = surplus[src] - surplus[dst]
            if frozen is not None:
                # a frozen division trades only its own surplus or shortfall, however short its partner is
                gain = np.where(frozen[src], np.minimum(gain, surplus[src]), gain)
                gain = np.where(frozen[dst], np.minimum(gain, -surplus[dst]), gain)
            gain = np.where(ok, gain, 0)
            take = gain > best_gain
            best_gain[take], dest[take] = gain[take], nb[take]
        cand = best_gain > 0.5
        if not cand.any():
            break
        src, to = g0[cand], dest[cand]
        pair = src * n + to
        counts = np.bincount(pair, minlength=n * n)
        # move about half the pairwise imbalance per step, spread over the shared boundary and
        # split among each label's trading partners so a label between two donors doesn't overshoot
        linked = counts.reshape(n, n) > 0
        partners = np.maximum((linked | linked.T).sum(axis=1), 1)
        share = np.maximum(partners[src], partners[to])
        prob = np.minimum(1.0, best_gain[cand] / (2.0 * counts[pair] * share))
        move = rng.random(prob.shape) < prob
        flat[band[cand][move]] = to[move]
        pixels += np.bincount(to[move], minlength=n) - np.bincount(src[move], minlength=n)
        if it % 8 == 7:
            grid = _contiguous(grid, mask, overland, home)
            band = None
    return _contiguous(grid, mask, overland, home)


def _fit_islands(grid, mask, sea, targets, cell, seed=0):
    """Grow or erode the coast of divisions that own whole islands until they match their target.

    Such a division has no land neighbour to trade pixels with, so its area is set by the coastline.
    Growth only takes sea pixels at least two pixels away from any other land.
    """
    rng = np.random.default_rng(seed)
    grid, mask, sea = grid.copy(), mask.copy(), sea.copy()
    steps = 50
    for k in range(len(targets)):
        own = grid == k
        if not own.any():
            continue
        # the coast moves at most a pixel per step, so a window this much wider than the division holds all of it
        box = ndimage.find_objects(own.view(np.int8))[0]
        win = tuple(slice(max(s.start - steps - 6, 0), s.stop + steps + 6) for s in box)
        g, m, sw, own = grid[win], mask[win], sea[win], own[win]
        if (g[ndimage.binary_dilation(own) & ~own] >= 0).any():
            continue
        edge = [w.start == 0 for w in win], [w.stop >= size for w, size in zip(win, grid.shape)]
        for _ in range(steps):
            diff = int(round(targets[k] / cell)) - int(own.sum())
            if diff == 0:
                break
            if diff > 0:
                foreign = ndimage.binary_dilation(~sw & ~own, iterations=2)
                ring = ndimage.binary_dilation(own) & sw & ~foreign
                # no growth onto the frame's edge
                if edge[0][0]:
                    ring[0, :] = False
                if edge[1][0]:
                    ring[-1, :] = False
                if edge[0][1]:
                    ring[:, 0] = False
                if edge[1][1]:
                    ring[:, -1] = False
            else:
                ring = own & ~ndimage.binary_erosion(own)
            ys, xs = np.nonzero(ring)
            if not len(ys):
                break
            pick = rng.permutation(len(ys))[: min(abs(diff), max(1, len(ys) // 3))]
            g[ys[pick], xs[pick]] = k if diff > 0 else -1
            m[ys[pick], xs[pick]] = diff > 0
            sw[ys[pick], xs[pick]] = diff < 0
            own = g == k
    return grid, mask


# Under `anchored`, divisions smaller than this share of the whole are grown from their seed first.
_CARVE_SHARE = 0.05


def _carve(free, mask, wx, wy, seed, n_px, res):
    """A compact region of the n_px pixels of `free` nearest `seed` (or the nearest free pixel), across
    straits too, so a city on an island takes the islets around it. Distances are in a half-warped
    plane, so the edge wanders like a diagram edge. The region is made to survive _contiguous as it
    is: a detached piece that touches other land (across a fjord) would go to a neighbour, so it is
    left out, and a pocket of free land it encloses would come to it, so it is taken in; the
    nearest pixels make up the rest."""
    ny, nx = free.shape
    iy, ix = min(max(int(seed[1] / res), 0), ny - 1), min(max(int(seed[0] / res), 0), nx - 1)
    if not free[iy, ix]:
        _, (jy, jx) = ndimage.distance_transform_edt(~free, return_indices=True)
        iy, ix = int(jy[iy, ix]), int(jx[iy, ix])
    r = int(4 * math.sqrt(n_px / math.pi)) + 8
    win = (slice(max(iy - r, 0), min(iy + r + 1, ny)), slice(max(ix - r, 0), min(ix + r + 1, nx)))
    f, m = free[win], mask[win]
    cy, cx = iy - win[0].start, ix - win[1].start
    # half the warp: the full warp is as large as a small division's radius and grows it arms
    yy, xx = np.mgrid[win]
    hx, hy = 0.5 * (wx[win] + (xx + 0.5) * res), 0.5 * (wy[win] + (yy + 0.5) * res)
    d2 = (hx - hx[cy, cx]) ** 2 + (hy - hy[cy, cx]) ** 2
    d2[cy, cx] = -1.0
    # only the seed's own landmass and islets that lie wholly in the window and are wholly free
    lc, _ = ndimage.label(m)
    edge = np.unique(np.concatenate([lc[0], lc[-1], lc[:, 0], lc[:, -1]]))
    taken = np.unique(lc[m & ~f])
    islet = np.ones(int(lc.max()) + 1, bool)
    islet[edge], islet[taken], islet[0] = False, False, False
    islet[lc[cy, cx]] = True
    ys, xs = np.nonzero(f & islet[lc])
    order = np.argsort(d2[ys, xs], kind="stable")
    ys, xs = ys[order], xs[order]
    ok = np.ones(len(ys), bool)
    extra = np.zeros(f.shape, bool)
    for _ in range(20):
        near = np.flatnonzero(ok & ~extra[ys, xs])[: max(n_px - int(extra.sum()), 0)]
        own = extra.copy()
        own[ys[near], xs[near]] = True
        changed = False
        comp, n = ndimage.label(own)
        if n > 1:
            main = comp[cy, cx]
            bad = np.unique(comp[own & ndimage.binary_dilation(m & ~own)])
            bad = bad[(bad > 0) & (bad != main)]
            if len(bad):
                ok &= ~np.isin(comp[ys, xs], bad)
                extra &= ~np.isin(comp, bad)
                own &= ~np.isin(comp, bad)
                changed = True
        rest, _ = ndimage.label(f & ~own)
        outside = np.unique(np.concatenate([rest[0], rest[-1], rest[:, 0], rest[:, -1]]))
        sizes = np.bincount(rest.ravel())
        pockets = np.unique(rest[ndimage.binary_dilation(own) & f & ~own])
        pockets = pockets[(pockets > 0) & ~np.isin(pockets, outside) & (sizes[pockets] <= n_px // 2)]
        if len(pockets):
            extra |= np.isin(rest, pockets)
            changed = True
        if not changed:
            break
    out = np.zeros(free.shape, bool)
    out[win] = own
    return out


def _onto(points, mask, res, min_px):
    """Points moved, when they lie outside mask, to the nearest pixel of a piece of it of at least
    min_px[i] pixels (not a rock in the harbour)."""
    points = np.array(points, float)
    comp, _ = ndimage.label(mask)
    sizes = np.bincount(comp.ravel())
    for s, need in zip(points, min_px):
        iy, ix = min(max(int(s[1] / res), 0), mask.shape[0] - 1), min(max(int(s[0] / res), 0), mask.shape[1] - 1)
        if mask[iy, ix]:
            continue
        big = sizes >= min(need, sizes[1:].max())
        big[0] = False
        _, (jy, jx) = ndimage.distance_transform_edt(~big[comp], return_indices=True)
        s[:] = (jx[iy, ix] + 0.5) * res, (jy[iy, ix] + 0.5) * res
    return points


def _scaled(px, py, seeds, targets, cell, v, iters):
    """Multiplicatively weighted Voronoi: each pixel goes to the seed with the least distance / v,
    v scaled until every cell covers its target. A seed always lies in its own cell."""
    D = np.sqrt((px[None, :] - seeds[:, 0, None]) ** 2 + (py[None, :] - seeds[:, 1, None]) ** 2)
    best, t, lab = np.empty(len(px)), np.empty(len(px)), np.empty(len(px), np.intp)

    def nearest():
        np.divide(D[0], v[0], out=best)
        lab.fill(0)
        for j in range(1, len(D)):
            np.divide(D[j], v[j], out=t)
            m = t < best
            best[m] = t[m]
            lab[m] = j
        return lab

    for _ in range(iters):
        area = np.bincount(nearest(), minlength=len(seeds)) * cell
        v = v * np.clip(np.sqrt(targets / np.maximum(area, cell)), 0.85, 1.15)
    return nearest().copy(), v


def _settle_islands(px, py, lab, comp, islands, seeds, v, targets, cell, need, claimed):
    """Owners for the pixels on islands (comp in `islands`). An island claimed by a division
    (claimed[comp] >= 0) is its own. A division whose seed is on an island can only grow by islands,
    so then each takes its nearest islands until it has its `need`; then, largest first, each other
    island goes whole to the division that has most of it in `lab`, else the nearest (distance / v)
    that still has room for it, so that every division keeps a tenth of its target for the land
    around its seed. Returns (pixels on islands, their owners)."""
    on = islands[comp]
    u, inv = np.unique(comp[on], return_inverse=True)
    n = np.bincount(inv)
    size = n * cell
    k_div = len(seeds)
    share = np.bincount(inv * k_div + lab[on], minlength=len(n) * k_div).reshape(len(n), k_div)
    cx, cy = np.bincount(inv, px[on]) / n, np.bincount(inv, py[on]) / n
    dist = np.hypot(cx[:, None] - seeds[None, :, 0], cy[:, None] - seeds[None, :, 1])
    owner = claimed[u].copy()
    held = np.bincount(owner[owner >= 0], size[owner >= 0], minlength=k_div)
    room = 0.9 * np.asarray(targets, float) - held
    need = np.array(need, float) - held
    for j in np.argsort(-need, kind="stable"):
        for k in np.argsort(dist[:, j], kind="stable"):
            if need[j] <= 0:
                break
            if owner[k] < 0 and size[k] <= need[j] + 0.01 * targets[j]:
                owner[k], need[j], room[j] = j, need[j] - size[k], room[j] - size[k]
    d = dist / v[None, :]
    for k in np.argsort(-n, kind="stable"):
        if owner[k] >= 0:
            continue
        pref = np.lexsort((d[k], -share[k]))
        fit = pref[room[pref] >= n[k] * cell]
        owner[k] = fit[0] if len(fit) else int(np.argmax(room))
        room[owner[k]] -= n[k] * cell
    return on, owner[inv]


def partition(mask, wx, wy, seeds, targets, cell, tolerance=0.01, rounds=16, sea=None, anchored=False, claims=None):
    """Label mask so that label i covers ~targets[i] km².

    Returns (raster with -1 outside the mask, relative errors, mask). Divisions that own whole
    islands get their coastline adjusted into `sea` (default: everything outside the mask), so the
    returned mask can differ slightly from the input.

    With `anchored`, divisions stay around their seeds, for sizes too unequal for a power diagram,
    whose large cells swallow small cells' seeds and push those divisions elsewhere: seeds offshore
    (a port's anchor in its harbour) move to the nearest sizeable land; the small divisions (under
    _CARVE_SHARE of the whole) are grown outward from their seed first, smallest first, and trade
    only their own surplus or shortfall afterwards; the rest are a multiplicatively weighted Voronoi
    diagram of their seeds, in which every seed lies in its own cell, and an island with no seed on
    it goes whole to the nearest division with room for it (_settle_islands), or to the division
    that claims it: claims[i] lists points (x, y) on the islands division i is to have. Clean-up
    keeps each division's piece around its seed and hands fragments to the land they border.
    """
    seeds = np.array(seeds, float)
    targets = np.asarray(targets, float)
    targets = targets * mask.sum() * cell / targets.sum()
    fixed = np.full(mask.shape, -1)
    carved = np.zeros(len(seeds), bool)
    res = math.sqrt(cell)
    if anchored:
        seeds = _onto(seeds, mask, res, targets / cell / 4)
        free = mask.copy()
        for i in np.argsort(targets, kind="stable")[:-1]:
            if targets[i] >= _CARVE_SHARE * targets.sum():
                break
            piece = _carve(free, mask, wx, wy, seeds[i], int(round(targets[i] / cell)), res)
            fixed[piece], carved[i] = i, True
            free &= ~piece
    home = None
    if anchored:
        home = np.array([(min(int(y / res), mask.shape[0] - 1), min(int(x / res), mask.shape[1] - 1)) for x, y in seeds])
        for i in np.flatnonzero(carved):
            if fixed[tuple(home[i])] != i:
                home[i] = np.argwhere(fixed == i)[0]
    big = np.flatnonzero(~carved)
    idx = np.flatnonzero(mask & (fixed < 0))
    px, py = wx.ravel()[idx], wy.ravel()[idx]
    w = np.sqrt(targets[big]) if anchored else np.zeros(len(big))
    if anchored:
        comp, n_comp = ndimage.label(mask)
        sizes = np.bincount(comp.ravel())
        islands = np.ones(n_comp + 1, bool)
        islands[0] = False
        main = np.argmax(sizes[1:]) + 1
        islands[main] = False
        at = comp[home[:, 0], home[:, 1]]
        islands[at] = False
        # what a division whose seed is on an island lacks beyond its share of that island
        need = np.where(at != main, targets - sizes[at] * cell / np.bincount(at)[at], 0.0)
        claimed = np.full(n_comp + 1, -1)
        if claims is not None:
            pos = {i: j for j, i in enumerate(big)}
            _, (jy, jx) = ndimage.distance_transform_edt(~islands[comp], return_indices=True)
            for i, pts in enumerate(claims):
                for x, y in pts:
                    iy, ix = min(max(int(y / res), 0), mask.shape[0] - 1), min(max(int(x / res), 0), mask.shape[1] - 1)
                    # a point off this mask's islands (another city's island) claims nothing
                    if i in pos and math.hypot(jy[iy, ix] - iy, jx[iy, ix] - ix) * res <= 2:
                        claimed[comp[jy[iy, ix], jx[iy, ix]]] = pos[i]
        comp = comp.ravel()[idx]
        # islands are settled once, after a first diagram, since whole islands flipping between
        # divisions from round to round never settle; the rounds balance the rest of the land
        lab0, w = _scaled(px, py, seeds[big], targets[big], cell, w, 200)
        on, owner = _settle_islands(px, py, lab0, comp, islands, seeds[big], w, targets[big], cell, need[big], claimed)
        lab0[on] = owner
        rest = ~on
        goal = np.maximum(targets[big] - np.bincount(lab0[on], minlength=len(big)) * cell, 0.05 * targets[big])
    tol = _tolerance(targets, cell, tolerance)
    best, best_err = None, None
    for rnd in range(rounds):
        if anchored:
            goal *= rest.sum() * cell / goal.sum()
            lab = lab0.copy()
            lab[rest], w = _scaled(px[rest], py[rest], seeds[big], goal, cell, w, 200 if rnd == 0 else 40)
        else:
            lab, w = _balance(px, py, seeds[big], targets[big], cell, w, 500 if rnd == 0 else 120)
        grid = fixed.ravel().copy()
        grid[idx] = big[lab]
        grid = _contiguous(grid.reshape(mask.shape), mask, anchored, home)
        area = np.bincount(grid[mask], minlength=len(seeds)) * cell
        err = np.abs(area - targets) / targets
        if best_err is None or (err / tol).max() < (best_err / tol).max():
            best, best_err = grid, err
        if (err / tol).max() <= 1:
            break
        if anchored:
            # _scaled meets its goals before clean-up; aim off by what clean-up moved
            goal = np.maximum(goal + 0.7 * (targets[big] - area[big]), 0.05 * targets[big])
        else:
            w = w + 0.8 * (targets[big] - area[big])
    if (best_err / tol).max() > 1:
        sea = ~mask if sea is None else sea
        for _ in range(4):
            best, mask = _fit_islands(best, mask, sea & ~mask, targets, cell)
            targets = targets * mask.sum() * cell / targets.sum()
        (y0, y1), (x0, x1) = [(max(int(a.min()) - 1, 0), int(a.max()) + 2) for a in np.nonzero(mask)]
        win = (slice(y0, y1), slice(x0, x1))
        keep = None
        if anchored:
            # trading goes round a disc of a quarter of each division's equivalent radius around its seed
            keep = np.zeros(mask.shape, bool)
            for i in big:
                (hx, hy), r = seeds[i], 0.25 * math.sqrt(targets[i] / math.pi)
                ys = slice(max(int((hy - r) / res), 0), min(int((hy + r) / res) + 1, mask.shape[0]))
                xs = slice(max(int((hx - r) / res), 0), min(int((hx + r) / res) + 1, mask.shape[1]))
                yy, xx = np.mgrid[ys, xs]
                disc = ((xx + 0.5) * res - hx) ** 2 + ((yy + 0.5) * res - hy) ** 2 <= r * r
                keep[ys, xs] |= disc & (best[ys, xs] == i)
            keep = keep[win]
        best[win] = _refine(best[win], mask[win], targets, cell, tolerance, frozen=carved if anchored else None, keep=keep,
                            home=None if home is None else home - (y0, x0))
        best_err = np.abs(np.bincount(best[mask], minlength=len(seeds)) * cell - targets) / targets
    return best, best_err, mask


def pole_of_inaccessibility(mask: np.ndarray, xs, ys):
    d = ndimage.distance_transform_edt(mask)
    iy, ix = np.unravel_index(np.argmax(d), d.shape)
    return float(xs[ix]), float(ys[iy])
