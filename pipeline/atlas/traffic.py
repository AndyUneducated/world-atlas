"""Traffic and service on the route cards, from the people along each line: daily traffic, lanes,
cross-section and driving time of roads; ridership, peak headway and fastest run of railways.

Both use a gravity model: the trips between two places along a line grow with the product of
their populations and fall with the distance between them; the load on a stretch is the sum of
the trips that pass over it. Runs after merge_crossings, on the whole world's entities."""
from __future__ import annotations

import math

from .world import World

OPERATOR_KIND = {"national_expressway": "expressway", "territorial_expressway": "expressway",
                 "territorial_highway": "highway", "intercity_rail": "rail", "freight_rail": "rail"}


def _haversine_km(a, b) -> float:
    (lon1, lat1), (lon2, lat2) = (map(math.radians, p) for p in (a, b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def _loads(points: list[tuple[float, float]], cuts: list[float], gravity: float, min_km: float) -> list[float]:
    """Daily trips over each cut (chainage km) between places [(chainage km, people)] along a line."""
    out = []
    for x in cuts:
        left = [(m, p) for m, p in points if m < x]
        right = [(m, p) for m, p in points if m >= x]
        out.append(sum(gravity * pi * pj / max(mj - mi, min_km) for mi, pi in left for mj, pj in right))
    return out


def _round_sig(v: float, digits: int = 2) -> int:
    if v <= 0:
        return 0
    e = 10 ** max(int(math.floor(math.log10(v))) - digits + 1, 0)
    return int(round(v / e) * e)


def _operator(world: World, ent: dict, r: dict, entities: dict) -> dict | None:
    if r.get("operator"):
        return r["operator"]
    first = entities.get((ent.get("via") or [""])[0], {})
    chain = ent.get("ancestors") or [first.get("in"), *first.get("ancestors", [])]
    terr = next((a for a in chain if a in {g["territory"] for g in world.generators}), None)
    return world.divisions.get(terr or "", {}).get("operators", {}).get(OPERATOR_KIND[r["network"]])


def _road(world: World, ent: dict, r: dict, entities: dict, std: dict, model: dict) -> None:
    segs = ent.get("segments") or []
    if not segs or "cross_section" not in std:
        return
    people = lambda did: entities.get(did or "", {}).get("population", 0)
    stops = set(r["via"])
    # a district the route stops in counts in full; one it only passes through, by how far it runs there
    points = [(sg["from_km"] + sg["km"] / 2, people(sg["division"]) * (1.0 if sg["division"] in stops else min(1.0, sg["km"] / model["full_share_km"])))
              for sg in segs]
    end_km = segs[-1]["from_km"] + segs[-1]["km"]
    on_route = {sg["division"] for sg in segs}
    # stops with no stretch of road of their own (a crossing tunnel's ends) load the route at its ends
    points += [(0.0 if k < len(r["via"]) / 2 else end_km, people(v)) for k, v in enumerate(r["via"])
               if not on_route & {v, *entities.get(v, {}).get("children", [])}]
    cuts = [sg["from_km"] for sg in segs] + [end_km]
    over = _loads(points, cuts, model["gravity"], model["min_km"])
    xs, cap = std["cross_section"], std["lane_capacity_vpd"]
    base = model["base_vpd"].get(r["network"], 0)
    for i, sg in enumerate(segs):
        aadt = base + model["local_trips_per_person"] * points[i][1] + (over[i] + over[i + 1]) / 2
        sg["aadt"] = _round_sig(aadt)
        lanes = xs["lanes"]
        if xs.get("grow"):
            lanes = max(lanes, math.ceil(aadt / 2 / cap))
        sg["lanes"] = lanes
    lanes = [sg["lanes"] for sg in segs]
    width = lambda n: round(2 * (n * xs["lane_m"] + xs["shoulder_m"] + xs["inner_shoulder_m"] + xs["verge_m"]) + xs["median_m"], 1)
    hours = sum(sg["km"] / (sg.get("speed_kmh") or std["cruise_kmh"]) for sg in segs)
    ent["road"] = {
        "lanes": [min(lanes), max(lanes)],
        "cross_section": {k: xs[k] for k in ("lane_m", "shoulder_m", "median_m")},
        "width_m": [width(min(lanes)), width(max(lanes))],
        "aadt": [min(sg["aadt"] for sg in segs), max(sg["aadt"] for sg in segs)],
        "drive_min": round(hours * 60),
        "cruise_kmh": std["cruise_kmh"],
        "operator": _operator(world, ent, r, entities),
    }


def _freight(world: World, ent: dict, r: dict, entities: dict) -> None:
    """Heavy-haul lines carry what their loaded trains a day bring down: net tonnes a train × trains × 365."""
    tech = ent.get("tech") or {}
    train = tech.get("train") or {}
    if not train.get("net_t") or not tech.get("loaded_trains_per_day"):
        return
    km = ent.get("stats", {}).get("length_km", 0)
    ent["service"] = {
        "fastest_min": round(km / tech["operating_speed_kmh"] * 60),
        "loaded_trains_per_day": tech["loaded_trains_per_day"],
        "freight_t_per_year": _round_sig(train["net_t"] * tech["loaded_trains_per_day"] * 365),
        "operator": _operator(world, ent, r, entities),
    }


def _rail(world: World, ent: dict, r: dict, entities: dict, model: dict) -> None:
    if r["network"] == "freight_rail":
        return _freight(world, ent, r, entities)
    stops = [s for s in dict.fromkeys(ent.get("via", [])) if s in entities and "center" in entities[s]]
    tech = ent.get("tech") or {}
    if len(stops) < 2 or not tech.get("train"):
        return
    city_of = lambda sid: entities.get(entities[sid].get("in", ""), {}).get("parent")
    served: dict[str, int] = {}
    for e in entities.values():
        if e.get("subtype") == "station" and any(entities.get(ln, {}).get("network") == "intercity_rail" for ln in e.get("lines", [])):
            served[c] = served.get(c := city_of(e["id"]) or "", 0) + 1
    chain, points = 0.0, []
    for i, sid in enumerate(stops):
        if i:
            chain += _haversine_km(entities[stops[i - 1]]["center"], entities[sid]["center"])
        city = city_of(sid) or ""
        points.append((chain, entities.get(city, {}).get("population", 0) / max(served.get(city, 1), 1)))
    over = _loads(points, [(a[0] + b[0]) / 2 for a, b in zip(points[:-1], points[1:])], model["gravity"], model["min_km"])
    trips_day = sum(model["gravity"] * pi * pj / max(mj - mi, model["min_km"])
                    for k, (mi, pi) in enumerate(points) for mj, pj in points[k + 1:])
    train = tech["train"]
    seats = train["seats"] * (tech["formation"]["coupled"] / tech["formation"]["cars"] if tech.get("formation", {}).get("coupled") else 1)
    peak = max(over) * model["peak_hour_share"] * model["peak_direction_share"]
    per_hour = peak / (seats * model["load_factor"])
    # the longest standard headway that still carries the peak hour
    headway = next((h for h in sorted(model["headways_min"], reverse=True) if 60 / h >= per_hour), min(model["headways_min"]))
    km = ent.get("stats", {}).get("length_km", chain)
    ent["service"] = {
        "fastest_min": round(km / tech["operating_speed_kmh"] * 60 + model["start_stop_min"]),
        "peak_headway_min": headway,
        "trains_per_peak_hour": math.ceil(per_hour),
        "ridership_per_year": _round_sig(trips_day * 365),
        "operator": _operator(world, ent, r, entities),
    }


def annotate(world: World, entities: dict) -> None:
    """Add road and rail service figures to every expressway, territorial highway and railway card."""
    eng = world.engineering
    standards, road_model, rail_model = eng.get("standards", {}), eng.get("traffic"), eng.get("rail_service")
    for r in world.routes.values():
        if r.get("network") in OPERATOR_KIND and r["id"] in entities and road_model:
            _road(world, entities[r["id"]], r, entities, standards.get(r["network"], {}), road_model)
    for r in world.railways.values():
        if r.get("network") in OPERATOR_KIND and r["id"] in entities and rail_model:
            _rail(world, entities[r["id"]], r, entities, rail_model)
