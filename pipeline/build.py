"""Build map data from world/ sources into public/data/.

    python pipeline/build.py                # full build; regions whose sources and code are unchanged come from .cache
    python pipeline/build.py --only cn-vk   # rebuild just this region; the others come from .cache, even if out of date
    python pipeline/build.py --check        # validate sources only

The regions build in parallel, one process each (--jobs); their log lines carry the region name.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import traceback
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas import cache, climate, common, economy, politics, traffic  # noqa: E402
from atlas.common import OUT, log, write_geojson  # noqa: E402
from atlas.dem_tiles import fill_sea_tiles, merge_dem_tiles  # noqa: E402
from atlas.region import LAYERS, build_region  # noqa: E402
from atlas.routes import merge_crossings  # noqa: E402
from atlas.world import TEXT_KEYS, World  # noqa: E402


def base_entities(world: World) -> dict:
    out = {}
    for eid, e in world.entities.items():
        ent = {k: v for k, v in e.items() if not k.startswith("_") and k != "detect"}
        ent["source"] = e.get("_source")
        if eid in world.divisions or eid in world.countries:
            ent["kind"] = "division"
            ent["ancestors"] = world.ancestors(eid)
            ent["children"] = [c["id"] for c in sorted(world.children(eid), key=lambda d: d.get("codes", {}).get("admin", ""))]
        elif eid in world.features:
            ent["kind"] = "natural"
        elif eid in world.routes or eid in world.railways:
            ent["kind"] = "route"
        elif eid in world.places:
            ent["kind"] = "place"
        out[eid] = ent
    return out


def region_worker(name: str, fresh: bool, stale_ok: bool):
    """Build one region (or find it in .cache) in its own process; returns its cache folder and how it was got."""
    common.LOG_TAG = f"{name} "
    world = World()
    spec = next(s for s in world.generators if s["_region"] == name)
    try:
        return cache.region(name, world.region_sources(spec), lambda d: build_region(world, spec, base_entities(world), d / "dem", not fresh),
                            enabled=not fresh, stale_ok=stale_ok)
    except Exception:
        log("FAILED\n" + traceback.format_exc())
        raise


def overlapping_territories(results: list[dict]) -> list[str]:
    """Pairs of regions whose generated land overlaps (frames may overlap at sea, land may not)."""
    land = [(r["region"]["id"], shape(next(f["geometry"] for f in r["layers"]["divisions"] if f["id"] == r["region"]["id"])))
            for r in results]
    return [f"{a} / {b}" for i, (a, pa) in enumerate(land) for b, pb in land[i + 1:] if pa.intersection(pb).area > 1e-6]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate the world sources and stop")
    ap.add_argument("--fresh", action="store_true", help="ignore cached stages and regions and recompute everything")
    ap.add_argument("--only", nargs="+", metavar="REGION", help="rebuild only these regions (generator name, e.g. cn-vk)")
    ap.add_argument("--jobs", type=int, default=4, help="regions built at once, one process each (default 4)")
    args = ap.parse_args()
    world = World()
    errors = world.validate()
    names = {s["_region"] for s in world.generators}
    errors += [f"--only {n}: no world/generator/{n}.yaml" for n in args.only or () if n not in names]
    if errors:
        print("Source validation failed:")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    log(f"sources ok: {len(world.divisions)} divisions, {len(world.features)} features, {len(world.routes)} routes, "
        f"{len(world.railways)} railways, {len(world.places)} places")
    if args.check:
        return
    base = base_entities(world)
    order = [s["_region"] for s in world.generators]
    with ProcessPoolExecutor(max_workers=max(1, min(args.jobs, len(order)))) as pool:
        jobs = [pool.submit(region_worker, n, args.fresh, bool(args.only) and n not in args.only) for n in order]
        if OUT.exists():  # the regions build into .cache, so the old output is cleared meanwhile
            shutil.rmtree(OUT)
        OUT.mkdir(parents=True)
        found = [j.result() for j in jobs]
    results = []
    for name, got in zip(order, found):
        if got is None:
            log(f"{name}: WARN not built (not in --only, nothing cached)")
            continue
        folder, how = got
        if how != "built":
            log(f"{name}: {how}" + (" (out of date)" if how == "stale" else ""))
        results.append((cache.load_region(folder), folder))
    if overlaps := overlapping_territories([r for r, _ in results]):
        print("Regions overlap: " + ", ".join(overlaps))
        sys.exit(1)

    entities = dict(base)
    layers = {k: [] for k in LAYERS}
    graph = {"nodes": [], "edges": [], "roads": [], "places": {}}
    for result, folder in results:
        for k, v in result["entities"].items():
            if "_parts" in v and "_parts" in entities.get(k, {}):  # a line crossing between territories
                v = {**v, "_parts": entities[k]["_parts"] + v["_parts"]}
            entities[k] = v
        for k, feats in result["layers"].items():
            layers[k] += feats
        g, n, r = result["graph"], len(graph["nodes"]), len(graph["roads"])
        graph["nodes"] += g["nodes"]
        graph["roads"] += g["roads"]
        graph["edges"] += [[a + n, b + n, length, minutes, ri + r, line] for a, b, length, minutes, ri, line in g["edges"]]
        graph["places"].update({eid: v + n for eid, v in g["places"].items()})
        merge_dem_tiles(folder / "dem", OUT / "dem")
        with open(cache.CACHE_DIR / f"candidates-{result['region']['id']}.json", "w", encoding="utf-8") as f:
            json.dump(result["candidates"], f, ensure_ascii=False, indent=1)
    regions = [result["region"] for result, _ in results]
    for eid, e in base.items():  # a cached region may carry card text older than the sources
        for k in TEXT_KEYS:
            if k in e:
                entities[eid][k] = e[k]
            else:
                entities[eid].pop(k, None)
    merge_crossings(world, entities, layers, graph)
    traffic.annotate(world, entities)
    economy.annotate(world, entities)
    climate.annotate(world, entities, layers["divisions"], OUT / "dem")
    politics.annotate(world, entities)
    dem_bounds = [f(r["frame_bounds"][i] for r in regions) for i, f in enumerate((min, min, max, max))]
    log(f"  {fill_sea_tiles(OUT / 'dem', dem_bounds)} open-water terrain tiles")
    for name, feats in layers.items():
        write_geojson(f"{name}.geojson", feats)
    with open(OUT / "graph.json", "w", encoding="utf-8") as f:
        json.dump(graph, f, separators=(",", ":"))
    with open(OUT / "entities.json", "w", encoding="utf-8") as f:
        json.dump(entities, f, ensure_ascii=False, separators=(",", ":"))
    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "planet": world.planet,
        "regions": regions,
        "dem": {"tiles": "dem/{z}/{x}/{y}.png", "encoding": "terrarium", "tileSize": 256, "minzoom": 3, "maxzoom": 10,
                "bounds": dem_bounds},
        "layers": sorted(layers),
    }
    with open(OUT / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log("done")


if __name__ == "__main__":
    main()
