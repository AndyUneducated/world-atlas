"""Economy and population on the city and district cards, from the traits in world/divisions and the
model in world/economy.yaml: GDP, GDP per head, the three-sector mix and leading industries; the age
structure and first languages. Districts are computed, cities and territories add up their districts.
Runs after merge_crossings, on the whole world's entities."""
from __future__ import annotations

import hashlib

import numpy as np

from .world import World

SECTORS = ("primary", "secondary", "tertiary")


def _rng(eid: str) -> np.random.Generator:
    return np.random.default_rng(int(hashlib.sha1(("economy:" + eid).encode()).hexdigest()[:8], 16))


def _percent(values: list[float]) -> list[int]:
    """Whole percentages summing to 100 (largest remainder)."""
    total = sum(values)
    raw = [v * 100 / total for v in values]
    out = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: out[i] - raw[i])[: 100 - sum(out)]:
        out[i] += 1
    return out


def _round_sig(v: float, digits: int) -> int:
    e = 10 ** max(len(str(int(v))) - digits, 0)
    return int(round(v / e) * e)


def _traits(world: World, did: str) -> dict:
    d = world.divisions[did]
    parent = world.divisions.get(d.get("parent", ""), {})
    return {**parent.get("traits", {}), **d.get("traits", {})}


def _district(world: World, did: str, model: dict) -> dict:
    d, t, rng = world.divisions[did], _traits(world, did), _rng(did)
    ind = model["industries"]
    lead = t["industries"][: len(model["rank_weights"])]
    w = model["rank_weights"][: len(lead)]
    noise = model["perturbation"]
    base = next(model["base_gdp_per_capita"][a] for a in world.ancestors(did) if a in model["base_gdp_per_capita"])
    productivity = sum(wi * ind[k]["productivity"] for wi, k in zip(w, lead)) / sum(w)
    density = d["population"] / d["area_km2"]
    per_head = (base * productivity * t.get("income", 1.0) * (density / 100) ** model["density_elasticity"]
                * float(np.exp(rng.normal(0, noise["gdp_per_capita"]))))
    sectors = [model["base_sectors"].get(s, 0) + sum(wi * ind[k]["sectors"].get(s, 0) for wi, k in zip(w, lead)) for s in SECTORS]
    sectors = [max(v * (1 + rng.normal(0, noise["sectors"])), 0.3) for v in sectors]
    age = [p + sum(wi * ind[k].get("age", (0, 0, 0))[i] for wi, k in zip(w, lead)) + rng.normal(0, noise["age"])
           for i, p in enumerate(model["age"][t["age"]])]
    langs = [model["heritage"][t["heritage"]].get(lg, 0) * float(np.exp(rng.normal(0, noise["languages"]))) for lg in model["languages"]]
    return {"population": d["population"], "gdp": per_head * d["population"], "sectors": sectors,
            "age": [max(a, 3.0) for a in age], "languages": langs, "lead": lead}


def _sum(parts: list[dict]) -> dict:
    pop = sum(p["population"] for p in parts)
    gdp = sum(p["gdp"] for p in parts)
    # shares weighted by each district's GDP (sectors) or population (age, languages)
    mix = lambda key, by: [sum(p[by] * p[key][i] / sum(p[key]) for p in parts) for i in range(len(parts[0][key]))]
    return {"population": pop, "gdp": gdp, "sectors": mix("sectors", "gdp"), "age": mix("age", "population"),
            "languages": mix("languages", "population")}


def _card(v: dict, lead: list[str], model: dict) -> tuple[dict, dict]:
    ind = model["industries"]
    economy = {
        "gdp_usd": _round_sig(v["gdp"], 3),
        "gdp_per_capita_usd": _round_sig(v["gdp"] / v["population"], 3),
        "sectors": dict(zip(SECTORS, _percent(v["sectors"]))),
        "industries": [{"zh": ind[k]["zh"], "en": ind[k]["en"]} for k in lead],
    }
    langs = {lg: p for lg, p in zip(model["languages"], _percent(v["languages"])) if p}
    demographics = {"age": _percent(v["age"]), "languages": langs}
    return economy, demographics


def _leading(parts: list[dict], model: dict, n: int = 4) -> list[str]:
    """The industries with the most GDP behind them across these districts, by rank weight."""
    score: dict[str, float] = {}
    for p in parts:
        w = model["rank_weights"][: len(p["lead"])]
        for wi, k in zip(w, p["lead"]):
            score[k] = score.get(k, 0) + p["gdp"] * wi / sum(w)
    return sorted(score, key=score.get, reverse=True)[:n]


def annotate(world: World, entities: dict) -> None:
    """Add economy and demographics to every district, city and territory that has traits."""
    model = world.economy
    for e in entities.values():
        e.pop("traits", None)
    if not model:
        return
    has = {did for did, d in world.divisions.items() if d.get("traits")}
    # a district without traits of its own takes its city's
    has |= {did for did, d in world.divisions.items() if d["subtype"] == "borough" and d.get("parent") in has}
    leaves = {did for did in has if not any(c["id"] in has for c in world.children(did))}
    parts = {did: _district(world, did, model) for did in sorted(leaves)}
    for did, p in parts.items():
        if did in entities:
            entities[did]["economy"], entities[did]["demographics"] = _card(p, p["lead"], model)
    for did in world.divisions:
        if did in leaves:
            continue
        below = [p for leaf, p in parts.items() if did in world.ancestors(leaf)]
        if not below or did not in entities:
            continue
        own = world.divisions[did].get("traits", {}).get("industries")
        lead = own[: len(model["rank_weights"])] if own else _leading(below, model)
        total = _sum(below)
        entities[did]["economy"], entities[did]["demographics"] = _card(total, lead, model)
        entities[did].setdefault("population", total["population"])  # territories give none of their own
