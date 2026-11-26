"""Check where places stand against the last build, without building, and list free spots for new ones.

The build keeps what each district's sites were laid out against (centre, street direction, built-up area,
land) beside the region's result. This lays the sites out again from the YAML as it is now, with the build's
own code, and prints the warnings the build would give: overlaps, sites outside the built-up area, ports
off the coast.

    python pipeline/placecheck.py                       # every district
    python pipeline/placecheck.py 佩鲁诺区 div_qnzksj     # some districts (id or Chinese name)
    python pipeline/placecheck.py --free 佩鲁诺区 --type armoury_500x350_rural            # free spots for one building
    python pipeline/placecheck.py --free 佩鲁诺区 --type armoury_500x350_rural --row 6 --spacing 700
    python pipeline/placecheck.py --free 佩鲁诺区 --type bank_hall_200x140 --grid 3x2 --spacing 300,250

Offsets are [east, north] km from the district centre: what offset_km and a group's anchor_km take.
A change to the terrain, the districts or the streets needs a build before this is right again."""
from __future__ import annotations

import argparse
import json
import math
import pickle
import sys
from pathlib import Path

import numpy as np
import shapely
from shapely import affinity
from shapely.geometry import Point, box, shape

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas import cache, common, placeforms  # noqa: E402
from atlas.common import OUT  # noqa: E402
from atlas.grid import Frame  # noqa: E402
from atlas.sites import landmark_sites  # noqa: E402
from atlas.world import World  # noqa: E402

PLACEMENT_FILE = "placement.pkl"
CLEARANCE_KM = 0.05  # room left round a new site
STEP_KM = 0.1
RURAL_REACH_KM = 30.0
LINE_CLEARANCE_KM = 0.1  # a free spot keeps this far from roads and railways (the build itself does not check this)


class Placement:
    """The last build's layout inputs, by district, loaded a region at a time."""

    def __init__(self, world: World):
        self.world = world
        self._regions: dict[str, dict] = {}
        self._districts: dict[str, object] | None = None
        self._lines: list | None = None

    def of(self, did: str) -> dict | None:
        gen = self.world._region_of.get(did)
        if gen is None:
            return None
        name = gen["_region"]
        if name not in self._regions:
            folders = sorted((f for f in cache.REGION_DIR.glob(f"{name}-*") if (f / PLACEMENT_FILE).exists()), key=lambda f: f.stat().st_mtime)
            self._regions[name] = pickle.load(open(folders[-1] / PLACEMENT_FILE, "rb")) if folders else {}
        return self._regions[name].get(did)

    def _km(self, did: str, geom):
        """A lon/lat geometry of the last build in the layout's km of the district's region."""
        fr = self.world._region_of[did]["frame"]
        frame = Frame(fr["origin_lonlat"], fr["size_km"], fr.get("scale", 1.0))

        def to_km(c):
            x, y = frame.from_lonlat(c[:, 0], c[:, 1])
            return np.stack([x * frame.scale, y * frame.scale], axis=-1)
        return shapely.transform(geom, to_km)

    def district(self, did: str):
        """The district's area in the layout's km (from the last build's divisions.geojson), or None."""
        if self._districts is None:
            path = OUT / "divisions.geojson"
            feats = json.load(open(path, encoding="utf-8"))["features"] if path.exists() else []
            self._districts = {f["properties"]["id"]: f["geometry"] for f in feats}
        geom = self._districts.get(did)
        if geom is None or did not in self.world._region_of:
            return None
        return self._km(did, shape(geom)).buffer(0)

    def lines(self, did: str, around):
        """The last build's roads and railways within `around` (the layout's km), widened to LINE_CLEARANCE_KM; None if there are none."""
        if self._lines is None:
            self._lines = [shape(f["geometry"]) for name in ("roads.geojson", "rail.geojson") if (OUT / name).exists()
                           for f in json.load(open(OUT / name, encoding="utf-8"))["features"]]
        near = [g for g in (self._km(did, g) for g in self._lines) if g.intersects(around)]
        return shapely.union_all(near).buffer(LINE_CLEARANCE_KM) if near else None


def lay_out(world: World, placement: Placement, did: str):
    """The district's sites and the build's warnings for them, or None if the last build has nothing on it."""
    pl = placement.of(did)
    if pl is None:
        return None
    keep, log = list(common.WARNINGS), common.log
    common.WARNINGS.clear()
    common.log = lambda *a, **k: None  # the warnings are returned, not logged
    try:
        sites = landmark_sites(world, world.divisions[did], pl["core"], pl["angle"], pl["built"], pl["land"], pl["seed"], pl["scale"])
        return sites, list(common.WARNINGS)
    finally:
        common.WARNINGS[:] = keep
        common.log = log


def check(world: World, districts=None) -> tuple[dict[str, list[str]], list[str]]:
    """Warnings by district for the districts given (all with places by default), and the districts the last build lacks."""
    placement = Placement(world)
    wanted = districts or sorted({p["in"] for p in world.places.values() if p.get("site")})
    out, missing = {}, []
    for did in wanted:
        got = lay_out(world, placement, did)
        if got is None:
            missing.append(did)
        elif got[1]:
            out[did] = got[1]
    return out, missing


def free_spots(world: World, did: str, size_m, rural: bool, slots=((0.0, 0.0),), count=5, angle_deg=None, placement=None) -> list[tuple[float, float]]:
    """Up to `count` anchors [east, north] km from the district centre, nearest first, where sites of
    `size_m` on every slot ([along, across] km from the anchor) stand clear of the district's other sites:
    in the built-up area, or for a rural type on dry land of the district outside it, and off the roads and railways."""
    placement = placement or Placement(world)
    pl = placement.of(did)
    got = lay_out(world, placement, did)
    if pl is None or got is None:
        raise SystemExit(f"the last build has no layout for {did}: name a district (not a city that has districts), or build its region first")
    core, land = pl["core"], pl["land"]
    ga = pl["angle"] if angle_deg is None else math.radians(angle_deg)
    taken = shapely.union_all([s for _, s, _ in got[0]]).buffer(CLEARANCE_KM) if got[0] else None
    built = pl["built"].buffer(0.05) if pl["built"] is not None and not pl["built"].is_empty else None
    w, h = size_m[0] / 1000, size_m[1] / 1000
    if rural:
        area = placement.district(did)
        zone = land.intersection(area) if area is not None else land.intersection(Point(core).buffer(RURAL_REACH_KM))
        if built is not None:
            zone = zone.difference(built)
        zone = zone.intersection(Point(core).buffer(RURAL_REACH_KM))
    else:
        if built is None:
            return []
        zone = built.intersection(land)
    if taken is not None:
        zone = zone.difference(taken)
    if not zone.is_empty and (lines := placement.lines(did, box(*zone.bounds))) is not None:
        zone = zone.difference(lines)
    if zone.is_empty:
        return []
    shapely.prepare(zone)
    rect = affinity.rotate(box(-w / 2, -h / 2, w / 2, h / 2), ga, origin=(0, 0), use_radians=True)
    offs = [placeforms.turned(s, ga) for s in slots]
    x0, y0, x1, y1 = zone.bounds
    xs, ys = np.meshgrid(np.arange(x0, x1 + STEP_KM, STEP_KM), np.arange(y0, y1 + STEP_KM, STEP_KM))
    cand = np.stack([xs.ravel(), ys.ravel()], axis=-1)
    ok = np.ones(len(cand), bool)
    for dx, dy in offs:  # every slot's centre first: cheap
        ok &= shapely.contains_xy(zone, cand[:, 0] + dx, cand[:, 1] + dy)
    cand = cand[ok]
    cand = cand[np.argsort(np.hypot(cand[:, 0] - core[0], cand[:, 1] - core[1]))]
    out: list[tuple[float, float]] = []
    reach = max(math.hypot(dx, dy) for dx, dy in offs) + math.hypot(w, h)
    for x, y in cand:
        if any(math.hypot(x - core[0] - a, y - core[1] - b) < reach for a, b in out):
            continue  # one answer per neighbourhood
        if all(zone.contains(affinity.translate(rect, x + dx, y + dy)) for dx, dy in offs):
            out.append((round(float(x - core[0]), 2), round(float(y - core[1]), 2)))
            if len(out) == count:
                break
    return out


def district_id(world: World, name: str) -> str:
    if name in world.divisions:
        return name
    hits = [d["id"] for d in world.divisions.values() if d["names"].get("zh") == name or d["names"].get("en") == name]
    if len(hits) != 1:
        raise SystemExit(f"{name}: " + ("no such district" if not hits else "several districts carry this name; give the id: " + ", ".join(hits)))
    return hits[0]


def group_slots(pattern: str, n_or_shape, spacing) -> list[list[float]]:
    """The slots [along, across] km of a row of n or a grid of columns x rows."""
    if pattern == "row":
        g = {"pattern": "row", "spacing_m": spacing[0]}
        return [placeforms.slot_km(g, k) for k in range(n_or_shape)]
    cols, rows = n_or_shape
    g = {"pattern": "grid", "spacing_m": list(spacing), "columns": cols}
    return [placeforms.slot_km(g, k) for k in range(cols * rows)]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("districts", nargs="*", help="districts to check (id or name); all by default")
    ap.add_argument("--free", metavar="DISTRICT", help="list free spots in this district instead")
    ap.add_argument("--type", help="the building type the free spots are for")
    ap.add_argument("--row", type=int, help="a row of this many slots")
    ap.add_argument("--grid", help="a grid, COLUMNSxROWS")
    ap.add_argument("--spacing", help="metres between slots (along[,across])")
    ap.add_argument("--angle", type=float, help="the group's direction in degrees (east = 0); the street grid by default")
    ap.add_argument("--count", type=int, default=5)
    args = ap.parse_args()
    world = World()
    if args.free:
        t = world.building_types.get(args.type or "")
        if t is None:
            raise SystemExit("--type names a building type of world/registry/building_types.yaml")
        spacing = [float(v) for v in (args.spacing or "0").split(",")]
        spacing = spacing * 2 if len(spacing) == 1 else spacing
        if (args.row or args.grid) and min(spacing) <= 0:
            raise SystemExit("--row and --grid take --spacing")
        slots = group_slots("row", args.row, spacing) if args.row else \
            group_slots("grid", tuple(int(v) for v in args.grid.lower().split("x")), spacing) if args.grid else [[0.0, 0.0]]
        did = district_id(world, args.free)
        spots = free_spots(world, did, t["size_m"], bool(t.get("rural")), slots, args.count, args.angle)
        print(f"{world.divisions[did]['names']['zh']} {did}: {len(spots)} free spot(s) for {args.type}"
              + (f" × {len(slots)}" if len(slots) > 1 else "") + " ([east, north] km from the district centre, nearest first)")
        for x, y in spots:
            print(f"  [{x:.2f}, {y:.2f}]")
        return
    found, missing = check(world, [district_id(world, d) for d in args.districts] or None)
    for did, warnings in found.items():
        print(f"{world.divisions[did]['names']['zh']} {did}")
        for w in warnings:
            print("  · " + w)
    if missing:
        print(f"not in the last build (build first): {', '.join(missing)}")
    print(f"{sum(len(w) for w in found.values())} warning(s)")
    sys.exit(1 if found else 0)


if __name__ == "__main__":
    main()
