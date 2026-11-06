"""Build map data from world/ sources into public/data/.

    python pipeline/build.py                # full build; regions whose sources and code are unchanged come from .cache
    python pipeline/build.py --only cn-vk   # rebuild just this region; the others come from .cache, even if out of date
    python pipeline/build.py --text         # only card text, party cards or party targets changed: refresh them in seconds
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
from atlas.dem_tiles import TILE_PX, merge_dem_tiles, pack_dem_tiles, zoom_range  # noqa: E402
from atlas.region import LAYERS, build_region  # noqa: E402
from atlas.routes import merge_crossings  # noqa: E402
from atlas.world import TEXT_KEYS, World  # noqa: E402

DEM_ARCHIVE = "terrain.pmtiles"


def base_entities(world: World) -> dict:
    out = {}
    for eid, e in world.entities.items():
        ent = {k: v for k, v in e.items() if not k.startswith("_") and k not in ("detect", "line", "structure_names")}
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
        elif eid in world.blocs:
            ent["kind"], ent["subtype"] = "bloc", "bloc"
        out[eid] = ent
    return out


def annotate_states(world: World, entities: dict) -> None:
    """A bloc spans its member nations and China and the United States their territories, so they open on the
    map; a bloc lists its members and a country the nations it backs (nation.backers). China's and the United
    States' densities, from their national figures."""
    def union(ids):
        boxes = [entities[i]["bbox"] for i in ids if entities.get(i, {}).get("bbox")]
        return [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)] if boxes else None

    nations = {sid: s["nation"] for sid, s in world.states.items() if sid in world.divisions}
    for bid, b in world.blocs.items():
        members = sorted((n for n, v in nations.items() if v.get("bloc") == bid), key=lambda n: world.divisions[n]["codes"]["iso3166_1"]["numeric"])
        entities[bid].update({"member_nations": members, "leader_nation": b["leader"],
                              "population": sum(world.divisions[n].get("population", 0) for n in members)})
        if box := union(members):
            entities[bid]["bbox"] = box
            entities[bid]["center"] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
    for cid in world.countries:
        backed = sorted(n for n, v in nations.items() if cid in v.get("backers", []))
        if backed:
            entities[cid]["member_nations"] = backed
        if box := union([did for did, d in world.divisions.items() if d.get("parent") == cid]):
            entities[cid]["bbox"] = box
            entities[cid]["center"] = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
        c = world.countries[cid]
        entities[cid].setdefault("stats", {})["density_per_km2"] = round(c["population"] / c["area_km2"], 1)


def copy_text(base: dict, entities: dict) -> None:
    """Card text from the sources onto built entities (a cached region may carry text older than the sources)."""
    for eid, e in base.items():
        for k in TEXT_KEYS:
            if k in e:
                entities[eid][k] = e[k]
            else:
                entities[eid].pop(k, None)


def refresh_text(world: World) -> None:
    """--text: card text, the economy and the elections straight into the last build's entities.json, without
    rebuilding regions or tiles. Enough for edits to notes and other card text (traits included), party cards and
    party targets; anything that moves or renames something on the map (names, sites, places, lines, terrain) still
    needs a build."""
    path = OUT / "entities.json"
    if not path.exists():
        sys.exit("--text needs a finished build in public/data; run a full build first")
    entities = json.loads(path.read_text(encoding="utf-8"))
    base = base_entities(world)
    if missing := sorted(base.keys() - entities.keys()):
        sys.exit(f"--text: {len(missing)} entities are not in the last build ({', '.join(missing[:3])}); run a full build")
    copy_text(base, entities)
    annotate_states(world, entities)
    for eid in [k for k, v in entities.items() if v.get("kind") == "party"]:
        del entities[eid]
    economy.annotate(world, entities)
    politics.annotate(world, entities)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(entities, f, ensure_ascii=False, separators=(",", ":"))
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    manifest["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(OUT / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log("card text, economy and elections refreshed in entities.json")
    log("done")


def region_worker(name: str, fresh: bool, stale_ok: bool):
    """Build one region (or find it in .cache) in its own process; returns its cache folder and how it was got."""
    common.LOG_TAG = f"{name} "
    world = World()
    spec = next(s for s in world.generators if s["_region"] == name)
    inputs = {**world.region_sources(spec), "dem_zooms": list(zoom_range(world.generators))}  # set by the finest region
    try:
        return cache.region(name, inputs, lambda d: build_region(world, spec, base_entities(world), d / "dem", not fresh),
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
    ap.add_argument("--text", action="store_true", help="refresh only card text and elections in the last build (seconds)")
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
    if args.text:
        return refresh_text(world)
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
    zooms = zoom_range(world.generators)
    staging = cache.CACHE_DIR / "dem-merged"  # loose tiles of all regions, packed into one archive below
    if staging.exists():
        shutil.rmtree(staging)
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
        merge_dem_tiles(folder / "dem", staging, zooms)
        with open(cache.CACHE_DIR / f"candidates-{result['region']['id']}.json", "w", encoding="utf-8") as f:
            json.dump(result["candidates"], f, ensure_ascii=False, indent=1)
    regions = [result["region"] for result, _ in results]
    copy_text(base, entities)
    annotate_states(world, entities)
    merge_crossings(world, entities, layers, graph)
    traffic.annotate(world, entities)
    economy.annotate(world, entities)
    climate.annotate(world, entities, layers["divisions"])
    politics.annotate(world, entities)
    dem_bounds = [f(r["frame_bounds"][i] for r in regions) for i, f in enumerate((min, min, max, max))]
    n, open_water = pack_dem_tiles(staging, OUT / DEM_ARCHIVE, dem_bounds, zooms)
    shutil.rmtree(staging)
    log(f"  {n} terrain tiles to zoom {zooms[-1]} in {DEM_ARCHIVE} ({open_water} open water, "
        f"{(OUT / DEM_ARCHIVE).stat().st_size / 1e6:.0f} MB)")
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
        "dem": {"url": DEM_ARCHIVE, "encoding": "terrarium", "tileSize": TILE_PX, "minzoom": zooms.start, "maxzoom": zooms[-1],
                "bounds": dem_bounds},
        "layers": sorted(layers),
    }
    with open(OUT / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    log("done")


if __name__ == "__main__":
    main()
