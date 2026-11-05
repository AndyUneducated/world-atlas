"""Elections on the territory, city and district cards, from world/politics.yaml: each district's vote in
the territorial election, from the parties' target shares in the territory leaned by the district's
industries, languages, ages, income and density; the territorial legislature and every city council,
seated by their territory's electoral system; the government each forms, its cabinet, and the
officeholders (governor, premier, speaker, leader of the opposition, chief justice, mayors and council
speakers). Parties become entities of their own, with who their voters are. Runs after
economy.annotate, on the whole world's entities."""
from __future__ import annotations

import hashlib
import math

import numpy as np

from .world import World

LANG_KEYS = ("zh", "art-x-viking", "art-x-buckham", "en", "art-x-tavrunaq", "art-x-ivuran", "es", "art-x-ranova", "art-x-kasiri")


SPLIT = 0.3  # a party with this share of a top-two race's vote stands two candidates
RUNOFF_NOISE = 0.04  # the general election's own swing, at most, either way (log share)


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
        self.parties = {p["id"]: p for p in model["parties"] if tid in p.get("targets", {})}
        self.lean = {pid: p.get("lean", {}) for pid, p in self.parties.items()}
        self.districts = [did for did, d in world.divisions.items() if d["subtype"] == "borough" and tid in world.ancestors(did)]
        self.centers = {did: entities[did]["center"] for did in self.districts}
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
                if per[did] == 1:
                    s = self.vote[did]
                else:
                    s = {p: v * math.exp(float(_rng(f"{key}:{did}:{w}:{p}").uniform(-1, 1)) * amp) for p, v in self.vote[did].items()}
                won[max(s, key=s.get)] += 1
        return won

    def runoff(self, share: dict[str, float], key: str) -> tuple[tuple[str, float], tuple[str, float]]:
        """A top-two race: every party stands a candidate, a party with SPLIT of the vote or more stands two
        who share it; the two leading candidates go on to the general election, where the other candidates'
        voters go to whichever finalist is nearer them on the spectrum (half each between two of one party).
        The winner and the runner-up, each with their party and share of the general election."""
        cands = []
        for p, v in share.items():
            if v >= SPLIT:
                f = float(_rng(f"{key}:split:{p}").uniform(0.5, 0.7))
                cands += [(p, v * f), (p, v * (1 - f))]
            elif v > 0:
                cands.append((p, v))
        cands.sort(key=lambda c: -c[1])
        (a, va), (b, vb) = cands[0], cands[1] if len(cands) > 1 else (cands[0][0], 0.0)
        spec = {p: self.parties[p]["spectrum"] for p in share}
        for p, v in cands[2:]:
            wa, wb = math.exp(-abs(spec[p] - spec[a])), math.exp(-abs(spec[p] - spec[b]))
            va, vb = va + v * wa / (wa + wb), vb + v * wb / (wa + wb)
        va *= math.exp(float(_rng(key + ":general").uniform(-1, 1)) * RUNOFF_NOISE)
        top = sorted(((a, va), (b, vb)), key=lambda c: -c[1])
        return (top[0][0], top[0][1] / (va + vb)), (top[1][0], top[1][1] / (va + vb))

    def top_two(self, dids: list[str], seats: int, key: str) -> tuple[dict[str, int], int]:
        """Single-member seats shared out among the districts by population, each elected by a top-two race on
        its district's vote leaned a little either way. A district too small for a seat votes with the
        nearest one that has seats (in its own city if it can); seats won by each party, and how many
        general elections were between two candidates of one party."""
        per = _hamilton({d: self.world.divisions[d]["population"] for d in dids}, seats, minimum=0)
        hosts = [d for d in dids if per[d]]
        voters = {d: [d] for d in hosts}
        for d in dids:
            if not per[d]:
                near = [h for h in hosts if self.world.divisions[h]["parent"] == self.world.divisions[d]["parent"]] or hosts
                voters[min(near, key=lambda h: math.dist(self.centers[h], self.centers[d]))].append(d)
        won = {p: 0 for p in self.parties}
        amp = self.model["perturbation"]["ward"]
        same = 0
        for did in hosts:
            n = sum(self.voters[d] for d in voters[did])
            vote = {p: sum(self.vote[d][p] * self.voters[d] for d in voters[did]) / n for p in self.parties}
            for w in range(per[did]):
                s = {p: v * math.exp(float(_rng(f"{key}:{did}:{w}:{p}").uniform(-1, 1)) * amp) for p, v in vote.items()}
                z = sum(s.values())
                (a, _), (b, _) = self.runoff({p: v / z for p, v in s.items()}, f"{key}:{did}:{w}")
                won[a] += 1
                same += a == b
        return won, same

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
                groups: dict[str, list[str]] = {}
                for d in dids:
                    groups.setdefault(self.world.divisions[d]["parent"], []).append(d)
            else:
                groups = leg.get("councils", {}).get(key, {}).get("constituencies") or {key: dids}
            per = _hamilton({g: sum(self.world.divisions[d]["population"] for d in ds) for g, ds in groups.items()}, seats, minimum=2)
            won = {p: 0 for p in votes}
            for g, ds in groups.items():
                for p, n in _hamilton(self.votes(ds), per[g]).items():
                    won[p] += n
            extra = {"constituencies": len(groups)}
        elif system == "top_two":
            won, same = self.top_two(dids, seats, key)
            extra = {"same_party": same}
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
        **({"same_party": extra["same_party"]} if "same_party" in extra else {}),
    }


def _lang(rng: np.random.Generator, langs: dict[str, float], pools: dict) -> str:
    """One of the place's first languages that has a name pool, drawn by its share."""
    pool = [lg for lg in langs if lg in pools] or ["zh"]
    weights = np.array([langs.get(lg, 1) for lg in pool], dtype=float)
    return pool[int(rng.choice(len(pool), p=weights / weights.sum()))]


LANG_NAMES = {
    "zh": ("中文", "Chinese"), "art-x-viking": ("维京语", "Viking"), "art-x-buckham": ("巴克汉姆语", "Buckham"),
    "en": ("英语", "English"), "art-x-tavrunaq": ("塔夫鲁纳克语", "Tavrunaq"), "art-x-ivuran": ("伊武兰语", "Ivuran"),
    "es": ("西班牙语", "Spanish"), "art-x-ranova": ("拉诺瓦语", "Ranovan"), "art-x-kasiri": ("卡西里语", "Kasiri"),
}
# features read the same both ways: a negative lean is a lean towards the other pole
BIPOLAR = {
    "urban": ({"zh": "城市选民", "en": "City dwellers"}, {"zh": "乡村选民", "en": "Rural voters"}),
    "income": ({"zh": "高收入者", "en": "Higher earners"}, {"zh": "低收入者", "en": "Lower earners"}),
    "lat": ({"zh": "北部选民", "en": "The north"}, {"zh": "南部选民", "en": "The south"}),
}
BASE_MIN = 0.05  # log-odds a party gains or loses across one spread of the feature, to be named


def _base_label(world: World, entities: dict, key: str) -> dict:
    if key == "young":
        return {"zh": "年轻选民", "en": "Young voters"}
    if key == "old":
        return {"zh": "年长选民", "en": "Older voters"}
    if key.startswith("lang:"):
        zh, en = LANG_NAMES[key[5:]]
        return {"zh": f"{zh}母语者", "en": f"{en} speakers"}
    if key.startswith("status:"):
        return {"zh": "公社居民", "en": "Commune residents"} if key == "status:commune" else {"zh": key[7:], "en": key[7:]}
    if key.startswith("city:"):
        n = entities[key[5:]]["names"]
        return {"zh": f"{n['zh']}的选民", "en": f"Voters in {n['en']}"}
    ind = world.economy.get("industries", {}).get(key, {"zh": key, "en": key})
    return {"zh": f"{ind['zh']}地区", "en": f"{ind['en']} areas"}


def _base(world: World, entities: dict, effect: dict[str, float]) -> dict:
    """Who a party's voters are: the features that lean its vote most, each its lean times the feature's
    spread among the districts (strongest first), and the groups where it does worst."""
    strong, weak = [], []
    for k, v in sorted(effect.items(), key=lambda kv: -abs(kv[1])):
        if abs(v) < BASE_MIN:
            continue
        if k in BIPOLAR:
            strong.append(BIPOLAR[k][0 if v > 0 else 1])
            weak.append(BIPOLAR[k][1 if v > 0 else 0])
        elif v > 0:
            strong.append(_base_label(world, entities, k))
        else:
            weak.append(_base_label(world, entities, k))
    return {"strong": strong[:5], "weak": weak[:3]}


class _People:
    """Officeholders' names, drawn once each and never twice."""

    def __init__(self, model: dict, entities: dict):
        self.model, self.entities = model, entities
        self.pools = model["names"]
        self.local = model.get("local_names", {})
        self.taken = {p["leader"]["en"] for p in model["parties"]} | {leg["governor_name"]["en"] for leg in model["legislatures"].values() if "governor_name" in leg}
        self.memo: dict[str, dict] = {}

    def draw(self, key: str, langs: dict[str, float], avoid: set[str] | None = None, where: str = "") -> dict:
        """With `avoid`, redraw (a few times at most) a name whose given name is in it, and add the one kept.
        A territory's local_names (where) add to the pools there and nowhere else."""
        if key not in self.memo:
            pools = self.pools | self.local.get(where, {})
            for i in range(AVOID_TRIES if avoid is not None else 1):
                rng = _rng(key if i == 0 else f"{key}~{i}")
                name = _person(rng, pools, _lang(rng, langs, pools), self.taken)
                if avoid is None or _given(name) not in avoid or i == AVOID_TRIES - 1:
                    break
                self.taken.discard(name["en"])
            self.memo[key] = name
            if avoid is not None:
                avoid.add(_given(name))
        return self.memo[key]

    def leader(self, p: dict, tid: str) -> dict:
        """The party's leader in a territory: its leader at home, where it is strongest; elsewhere the head
        of its territorial branch."""
        if tid in p.get("leaders", {}):
            return p["leaders"][tid]
        if tid == max(p["targets"], key=p["targets"].get):
            return p["leader"]
        return self.draw(f"leader:{p['id']}:{tid}", self.entities[tid].get("demographics", {}).get("languages", {"zh": 100}), where=tid)


MAX_EXPERTS = 4  # non-partisan ministers in one cabinet
AVOID_TRIES = 20
TREND_ELECTIONS = 2  # earlier elections on a party's card
TREND_SWING = 0.12  # at most about this, as a log share, between one election and the one before


def _trend(tid: str, share: dict[str, float]) -> dict[str, list[float]]:
    """Each party's vote at the earlier elections and this one, oldest first: each election before swings
    every party's share by a draw, the shares scaled back to the same total."""
    rng, past, total = _rng("trend:" + tid), [share], sum(share.values())
    for _ in range(TREND_ELECTIONS):
        prev = {p: v * math.exp(float(np.clip(rng.normal(0, TREND_SWING / 2), -TREND_SWING, TREND_SWING))) for p, v in past[-1].items()}
        scale = total / sum(prev.values())
        past.append({p: v * scale for p, v in prev.items()})
    return {p: [round(100 * x[p], 1) for x in reversed(past)] for p in share}


def _standing(world: World, entities: dict, pid: str, p: dict, home: str) -> str:
    """Where the party stands at home: it leads the government, sits in it, opposes it, or has no seats.
    A party of a fixed chamber leads if it is the largest group, unless it says otherwise."""
    if seated := p.get("seated"):
        groups = world.divisions[seated]["nation"]["legislature"]["groups"]
        return p.get("standing") or ("lead" if max(groups, key=lambda g: g["seats"]).get("party") == pid else "opposition")
    L = entities[home]["legislature"]
    if L["head"].get("party") == pid:
        return "lead"
    if pid in L["government"]:
        return "coalition"
    return "opposition" if any(x["id"] == pid and x["seats"] for x in L["parties"]) else "extra"


def _given(name: dict) -> str:
    """The given name, in Chinese: a Chinese name's after its one-character surname, a transcribed one's before the dot."""
    return name["zh"].split("·")[0] if "·" in name["zh"] else name["zh"][1:]


def _cabinet(model: dict, tid: str, won: dict[str, int], gov: list[str], parties: dict) -> dict[str, str | None]:
    """Who holds each ministry: a non-partisan expert by the ministry's odds (the likeliest first, and never
    so many that a governing party goes without), the rest picked in D'Hondt order on the governing parties'
    seats. Each party takes the free ministry it wants most: its score (prestige, and the ministry's lean on
    the party's axes) plus how far that is above the keenest partner's, so a junior partner still gets its
    own field."""
    mins = model["ministries"]
    rng = _rng("cabinet:" + tid)
    experts = sorted((m for m in mins if rng.random() < m.get("nonpartisan", 0)), key=lambda m: -m["nonpartisan"])[:MAX_EXPERTS]
    while True:
        out = {p: 0 for p in gov}
        picks = []
        for _ in range(len(mins) - len(experts)):
            p = max(gov, key=lambda k: (won[k] / (1 + out[k]), won[k]))
            out[p] += 1
            picks.append(p)
        if all(out.values()) or not experts:
            break
        experts.pop()
    holder: dict[str, str | None] = {m["id"]: None for m in experts}
    free = [m for m in mins if m["id"] not in holder]

    def score(m: dict, p: str) -> float:
        return m.get("prestige", 0) + sum(c * (parties[p]["axes"][k] - 5) / 5 for k, c in m.get("lean", {}).items())

    def want(m: dict, p: str) -> float:
        rivals = [score(m, q) for q in gov if q != p]
        return score(m, p) + (score(m, p) - max(rivals) if rivals else 0)

    for p in picks:
        best = max(free, key=lambda m: want(m, p))
        holder[best["id"]] = p
        free.remove(best)
    return holder


def _judges(people: "_People", tid: str, court: dict, langs: dict[str, float], avoid: set[str]) -> list[dict]:
    """The court's other judges besides the chief justice; `tongues` sets how many at least speak a language."""
    fixed = [lg for lg, n in court.get("tongues", {}).items() for _ in range(n)]
    return [people.draw(f"judge:{tid}:{i}", {fixed[i]: 100} if i < len(fixed) else langs, avoid, tid) for i in range(court["judges"] - 1)]


def _appoint(model: dict, entities: dict, people: "_People", holders: dict[str, dict], parties: dict) -> None:
    """Ministers and judges, named after every other officeholder so that adding them renames no one, and
    with given names unlike those of their territory's other officeholders where the pools allow. A junior
    partner's leader takes the ministry the party picked first."""
    for tid, holder in holders.items():
        L = entities[tid]["legislature"]
        langs = entities[tid].get("demographics", {}).get("languages", {"zh": 100})
        firsts: dict[str, dict] = {}
        for mid, p in holder.items():
            if p and p != L["head"]["party"] and p not in firsts.values():
                firsts[mid] = p
        named = {mid: people.leader(parties[p], tid) for mid, p in firsts.items()}
        avoid = {_given(o["name"]) for o in (L["head"], L["speaker"], L["court"], L.get("opposition"), L.get("upper", {}).get("speaker")) if o} \
            | {_given(n) for n in named.values()}
        rename = model["legislatures"][tid].get("ministries", {})
        L["ministers"] = [{"id": m["id"], "ministry": rename.get(m["id"], m["names"]),
                           "name": named.get(m["id"]) or people.draw(f"minister:{tid}:{m['id']}", langs, avoid, tid),
                           **({"party": holder[m["id"]]} if holder[m["id"]] else {})} for m in model["ministries"]]
        L["court"]["judges"] = _judges(people, tid, model["legislatures"][tid]["court"], langs, avoid)


def _offices(world: World, model: dict, entities: dict, people: "_People") -> None:
    """Deputies, independent bodies and the governments of nations without an elected parliament, named
    last of all so that adding them renames no one. A coalition's junior partner holds the deputy's post."""
    for tid, leg in model["legislatures"].items():
        L = entities[tid]["legislature"]
        langs = entities[tid].get("demographics", {}).get("languages", {"zh": 100})
        avoid = {_given(o["name"]) for o in (L["head"], L["speaker"], L["court"], *L["ministers"])}
        if "deputy" in leg:
            party = L["head"]["party"] if L.get("elected") or len(L["government"]) < 2 else L["government"][1]
            L["deputy"] = {"title": leg["deputy"], "name": people.draw("deputy:" + tid, langs, avoid, tid), "party": party}
        if "agencies" in leg:
            L["agencies"] = [{"names": a["names"], "title": a["title"], "name": people.draw(f"agency:{tid}:{i}", langs, avoid, tid)}
                             for i, a in enumerate(leg["agencies"])]
        if "deputy_mayor" in leg:
            for cid, c in world.divisions.items():
                if c.get("parent") == tid and (council := entities[cid].get("council")):
                    clangs = entities[cid].get("demographics", {}).get("languages", {"zh": 100})
                    title = leg.get("councils", {}).get(cid, {}).get("deputy_mayor", leg["deputy_mayor"])
                    council["deputy"] = {"title": title, "name": people.draw("deputy-mayor:" + cid, clangs, where=tid),
                                         "party": council["head"]["party"]}
    for nid, d in world.divisions.items():
        n = d.get("nation")
        if not n or nid in model["legislatures"]:
            continue
        langs = entities[nid].get("demographics", {}).get("languages", {"zh": 100})
        avoid = {_given(n["head"]["name"])}
        ex, ju = n.get("executive", {}), n.get("judiciary", {})
        entities[nid]["government"] = {
            "executive": {"none": ex["none"]} if "none" in ex else {
                "names": ex["names"], **({"notes": ex["notes"]} if "notes" in ex else {}),
                **{k: {"title": ex[k]["title"], "name": ex[k].get("name") or people.draw(f"{k}:{nid}", langs, avoid, nid)} for k in ("head", "deputy") if k in ex},
                "ministers": [{"ministry": m, "name": people.draw(f"minister:{nid}:{i}", langs, avoid, nid)} for i, m in enumerate(ex.get("ministries", []))],
            },
            "judiciary": {"none": ju["none"]} if "none" in ju else {
                "names": ju["names"], "title": ju["title"], "law": ju["law"], **({"notes": ju["notes"]} if "notes" in ju else {}),
                "name": people.draw("justice:" + nid, langs, avoid, nid),
                "judges": [people.draw(f"judge:{nid}:{i}", langs, avoid, nid) for i in range(ju["judges"] - 1)],
            },
        }


def annotate(world: World, entities: dict) -> None:
    """Add elections and officeholders to territories, cities and districts, and an entity for every party."""
    model = world.politics
    if not model:
        return
    parties = {p["id"]: p for p in model["parties"]}
    seats_held: dict[str, list[dict]] = {pid: [] for pid in parties}
    people = _People(model, entities)
    holders: dict[str, dict] = {}
    effect: dict[str, dict[str, float]] = {pid: {} for pid in parties}
    weight: dict[str, float] = {pid: 0.0 for pid in parties}
    trends: dict[str, dict[str, list[float]]] = {}
    for tid, leg in model["legislatures"].items():
        terr = _Territory(world, entities, tid, model)
        won, share, extra = terr.seat(terr.districts, leg["seats"], leg["system"], tid)
        trends[tid] = _trend(tid, share)
        gov = _coalition(won, share, parties, model["coalition_cost"])
        langs = entities[tid].get("demographics", {}).get("languages", {"zh": 100})
        t_turnout = sum(terr.voters.values()) / sum(world.divisions[d]["population"] * model["electorate_share"] for d in terr.districts)
        opposition = next((p for p in sorted(won, key=lambda p: (-won[p], -share[p])) if won[p] and p not in gov), None)
        elected = leg.get("executive") == "elected"
        if elected:
            (gp, gv), (rp, rv) = terr.runoff(share, tid + ":governor")
            runner = people.leader(parties[rp], tid) if rp != gp else people.draw("candidate:" + tid, langs, where=tid)
            head = {"title": leg["governor"], "name": people.leader(parties[gp], tid), "party": gp, "vote": round(100 * gv, 1),
                    "runner_up": {"name": runner, "party": rp, "vote": round(100 * rv, 1)}}
        else:
            gp, head = gov[0], {"title": leg["premier"], "name": people.leader(parties[gov[0]], tid), "party": gov[0]}
        holder = holders[tid] = _cabinet(model, tid, won, [gp] if elected else gov, parties)
        entities[tid]["legislature"] = {
            "names": leg["names"], "system": leg["system"], "turnout": round(100 * t_turnout, 1),
            **({"threshold": leg["threshold"]} if "threshold" in leg else {}),
            **({"elected": True} if elected else {}),
            **({"notes": leg["notes"]} if "notes" in leg else {}),
            **({"system_notes": leg["system_notes"]} if "system_notes" in leg else {}),
            "head": head,
            **({} if elected or "governor_name" not in leg else {"governor": {"title": leg["governor"], "name": leg["governor_name"],
                                                **({"note": leg["governor_note"]} if "governor_note" in leg else {})}}),
            "speaker": {"title": leg["speaker"], "name": people.draw("speaker:" + tid, langs, where=tid), "party": gov[0]},
            **({"opposition": {"name": people.leader(parties[opposition], tid), "party": opposition,
                               **({"title": leg["minority"]} if elected else {})}} if opposition else {}),
            "cabinet": [{"id": p, "seats": n} for p in ([gp] if elected else gov) if (n := sum(h == p for h in holder.values()))],
            "ministers": [],
            "court": {"names": leg["court"]["names"], "title": leg["court"]["title"], "name": people.draw("justice:" + tid, langs, where=tid), "judges": [],
                      **({"law": leg["court"]["law"]} if "law" in leg["court"] else {})},
            **_chamber(won, share, extra, gov),
        }
        if up := leg.get("upper"):
            uw, us, ux = terr.seat(terr.districts, up["seats"], leg["system"], tid + ":upper")
            ugov = _coalition(uw, us, parties, model["coalition_cost"])
            entities[tid]["legislature"]["upper"] = {
                "names": up["names"],
                "speaker": {"title": up["speaker"], "name": people.draw("upper-speaker:" + tid, langs, where=tid), "party": ugov[0]},
                **_chamber(uw, us, ux, ugov),
            }
            for p, n in uw.items():
                if n:
                    seats_held[p].append({"at": tid, "seats": n, "of": up["seats"], "upper": True})
        for p, n in won.items():
            if n:
                seats_held[p].append({"at": tid, "seats": n, "of": sum(won.values())})
        pops = {d: world.divisions[d]["population"] for d in terr.districts}
        total_pop = sum(pops.values())
        votes = terr.votes(terr.districts)
        for pid in terr.parties:
            for k, c in terr.lean[pid].items():
                spread = math.sqrt(sum(pops[d] * (terr.feats[d].get(k, 0) - terr.mean.get(k, 0)) ** 2 for d in terr.districts) / total_pop)
                effect[pid][k] = effect[pid].get(k, 0) + c * spread * votes[pid]
            weight[pid] += votes[pid]
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
            if cid == tid:  # a nation's cities sit in its parliament and elect no councils
                continue
            c = world.divisions[cid]
            override = leg.get("councils", {}).get(cid, {})
            kind = model["council_types"][override.get("type", "council")]
            pop = c.get("population") or sum(world.divisions[d]["population"] for d in dids)
            seats = override.get("seats") or int(np.clip(round(leg["council_seats"][0] + leg["council_seats"][1] * math.log2(pop / 100_000)), *leg["council_range"]))
            seats += 1 - seats % 2
            cw, cs, cx = terr.seat(dids, seats, leg["system"], cid)
            cgov = _coalition(cw, cs, parties, model["coalition_cost"])
            if (lead := override.get("lead")) in cgov:
                cgov = [lead] + [p for p in cgov if p != lead]
            clangs = entities[cid].get("demographics", {}).get("languages", {"zh": 100})
            v = sum(terr.voters[d] for d in dids) / sum(world.divisions[d]["population"] * model["electorate_share"] for d in dids)
            mayor = {"title": override.get("mayor", leg["mayor"]), "name": people.draw("mayor:" + cid, clangs, where=tid), "party": cgov[0]}
            if elected:
                (mp, mv), (rp, rv) = terr.runoff(cs, cid + ":mayor")
                mayor |= {"party": mp, "vote": round(100 * mv, 1), "runner_up": {"party": rp, "vote": round(100 * rv, 1)}}
            entities[cid]["council"] = {
                "names": override.get("names", kind["names"]),
                **({"notes": override["notes"]} if "notes" in override else {}),
                **({"elected": True} if elected else {}),
                "turnout": round(100 * v, 1),
                "head": mayor,
                "speaker": {"title": override.get("speaker", kind["speaker"]), "name": people.draw("council-speaker:" + cid, clangs, where=tid), "party": cgov[0]},
                **_chamber(cw, cs, cx, cgov),
            }
            for p, n in cw.items():
                if n:
                    seats_held[p].append({"at": cid, "seats": n, "of": sum(cw.values())})
    for pid, p in parties.items():
        if seated := p.get("seated"):
            leg = world.divisions[seated]["nation"]["legislature"]
            seats_held[pid] += [{"at": seated, "seats": g["seats"], "of": leg["seats"]} for g in leg["groups"] if g.get("party") == pid]
        home = seated or max(p["targets"], key=p["targets"].get)
        hq = p.get("hq") or world.divisions[home].get("capital")
        entities[pid] = {
            "id": pid, "kind": "party", "subtype": "party", "status": "generated",
            **{k: p[k] for k in ("names", "short_names", "color", "flag", "flag_notes", "spectrum", "family", "ideology", "axes", "leader",
                                 "leader_title", "members", "youth_wing", "slogan", "policies", "allies", "factions", "organisation", "notes",
                                 "history", "seated", "legal_status", "reunification", "backers") if k in p},
            "home": home,
            "standing": _standing(world, entities, pid, p, home),
            **({"hq": hq} if hq else {}),
            **({"trend": trends[home][pid]} if pid in trends.get(home, {}) else {}),
            "secretary": p.get("secretary") or people.draw("secretary:" + pid, entities[home].get("demographics", {}).get("languages", {"zh": 100}), where=home),
            "branches": [] if seated else [{"at": t, "name": people.leader(p, t)} for t in model["legislatures"] if t in p["targets"]],
            "base": _base(world, entities, {k: v / weight[pid] for k, v in effect[pid].items()} if weight[pid] else {}),
            "territories": [seated] if seated else [t for t in model["legislatures"] if t in p["targets"]],
            "seats": seats_held[pid],
        }
    _appoint(model, entities, people, holders, parties)
    _offices(world, model, entities, people)
