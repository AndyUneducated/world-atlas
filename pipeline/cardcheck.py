"""Card text against the build (M143): `verify.py` runs these three on the merged entities.

- text records: 世界 / 领地 / 全岛 最长 / 最短 / 最快 claims in a route's text still hold
- route structures: the structure a route's text calls its longest is the one the build has, at the length it
  gives, and the number of river crossings it gives is the built one
- zh and en: the figures in a card's Chinese and English text are the same figures

The numbers the build gives are those of the Linux build that CI deploys (M141)."""
from __future__ import annotations

import re

STREETS = ("arterial_street", "collector_street")
ROADS = ("national_expressway", "territorial_expressway", "territorial_highway", "municipal_road")
RAILS = ("intercity_rail", "freight_rail")
TERRITORY_WORDS = ("领地", "全领地", "全岛", "岛上", "全州", "州内", "领地内")
HEDGES = ("之一", "仅次于", "第二", "曾是", "原是", "一度", "当时")


def _text(e: dict, lang: str) -> str:
    return "\n".join((e.get(k) or {}).get(lang, "") for k in ("notes", "background") if isinstance(e.get(k), dict))


def _clauses(t: str) -> list[str]:
    return [c for c in re.split(r"[。；\n]", t) if c.strip()]


def _wheeled(e: dict) -> bool:
    return e.get("network") in RAILS and not e.get("maglev") and (e.get("network") != "freight_rail" or e.get("conventional"))


def _undersea(s: dict) -> bool:
    return "海底" in s["names"]["zh"]


def _territory(e: dict) -> str:
    anc = e.get("ancestors") or []
    if not anc:
        return ""
    return anc[-2] if anc[-1].startswith("country:") and len(anc) > 1 else anc[-1]


def _structure(e: dict, kind: str, mountain: bool = False) -> float:
    s = (e.get("structures") or {}).get(kind)
    if not s or (mountain and _undersea(s)):
        return 0.0
    return s["km"]


def _length(e: dict) -> float:
    return (e.get("stats") or {}).get("length_km", 0.0)


def _speed(e: dict) -> float:
    return (e.get("tech") or {}).get("operating_speed_kmh", 0.0)


# record word -> (structure kind or None for the route itself, measure, who competes)
RECORDS = {
    "高速公路": (None, _length, lambda e: e.get("network") in ("national_expressway", "territorial_expressway")),
    "公路": (None, _length, lambda e: e.get("network") in ROADS),
    "铁路": (None, _length, lambda e: e.get("network") in RAILS),
    "轮轨铁路": (None, _length, _wheeled),
    "普通铁路": (None, _length, lambda e: e.get("network") == "intercity_rail" and e.get("conventional")),
    "地铁线": (None, _length, lambda e: e.get("network") == "metro"),
    "桥梁": ("bridge", None, lambda e: e.get("network") not in STREETS),
    "桥": ("bridge", None, lambda e: e.get("network") not in STREETS),
    "公路桥": ("bridge", None, lambda e: e.get("network") in ROADS),
    "铁路桥梁": ("bridge", None, lambda e: e.get("network") in RAILS),
    "铁路桥": ("bridge", None, lambda e: e.get("network") in RAILS),
    "轮轨铁路桥": ("bridge", None, _wheeled),
    "隧道": ("tunnel", None, lambda e: e.get("network") not in STREETS),
    "铁路隧道": ("tunnel", None, lambda e: e.get("network") in RAILS),
    "公路隧道": ("tunnel", None, lambda e: e.get("network") in ROADS),
    "山岭隧道": ("mountain", None, lambda e: e.get("network") not in STREETS),
    "公路山岭隧道": ("mountain", None, lambda e: e.get("network") in ROADS),
    "防雪棚": ("snow_shed", None, lambda e: e.get("network") not in STREETS),
    "铁路防雪棚": ("snow_shed", None, lambda e: e.get("network") in RAILS),
}


def _measure_of(kind, measure):
    if kind is None:
        return measure
    if kind == "mountain":
        return lambda e: _structure(e, "tunnel", mountain=True)
    return lambda e: _structure(e, kind)


def check_text_records(ents: dict) -> dict[str, list[str]]:
    """「世界最长的隧道」「领地最长的桥梁」「世界上最短的地铁线」 in a route's text: the route (or its structure of
    that kind) holds the record in the world, or in its own territory, in the build."""
    routes = [e for e in ents.values() if e.get("kind") == "route" and e.get("network") not in STREETS]
    bad = []
    pat = re.compile(r"(世界|" + "|".join(TERRITORY_WORDS) + r")(?:上)?最(长|短|快)的([一-鿿]{1,6}?)(?=[，。；、（\s]|$|之一|，|是|也)")
    for e in routes:
        for clause in _clauses(_text(e, "zh")):
            for m in pat.finditer(clause):
                if any(h in clause[max(0, m.start() - 12): m.end() + 4] for h in HEDGES):
                    continue
                word, extreme = m.group(3), m.group(2)
                if extreme == "快":
                    if word != "铁路":
                        continue
                    kind, measure, field = None, _speed, RECORDS["铁路"][2]
                elif word in RECORDS:
                    kind, measure, field = RECORDS[word]
                else:
                    continue
                if kind is not None and not ((e.get("structures") or {}).get("tunnel" if kind == "mountain" else kind)):
                    continue  # a structure this route does not have: the claim is about something else
                if not field(e):
                    continue
                fn = _measure_of(kind, measure)
                scope = [r for r in routes if field(r) and (m.group(1) == "世界" or _territory(r) == _territory(e))]
                values = [(fn(r), r) for r in scope if fn(r)]
                if not values or not fn(e):
                    continue
                best = (min if extreme == "短" else max)(values, key=lambda v: v[0])
                if best[1] is not e and best[0] != fn(e):
                    bad.append(f"{e['names']['zh']}: 「{m.group(0)}」 is {best[1]['names']['zh']} ({best[0]:g} against {fn(e):g})")
    return {"text records hold": bad}


STRUCT = re.compile(r"([一-鿿·—]{2,16}?(?:特大桥|高架桥|跨海大桥|大桥|隧道|防雪棚))")
GENERIC = re.compile(r"^(?:全线|全程|其中|最长的|最长|海底|公路|铁路|这座|这条|一条|两座|一座|整条|管道|线路|沿线)*(?:特大桥|高架桥|跨海大桥|大桥|桥|隧道|防雪棚)$")
NUM = r"(\d[\d,]*(?:\.\d+)?)"


def _kind(name: str) -> str:
    return "bridge" if "桥" in name else "tunnel" if "隧道" in name else "snow_shed"


def check_route_structures(ents: dict) -> dict[str, list[str]]:
    """A route's text names the longest bridge, tunnel or snow shed the build has, at its built length (5%), and
    gives the built number of river crossings."""
    bad = []
    for e in ents.values():
        if e.get("kind") != "route" or e.get("network") in STREETS:
            continue
        st, eng = e.get("structures") or {}, e.get("engineering") or {}
        for clause in _clauses(_text(e, "zh")):
            if "最长" in clause and not any(h in clause for h in HEDGES):
                for m in STRUCT.finditer(re.sub(r"[和与及、]", "，", clause)):
                    cand = re.split(r"[的经从在是以]", m.group(1))[-1]
                    built = st.get(_kind(cand))
                    if not built or built["names"]["zh"] in clause or GENERIC.match(cand) or re.search(r"公里|管道|并排|山岭隧道$|桥梁", cand):
                        continue
                    bad.append(f"{e['names']['zh']}: the text's longest {_kind(cand)} is {cand}, the build's {built['names']['zh']}")
            for kind, s in st.items():
                nm = s["names"]["zh"]
                for m in re.finditer(re.escape(nm) + r"[^。；，、]{0,4}?(?:长约|约|（约|长)\s?" + NUM + r"\s?公里", clause):
                    v = float(m.group(1).replace(",", ""))
                    if abs(v - s["km"]) > max(0.05 * s["km"], 0.5):
                        bad.append(f"{e['names']['zh']}: {nm} {v:g} km in the text, {s['km']:g} km built")
            if eng.get("river_bridges") is not None:
                for m in re.finditer(r"(\d+)\s?座跨河桥|跨越\s?(\d+)\s?条河流|跨越河流\s?(\d+)\s?次|跨过\s?(\d+)\s?条河", clause):
                    v = int(next(g for g in m.groups() if g))
                    if v != eng["river_bridges"]:
                        bad.append(f"{e['names']['zh']}: {v} river crossings in the text, {eng['river_bridges']} built")
    return {"route structures in the text": bad}


ZH_DIGIT = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def _zh_numeral(s: str) -> float:
    total = sec = cur = 0
    for ch in s:
        if ch in ZH_DIGIT:
            cur = ZH_DIGIT[ch]
        elif ch in "十百千":
            sec += (cur or 1) * {"十": 10, "百": 100, "千": 1000}[ch]
            cur = 0
        elif ch == "万":
            total += (sec + cur) * 10000
            sec = cur = 0
    return float(total + sec + cur)


UNIT_NUM = r"(\d[\d,]*(?:\.\d+)?|(?<![数几上零一二两三四五六七八九十百千万])[零一二两三四五六七八九十百千万]+)"
EN_NUM = r"(\d[\d,]*(?:\.\d+)?)"
SCALE = {"万": 1e4, "亿": 1e8, "thousand": 1e3, "million": 1e6, "billion": 1e9}
# the same quantity in each language: a figure is compared only with figures of the same unit
ZH_UNITS = [("km2", UNIT_NUM + r"\s?(万)?\s?平方公里"), ("kmh", r"时速\s?" + UNIT_NUM + r"\s?公里"),
            ("km", UNIT_NUM + r"(?:多)?\s?公里(?!每)"), ("m", UNIT_NUM + r"(?:多)?\s?米(?![³²])"), ("pct", r"(\d[\d.]*)\s?%"),
            ("usd", UNIT_NUM + r"\s?(亿|万)\s?美元")]
EN_UNITS = [("km2", EN_NUM + r"\s?(thousand|million)?\s?(?:km²|square kilometres)"), ("kmh", EN_NUM + r"\s?km/h"),
            ("km", EN_NUM + r"\s?(?:km|kilometres)(?!²|/h)"), ("m", EN_NUM + r"\s?(?:m|metres)\b(?![²³])"), ("pct", r"(\d[\d.]*)\s?%"),
            ("usd", r"(?:US)?\$\s?" + EN_NUM + r"\s?(billion|million)?|" + EN_NUM + r"\s?(billion|million)? (?:US )?dollars")]


def _figures(t: str, units) -> dict[str, set[float]]:
    out: dict[str, set[float]] = {}
    for unit, pat in units:
        for m in re.finditer(pat, t):
            g = [x for x in m.groups() if x]
            if not g:
                continue
            raw = g[0].replace(",", "")
            v = (float(raw) if re.fullmatch(r"[\d.]+", raw) else _zh_numeral(raw)) * (SCALE.get(g[1], 1) if len(g) > 1 else 1)
            if v >= 10:
                out.setdefault(unit, set()).add(v)
    return out


def check_names(ents: dict) -> dict[str, list[str]]:
    """A name is a name: short and without a full stop (M143: a script once wrote a route's background into the
    next route's name)."""
    bad = [f"{e['id']} {lang}: {v[:30]}…" for e in ents.values() for lang, v in (e.get("names") or {}).items()
           if isinstance(v, str) and (re.search(r"[。；]", v) or len(v) > (40 if lang == "zh" else 160) or re.search(r"[a-z]\. [A-Z][a-z]", v))]
    return {"names are names": bad}


def check_bilingual(ents: dict) -> dict[str, list[str]]:
    """A card's Chinese and English text give the same figures: for each unit (km, m, km², km/h, %, US$), a figure in
    one language with no match (3%) in the other while the other has a figure of that unit with no match either, the
    sign of a number changed in one language only (M137–M142 caught several by hand)."""
    bad = []
    for e in ents.values():
        if e.get("kind") == "route" and e.get("network") in STREETS:
            continue
        for key in ("notes", "background", "wonder"):
            f = e.get(key)
            if not isinstance(f, dict) or not f.get("zh") or not f.get("en"):
                continue
            zh, en = _figures(f["zh"], ZH_UNITS), _figures(f["en"], EN_UNITS)
            for unit in zh.keys() & en.keys():
                near = lambda v, others: any(abs(v - o) <= 0.03 * max(v, o) for o in others)  # noqa: E731
                oz = sorted(v for v in zh[unit] if not near(v, en[unit]))
                oe = sorted(v for v in en[unit] if not near(v, zh[unit]))
                if oz and oe:
                    bad.append(f"{e['names']['zh']} ({e['id']}) {key}: {unit} zh {oz[:3]}, en {oe[:3]}")
    return {"zh and en give the same figures": bad}
