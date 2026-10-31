"""Elections on the territory, city and district cards, from world/politics.yaml: each district's vote in
the territorial election, from the parties' target shares in the territory leaned by the district's
industries, languages, ages, income and density; the territorial legislature and every city council,
seated by their territory's electoral system; the government each forms and the mayors. Parties become
entities of their own. Runs after economy.annotate, on the whole world's entities."""
from __future__ import annotations

import hashlib
import math

import numpy as np

from .world import World

LANG_KEYS = ("zh", "art-x-viking", "art-x-buckham", "en", "art-x-tavrunaq", "art-x-ivuran")


def _rng(key: str) -> np.random.Generator:
    return np.random.default_rng(int(hashlib.sha1(("politics:" + key).encode()).hexdigest()[:8], 16))


def _hamilton(weights: dict[str, float], seats: int, minimum: int = 0) -> dict[str, int]:
    """Seats in proportion to the weights by largest remainder, each at least `minimum`."""
    out = {k: minimum for k in weights}
    left = seats - minimum * len(weights)
    total = sum(weights.values()) or 1
    raw = {k: left * w / total for k, w in weights.items()}
    for k in raw:
        out[k] += int(raw[k])
    for k in sorted(raw, key=lambda k: int(raw[k]) - raw[k])[: seats - sum(out.values())]:
        out[k] += 1
    return out


def _divisor(votes: dict[str, float], seats: int, first: float, step: float) -> dict[str, int]:
    """Highest averages: D'Hondt (first 1, step 1) or Sainte-Laguë (first 1, step 2)."""
    out = {k: 0 for k in votes}
    for _ in range(seats):
        k = max(votes, key=lambda k: (votes[k] / (first + step * out[k]), votes[k]))
        out[k] += 1
    return out


def _features(world: World, did: str, e: dict, gdp_mean: float) -> dict[str, float]:
    d = world.divisions[did]
    parent = world.divisions.get(d.get("parent", ""), {})
    traits = {**parent.get("traits", {}), **d.get("traits", {})}
    f: dict[str, float] = {}
    for w, k in zip((1.0, 0.6, 0.4, 0.3), traits.get("industries", [])):
        f[k] = f.get(k, 0) + w
    dm = e.get("demographics", {})
    for lg, v in dm.get("languages", {}).items():
        f["lang:" + lg] = v / 100
    young, _, old = dm.get("age", (15, 66, 19))
    f["young"], f["old"] = young / 100, old / 100
    gdp = e.get("economy", {}).get("gdp_per_capita_usd", gdp_mean)
    f["income"] = math.log(max(gdp, 1) / gdp_mean)
    f["urban"] = math.log10(max(d["population"] / d["area_km2"], 0.1))
    f["lat"] = float(e["center"][1])
    f["city:" + d["parent"]] = 1.0
    if d.get("special_status"):
        f["status:" + d["special_status"]] = 1.0
    if parent.get("special_status"):
        f["status:" + parent["special_status"]] = 1.0
    return f


def _shares(lean: dict[str, dict[str, float]], feats: dict[str, float], mean: dict[str, float],
            base: dict[str, float], noise: dict[str, float]) -> dict[str, float]:
    score = {p: math.log(base[p]) + noise[p] + sum(c * (feats.get(k, 0) - mean.get(k, 0)) for k, c in lean[p].items())
             for p in base}
    top = max(score.values())
    ex = {p: math.exp(s - top) for p, s in score.items()}
    total = sum(ex.values())
    return {p: v / total for p, v in ex.items()}


class _Territory:
    """One territory's districts, their vote shares and turnout in the territorial election."""

    def __init__(self, world: World, entities: dict, tid: str, model: dict):
        self.tid, self.world, self.model = tid, world, model
        leg = model["legislatures"][tid]
        self.leg = leg
        self.parties = {p["id"]: p for p in model["parties"] if tid in p["targets"]}
        self.lean = {pid: p.get("lean", {}) for pid, p in self.parties.items()}
        self.districts = [did for did, d in world.divisions.items() if d["subtype"] == "borough" and tid in world.ancestors(did)]
        pops = {did: world.divisions[did]["population"] for did in self.districts}
        gdp_mean = sum(entities[d].get("economy", {}).get("gdp_per_capita_usd", 0) * pops[d] for d in self.districts) / sum(pops.values())
        self.feats = {did: _features(world, did, entities[did], gdp_mean) for did in self.districts}
        keys = {k for f in self.feats.values() for k in f}
        self.mean = {k: sum(self.feats[d].get(k, 0) * pops[d] for d in self.districts) / sum(pops.values()) for k in keys}
        amp = model["perturbation"]
        self.noise = {did: {p: float(_rng(did + p).uniform(-1, 1)) * amp["vote"] for p in self.parties} for did in self.districts}
        t0 = leg["turnout"]
        self.turnout = {}
        for did in self.districts:
            f = self.feats[did]
            t = (t0 + 0.6 * (f["old"] - self.mean["old"]) + 0.03 * f["income"] + float(_rng("turnout" + did).uniform(-1, 1)) * amp["turnout"]
                 + leg.get("turnout_status", {}).get(next((k[7:] for k in f if k.startswith("status:")), ""), 0))
            self.turnout[did] = float(np.clip(t, 0.35, 0.97))
        self.voters = {did: pops[did] * model["electorate_share"] * self.turnout[did] for did in self.districts}
        # the targets are the territory's result: scale each party's base until the districts add up to them
        target = {p: self.parties[p]["targets"][tid] for p in self.parties}
        tsum = sum(target.values())
        target = {p: v / tsum for p, v in target.items()}
        base = dict(target)
        for _ in range(40):
            got = self._total(base)
            base = {p: base[p] * (target[p] / got[p]) ** 0.9 for p in base}
        self.base = base
        self.vote = {did: _shares(self.lean, self.feats[did], self.mean, base, self.noise[did]) for did in self.districts}

    def _total(self, base: dict[str, float]) -> dict[str, float]:
        tot = {p: 0.0 for p in base}
        for did in self.districts:
            s = _shares(self.lean, self.feats[did], self.mean, base, self.noise[did])
            for p, v in s.items():
                tot[p] += v * self.voters[did]
        total = sum(tot.values())
        return {p: v / total for p, v in tot.items()}

    def votes(self, dids: list[str], roll: str | None = None) -> dict[str, float]:
        """Votes cast for each party across these districts; with roll, only by speakers of that language,
        whose votes lean further by each party's `roll` term."""
        tot = {p: 0.0 for p in self.parties}
        for did in dids:
            share = self.vote[did]
            n = self.voters[did]
            if roll:
                n *= self.feats[did].get("lang:" + roll, 0)
                lean = {p: math.exp(self.parties[p].get("roll", 0)) for p in self.parties}
                z = sum(share[p] * lean[p] for p in share)
                share = {p: share[p] * lean[p] / z for p in share}
            for p, v in share.items():
                tot[p] += v * n
        return tot

    def wards(self, dids: list[str], seats: int, key: str) -> dict[str, int]:
        """First-past-the-post wards: `seats` shared out among the districts by population, each ward's vote
        its district's leaned a little either way; seats won by each party."""
        per = _hamilton({d: self.world.divisions[d]["population"] for d in dids}, seats, minimum=0)
        won = {p: 0 for p in self.parties}
        amp = self.model["perturbation"]["ward"]
        for did in dids:
            for w in range(per[did]):
                rng = _rng(f"{key}:{did}:{w}")
                if per[did] == 1:
                    s = self.vote[did]
                else:
                    s = {p: v * math.exp(float(rng.uniform(-1, 1)) * amp) for p, v in self.vote[did].items()}
                won[max(s, key=s.get)] += 1
        return won

    def seat(self, dids: list[str], seats: int, system: str, key: str) -> tuple[dict[str, int], dict[str, float], dict]:
        """Seats won by each party in a legislature elected by these districts, the votes behind them, and
        notes on the count (constituency and list seats, reserved seats)."""
        leg = self.leg
        votes = self.votes(dids)
        total = sum(votes.values())
        share = {p: v / total for p, v in votes.items()}
        extra: dict = {}
        if system == "mmp":
            const = self.wards(dids, len(dids) if key == self.tid else max(1, round(seats / 2)), key)
            ok = {p: votes[p] for p in votes if share[p] >= leg["threshold"] or const[p] > 0}
            prop = _divisor(ok, seats, 1, 2)
            won = {p: max(prop.get(p, 0), const[p]) for p in votes}
            extra = {"constituency": {p: n for p, n in const.items() if n}, "overhang": sum(won.values()) - seats}
        elif system == "fptp":
            won = self.wards(dids, seats, key)
        elif system == "pr_reserved":
            lang = leg["reserved_language"]
            speakers = sum(self.feats[d].get("lang:" + lang, 0) * self.world.divisions[d]["population"] for d in dids)
            pop = sum(self.world.divisions[d]["population"] for d in dids)
            reserved = leg["reserved"] if key == self.tid else (round(seats * speakers / pop * leg["reserved_city_share"]) if speakers / pop >= 0.1 else 0)
            ok = {p: votes[p] for p in votes if share[p] >= leg["threshold"]}
            won = {p: 0 for p in votes}
            for p, n in _divisor(ok, seats - reserved, 1, 1).items():
                won[p] += n
            if reserved:
                roll = self.votes(dids, roll=lang)
                for p, n in _divisor(roll, reserved, 1, 2).items():
                    won[p] += n
                extra = {"reserved": reserved, "reserved_won": {p: n for p, n in _divisor(roll, reserved, 1, 2).items() if n}}
        elif system == "pr_regional":
            if key == self.tid:
                cities = {}
                for d in dids:
                    cities.setdefault(self.world.divisions[d]["parent"], []).append(d)
                per = _hamilton({c: sum(self.world.divisions[d]["population"] for d in ds) for c, ds in cities.items()}, seats, minimum=2)
                won = {p: 0 for p in votes}
                for c, ds in cities.items():
                    for p, n in _hamilton(self.votes(ds), per[c]).items():
                        won[p] += n
                extra = {"constituencies": len(cities)}
            else:
                won = _hamilton(votes, seats)
        else:
            raise ValueError(f"{self.tid}: unknown electoral system {system}")
        return won, share, extra


def _coalition(won: dict[str, int], share: dict[str, float], parties: dict[str, dict], cost: dict) -> list[str]:
    """The government, largest party first: of the winning coalitions with no member to spare, the one
    with the least cost: its left-right span, plus a cost for each partner beyond the first and another
    if the largest party is left out."""
    seated = [p for p in won if won[p]]
    need = sum(won.values()) // 2 + 1
    largest = max(seated, key=lambda p: (won[p], share[p]))
    best = None
    for mask in range(1, 1 << len(seated)):
        group = [p for k, p in enumerate(seated) if mask >> k & 1]
        if len(group) > 5:
            continue
        seats = sum(won[p] for p in group)
        if seats < need or any(seats - won[p] >= need for p in group):
            continue
        spec = [parties[p]["spectrum"] for p in group]
        score = max(spec) - min(spec) + cost["partner"] * (len(group) - 1) + (0 if largest in group else cost["without_largest"])
        rank = (round(score, 6), -seats)
        if best is None or rank < best[0]:
            best = (rank, group)
    group = best[1] if best else [largest]
    return sorted(group, key=lambda p: (-won[p], -share[p]))


def _person(rng: np.random.Generator, pools: dict, lang: str, taken: set[str]) -> dict:
    """A name from the language's pools that no one else has yet."""
    pool = pools[lang]
    while True:
        given, family = pool["given"][int(rng.integers(len(pool["given"])))], pool["family"][int(rng.integers(len(pool["family"])))]
        name = ({"zh": family[0] + given[0], "en": f"{family[1]} {given[1]}"} if lang == "zh"
                else {"zh": f"{given[1]}·{family[1]}", "en": f"{given[0]} {family[0]}"})
        if name["en"] not in taken:
            taken.add(name["en"])
            return name


def _chamber(won: dict[str, int], share: dict[str, float], extra: dict, gov: list[str]) -> dict:
    parties = sorted((p for p in won if won[p] or share[p] >= 0.01), key=lambda p: (-won[p], -share[p]))
    return {
        "seats": sum(won.values()),
        "parties": [{"id": p, "seats": won[p], "vote": round(100 * share[p], 1)} for p in parties],
        "government": gov,
        **({"constituency": extra["constituency"]} if extra.get("constituency") else {}),
        **({"overhang": extra["overhang"]} if extra.get("overhang") else {}),
        **({"reserved": extra["reserved"], "reserved_won": extra["reserved_won"]} if extra.get("reserved") else {}),
    }


def annotate(world: World, entities: dict) -> None:
    """Add elections to territories, cities and districts, and an entity for every party."""
    model = world.politics
    if not model:
        return
    parties = {p["id"]: p for p in model["parties"]}
    seats_held: dict[str, list[dict]] = {pid: [] for pid in parties}
    taken = {p["leader"]["en"] for p in parties.values()}
    for tid, leg in model["legislatures"].items():
        terr = _Territory(world, entities, tid, model)
        won, share, extra = terr.seat(terr.districts, leg["seats"], leg["system"], tid)
        gov = _coalition(won, share, parties, model["coalition_cost"])
        head = parties[gov[0]].get("leaders", {}).get(tid, parties[gov[0]]["leader"])
        t_turnout = sum(terr.voters.values()) / sum(world.divisions[d]["population"] * model["electorate_share"] for d in terr.districts)
        entities[tid]["legislature"] = {
            "names": leg["names"], "system": leg["system"], "turnout": round(100 * t_turnout, 1),
            **({"threshold": leg["threshold"]} if "threshold" in leg else {}),
            "head": {"title": leg["head"], "name": head, "party": gov[0]},
            **_chamber(won, share, extra, gov),
        }
        for p, n in won.items():
            if n:
                seats_held[p].append({"at": tid, "seats": n, "of": sum(won.values())})
        for did in terr.districts:
            vote = terr.vote[did]
            top = sorted(vote, key=vote.get, reverse=True)
            entities[did]["election"] = {
                "turnout": round(100 * terr.turnout[did], 1),
                "vote": [{"id": p, "vote": round(100 * vote[p], 1)} for p in top if vote[p] >= 0.02],
            }
        cities: dict[str, list[str]] = {}
        for d in terr.districts:
            cities.setdefault(world.divisions[d]["parent"], []).append(d)
        for cid, dids in cities.items():
            c = world.divisions[cid]
            override = leg.get("councils", {}).get(cid, {})
            if override.get("assembly"):
                entities[cid]["council"] = {"assembly": override["assembly"]}
                continue
            pop = c.get("population") or sum(world.divisions[d]["population"] for d in dids)
            seats = int(np.clip(round(leg["council_seats"][0] + leg["council_seats"][1] * math.log2(pop / 100_000)), *leg["council_range"]))
            seats += 1 - seats % 2
            cw, cs, cx = terr.seat(dids, seats, leg["system"], cid)
            cgov = _coalition(cw, cs, parties, model["coalition_cost"])
            langs = entities[cid].get("demographics", {}).get("languages", {"zh": 100})
            rng = _rng("mayor:" + cid)
            pool = [lg for lg in langs if lg in model["names"]]
            lang = pool[int(rng.choice(len(pool), p=np.array([langs[lg] for lg in pool]) / sum(langs[lg] for lg in pool)))]
            v = sum(terr.voters[d] for d in dids) / sum(world.divisions[d]["population"] * model["electorate_share"] for d in dids)
            entities[cid]["council"] = {
                "turnout": round(100 * v, 1),
                "head": {"title": leg["mayor"], "name": _person(rng, model["names"], lang, taken), "party": cgov[0]},
                **_chamber(cw, cs, cx, cgov),
            }
            for p, n in cw.items():
                if n:
                    seats_held[p].append({"at": cid, "seats": n, "of": sum(cw.values())})
    for pid, p in parties.items():
        entities[pid] = {
            "id": pid, "kind": "party", "subtype": "party", "status": "generated",
            **{k: p[k] for k in ("names", "short_names", "color", "flag", "flag_notes", "spectrum", "family", "leader", "leader_title", "members",
                                 "youth_wing", "slogan", "policies", "allies", "notes", "history") if k in p},
            "territories": [t for t in model["legislatures"] if t in p["targets"]],
            "seats": seats_held[pid],
        }
