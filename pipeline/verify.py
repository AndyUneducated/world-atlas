"""Check the built map data in public/data/ against invariants that earlier bugs broke.

    python pipeline/verify.py   # after build.py, before tiles.py (it reads the GeoJSON tiles.py packs)

Each check prints ok or FAIL with the offenders; any FAIL exits 1.
"""
from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import shapely
from shapely import STRtree, points
from shapely.geometry import Point, shape

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas.region import check_expectations  # noqa: E402
from atlas.world import ROOT, World  # noqa: E402

OUT = ROOT / "public" / "data"
ON_LINE_M = 15  # coordinates are rounded to 4 decimals (up to 11 m), so a highlight may sit this far off its line
JOIN_M = 30  # line ends closer than this meet
MINISTRIES = ("对外事务部", "财政部", "司法部", "公共安全部", "教育、科学和文化部", "交通部", "建设部", "民政部",
              "劳动和社会保障部", "卫生和人类服务部", "自然资源和环境保护部")
CENTRAL_OFFICES = ("高级国务督办办公室", "巡视员办公室", "人权事务高级专员办公室")
# Rendered by the browser's own font (localIdeographFontFamily) rather than from glyph files: CJK ideographs,
# kana and hangul.
LOCAL_GLYPHS = ((0x3040, 0x30FF), (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xAC00, 0xD7AF), (0xF900, 0xFAFF))
LABEL_KEY = re.compile(r"^(name_|ref$|short)")
REAL_REF = r"(I|US|SR)-\d{1,3}|[A-Z]\d{1,2}"


def load(name: str):
    with open(OUT / name, encoding="utf-8") as f:
        return json.load(f)


def metres(coords: np.ndarray, lat0: float) -> np.ndarray:
    return np.asarray(coords, float) * [111320 * math.cos(math.radians(lat0)), 110574]


def components(lines: list[list], lat0: float) -> int:
    """Pieces a set of lines falls into, counting ends within JOIN_M as joined."""
    lines = [metres(ln, lat0) for ln in lines if len(ln) > 1]
    parent = list(range(len(lines)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    ends = [(i, p) for i, ln in enumerate(lines) for p in (ln[0], ln[-1])]
    geoms = [shape({"type": "LineString", "coordinates": ln.tolist()}) for ln in lines]
    tree = STRtree(geoms)
    for i, p in ends:
        for j in tree.query(points(p), predicate="dwithin", distance=JOIN_M):
            parent[find(i)] = find(int(j))
    return len({find(i) for i in range(len(lines))})


def parts(geom: dict) -> list[list]:
    return geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]


def check_routes(ents: dict) -> dict[str, list[str]]:
    """A click lights the route's own drawn lines and the card's district rows light their stretch (segments):
    the two must be the same line, cover the whole route and run unbroken."""
    drawn = defaultdict(list)
    for layer in ("roads", "route-shared", "rail"):
        for f in load(f"{layer}.geojson")["features"]:
            if f["properties"].get("id"):
                drawn[f["properties"]["id"]] += parts(f["geometry"])
    off, broken, unlit, undrawn = [], [], [], []
    for eid, e in ents.items():
        if e.get("kind") != "route" or e.get("network") not in (
                "national_expressway", "territorial_expressway", "territorial_highway", "intercity_rail", "freight_rail"):
            continue
        label = f"{e.get('ref') or e['names']['zh']}"
        own = drawn.get(eid, [])
        if not own:
            if e.get("stats", {}).get("length_km"):
                undrawn.append(label)
            continue
        lat0 = float(np.mean([c[1] for ln in own for c in ln]))
        if components(own, lat0) > 1:
            broken.append(f"{label} drawn in {components(own, lat0)} pieces")
        segs = e.get("segments") or []
        lines = [ln for s in segs for ln in s["lines"] if len(ln) > 1]
        if not lines:
            continue
        if (n := components(lines, lat0)) > 1:
            broken.append(f"{label} highlighted in {n} pieces")
        if (d := farthest(lines, own, lat0)) > ON_LINE_M:
            off.append(f"{label} {d:.0f} m")
        if (d := farthest(own, lines, lat0)) > ON_LINE_M:  # rows may light a stretch twice where the route doubles back
            unlit.append(f"{label} {d:.0f} m")
    return {"route rows light the drawn line": off, "routes drawn and lit unbroken": broken,
            "route rows cover the drawn route": unlit, "routes with a length are drawn": undrawn}


def farthest(lines: list[list], onto: list[list], lat0: float) -> float:
    """How far (m) the farthest vertex of `lines` lies from `onto`."""
    tree = STRtree([shape({"type": "LineString", "coordinates": metres(ln, lat0).tolist()}) for ln in onto if len(ln) > 1])
    _, dist = tree.query_nearest(points(metres(np.array([c for ln in lines for c in ln]), lat0)), return_distance=True)
    return float(dist.max())


def check_numbers(ents: dict) -> dict[str, list[str]]:
    """Route numbers run 1, 2, 3… (territorial highways 101, 102…) with no gaps, and no code uses the old OT.
    California's real-world numbers (I-5, US-101, SR-1, county routes such as G4) are not a sequence."""
    series = defaultdict(list)
    old = []
    for eid, e in ents.items():
        ref = e.get("ref") or ""
        if re.fullmatch(REAL_REF, ref):
            continue
        if m := re.fullmatch(r"(.*?)(\d+)", ref):
            series[(m.group(1), e.get("network"))].append(int(m.group(2)))
        codes = [ref, eid, *map(str, (e.get("codes") or {}).values())]
        if any(re.search(r"(^|[^A-Za-z])OT([^A-Za-z]|$)", c) for c in codes):
            old.append(f"{eid} {ref}")
    gaps = []
    for (prefix, network), nums in sorted(series.items(), key=str):
        start = 101 if network == "territorial_highway" else 1
        if sorted(nums) != list(range(start, start + len(nums))):
            gaps.append(f"{prefix}{network}: {sorted(nums)}")
    return {"route numbers without gaps": gaps, "no OT codes": old}


def check_government(ents: dict) -> dict[str, list[str]]:
    """Every Chinese territory has its government buildings on the map (once only one territory had them);
    a US state has its capitol, the governor's office, its supreme court and each of its departments."""
    names = {e["names"]["zh"] for e in ents.values() if e.get("kind") == "place"}
    missing = []
    for e in ents.values():
        if e.get("subtype") != "dependency":
            continue
        t = e["names"]["zh"]
        if "country:US" in (e.get("ancestors") or []):
            L = e.get("legislature", {})
            want = [f"{t}州议会大厦", f"{t}州长办公厅", L.get("court", {}).get("names", {}).get("zh", f"{t}最高法院"),
                    *(f"{t}{m['ministry']['zh']}" for m in L.get("ministers", []))]
        elif "country:CN" in (e.get("ancestors") or []):
            want = [f"{t}政府", f"{t}政策和计划委员会", *(f"{t}政务院{m}" for m in MINISTRIES),
                    *(f"中央政府常驻{t}{o}" for o in CENTRAL_OFFICES)]
        else:
            continue
        missing += [w for w in want if w not in names]
    return {"government buildings in every territory": missing}


def check_stations(ents: dict) -> dict[str, list[str]]:
    """A station stands in the district it is named for and listed under."""
    divs = {f["properties"]["id"]: shape(f["geometry"]) for f in load("divisions.geojson")["features"]}
    out = [f"{e['names']['zh']} outside {ents[e['in']]['names']['zh']}" for e in ents.values()
           if e.get("subtype") == "station" and e.get("in") in divs and not divs[e["in"]].contains(Point(e["center"]))]
    return {"stations in their districts": out}


def check_expected(world: World, ents: dict) -> dict[str, list[str]]:
    """The facts the setting fixes (longest river, largest cities), on the merged data."""
    failed = []
    for spec in world.generators:
        tid = spec["territory"]
        mine = {k: e for k, e in ents.items() if tid in e.get("ancestors", [])}
        failed += check_expectations(spec.get("expect", {}), mine)
    return {"setting's superlatives hold": failed}


def check_glyphs() -> dict[str, list[str]]:
    """Every character of a map label has a glyph: the fetched ranges or the browser's CJK font."""
    src = (ROOT / "scripts" / "fetch-glyphs.mjs").read_text(encoding="utf-8")
    starts = [int(s) for s in re.search(r"const starts = \[([\d, ]+)\]", src).group(1).split(",")]
    ok = [(s, s + 255) for s in starts] + list(LOCAL_GLYPHS)
    bad = Counter()
    for p in sorted(OUT.glob("*.geojson")):
        for f in load(p.name)["features"]:
            for k, v in f["properties"].items():
                if isinstance(v, str) and LABEL_KEY.match(k):
                    for ch in v:
                        if not any(lo <= ord(ch) <= hi for lo, hi in ok):
                            bad[f"{ch} U+{ord(ch):04X} in {v}"] += 1
    return {"label characters have glyphs": [k for k, _ in bad.most_common()]}


def check_models(ents: dict) -> dict[str, list[str]]:
    """Climate and election results are internally consistent, and every office has its own holder."""
    climate, seats, names = [], [], []
    holders: list[tuple[str, str]] = []
    ministries = len(MINISTRIES)
    for eid, e in ents.items():
        if e.get("nation") and "legislature" not in e:
            g, name = e.get("government", {}), e["names"]["zh"]
            if not (e.get("nation", {}).get("legislature") and g.get("executive") and g.get("judiciary")):
                seats.append(f"{name}: a nation has an executive, a legislature and a judiciary, or says it does without one")
            ex, ju = g.get("executive", {}), g.get("judiciary", {})
            holders += [(ex[k]["name"]["en"], f"{name} {k}") for k in ("head", "deputy") if k in ex]
            holders += [(m["name"]["en"], f"{name} {m['ministry']['en']}") for m in ex.get("ministers", [])]
            if "name" in ju:
                holders += [(ju["name"]["en"], f"{name} presiding judge"), *((j["en"], f"{name} judge") for j in ju["judges"])]
        if e.get("kind") != "division" or e.get("subtype") not in ("dependency", "locality", "borough"):
            continue
        c = e.get("climate")
        name = e["names"]["zh"]
        if not c and e["subtype"] != "dependency":  # a territory has an overview text, no figures of its own
            climate.append(f"{name}: none")
        elif c:
            m = c["months"]
            if any(len(m[k]) != 12 for k in ("hi", "lo", "precip")) or any(h < lo for h, lo in zip(m["hi"], m["lo"])) \
                    or min(m["precip"]) < 0 or not min(m["lo"]) <= c["mean_c"] <= max(m["hi"]) \
                    or c["record"]["lo"] > min(m["lo"]) or c["record"]["hi"] < max(m["hi"]):
                climate.append(f"{name}: months, mean or records out of order")
            if c.get("polar_night_days") and abs(e["center"][1]) < 66:
                climate.append(f"{name}: polar night at {e['center'][1]:.1f}°")
        for key in ("legislature", "council", "upper"):
            if not (body := e.get(key) if key != "upper" else e.get("legislature", {}).get("upper")):
                continue
            if body.get("appointed"):
                holders.append((body["head"]["name"]["en"], f"{name} {key} head"))
                continue
            won = {p["id"]: p["seats"] for p in body["parties"]}
            if sum(won.values()) != body["seats"]:
                seats.append(f"{name} {key}: parties hold {sum(won.values())} of {body['seats']} seats")
            if sum(won.get(p, 0) for p in body["government"]) * 2 <= body["seats"]:
                seats.append(f"{name} {key}: government without a majority")
            # an elected governor or mayor need not come from the chamber's majority
            for role in ("speaker",) if body.get("elected") or key == "upper" else ("head", "speaker"):
                if body.get(role, {}).get("party") not in body["government"]:
                    seats.append(f"{name} {key}: the {role}'s party is not in government")
            for role in ("head", "speaker", "deputy"):
                if role in body:
                    holders.append((body[role]["name"]["en"], f"{name} {key} {role}"))
            if "deputy" in body and body["deputy"]["party"] not in body["government"] and not body.get("elected"):
                seats.append(f"{name} {key}: the deputy's party is not in government")
            holders += [(a["name"]["en"], f"{name} {a['names']['en']}") for a in body.get("agencies", [])]
            if key == "legislature":
                cabinet = [body["head"]["party"]] if body.get("elected") else body["government"]
                if body.get("elected"):
                    if not body["head"].get("party") or not 50 <= body["head"]["vote"] <= 100:
                        seats.append(f"{name}: an elected governor has a party and won the general election")
                elif "party" in body.get("governor", {}):  # a premier who is also head of state has no governor
                    seats.append(f"{name}: the governor belongs to no party")
                if (op := body.get("opposition")) and op["party"] in body["government"]:
                    seats.append(f"{name}: the leader of the opposition's party is in government")
                ms = body.get("ministers", [])
                held = {p: sum(m.get("party") == p for m in ms) for p in cabinet}
                experts = sum("party" not in m for m in ms)
                if (len({m["id"] for m in ms}) != len(ms) or len(ms) != ministries or {m["party"] for m in ms if "party" in m} - set(cabinet)
                        or not all(held.values()) or experts > 4 or {c["id"]: c["seats"] for c in body["cabinet"]} != held):
                    seats.append(f"{name}: the cabinet is not the {ministries} ministries, each governing party holding one or more, at most 4 non-partisan")
                if not 6 <= 1 + len(body["court"].get("judges", [])) <= 12:
                    seats.append(f"{name}: the court has {1 + len(body['court'].get('judges', []))} judges, not 6 to 12")
                if "governor" in body:
                    holders.append((body["governor"]["name"]["en"], f"{name} governor"))
                holders.append((body["court"]["name"]["en"], f"{name} chief justice"))
                holders += [(m["name"]["en"], f"{name} {m['ministry']['en']}") for m in ms]
                holders += [(j["en"], f"{name} judge") for j in body["court"].get("judges", [])]
    seen: dict[str, str] = {}
    for who, post in holders:
        if who in seen:
            names.append(f"{who}: both {seen[who]} and {post}")
        seen.setdefault(who, post)
    return {"climate in order": climate, "seats add up, governments hold a majority, offices filled": seats, "no one holds two offices": names}


def check_terrain(manifest: dict) -> dict[str, list[str]]:
    """The terrain archive covers the zooms and bounds the manifest gives the map."""
    from pmtiles.reader import MmapSource, Reader

    dem, bad = manifest["dem"], []
    with open(OUT / dem["url"], "rb") as f:
        h = Reader(MmapSource(f)).header()
    if (h["min_zoom"], h["max_zoom"]) != (dem["minzoom"], dem["maxzoom"]):
        bad.append(f"archive zooms {h['min_zoom']}–{h['max_zoom']}, manifest {dem['minzoom']}–{dem['maxzoom']}")
    box = [h["min_lon_e7"] / 1e7, h["min_lat_e7"] / 1e7, h["max_lon_e7"] / 1e7, h["max_lat_e7"] / 1e7]
    if any(abs(a - b) > 1e-5 for a, b in zip(box, dem["bounds"])):
        bad.append(f"archive bounds {box}, manifest {dem['bounds']}")
    return {"terrain archive matches the manifest": bad}


ROUND_FIT = 0.075  # a border within this share of its radius of a circle, on average, is drawn as one
ROUND_FIT_LARGE = 0.045  # the same for circles wider than ROUND_LARGE_KM, where long straight edges fit loosely
ROUND_LARGE_KM = 60
ROUND_SPAN = math.radians(160)  # over this much of the circle
ROUND_MIN_KM = 5


def check_round_borders(ents: dict) -> dict[str, list[str]]:
    """No border between divisions is a circle or a long arc of one (M110): growing a small division from
    its seed draws a disc, and two weighted-diagram cells meet along a circle, and no real border looks
    like either. The coast is left out; each inland stretch of a division's outline is fitted to a circle."""
    feats = [(f["properties"]["id"], shape(f["geometry"])) for f in load("divisions.geojson")["features"]
             if f["properties"].get("id") in ents]
    ids = {i for i, _ in feats}
    coast = shapely.union_all([g for i, g in feats if ents[i].get("parent") not in ids]).boundary
    bad = []
    for i, g in feats:
        lat0 = g.centroid.y
        kx, ky = math.cos(math.radians(lat0)) * 111.32, 110.57
        km = lambda geom: shapely.transform(geom, lambda a: np.column_stack([a[:, 0] * kx, a[:, 1] * ky]))
        x0, y0, x1, y1 = g.bounds
        near = coast.intersection(shapely.box(x0 - 0.05, y0 - 0.05, x1 + 0.05, y1 + 0.05))
        inland = km(g.boundary).difference(km(near).buffer(0.6)) if not near.is_empty else km(g.boundary)
        for ln in shapely.get_parts(shapely.line_merge(inland) if inland.geom_type == "MultiLineString" else inland):
            if ln.geom_type != "LineString" or ln.length < ROUND_MIN_KM:
                continue
            xy = np.array([ln.interpolate(t).coords[0] for t in np.linspace(0, ln.length, max(24, int(ln.length / 0.4)))])
            x, y = xy[:, 0], xy[:, 1]
            c, *_ = np.linalg.lstsq(np.column_stack([x, y, np.ones_like(x)]), x * x + y * y, rcond=None)
            cx, cy = c[0] / 2, c[1] / 2
            r = math.sqrt(max(c[2] + cx * cx + cy * cy, 1e-9))
            fit = float(np.sqrt(np.mean((np.hypot(x - cx, y - cy) - r) ** 2))) / r
            span = abs(float(np.unwrap(np.arctan2(y - cy, x - cx))[-1] - np.arctan2(y[0] - cy, x[0] - cx)))
            if span > ROUND_SPAN and fit < (ROUND_FIT if r < ROUND_LARGE_KM else ROUND_FIT_LARGE):
                bad.append(f"{ents[i]['names']['zh']} ({i}): {math.degrees(span):.0f}° of a {r:.1f} km circle, off by {fit:.1%}")
                break
    return {"no round borders": bad}


def main():
    world = World()
    ents, manifest = load("entities.json"), load("manifest.json")
    results = {}
    for check in (lambda: check_routes(ents), lambda: check_numbers(ents), lambda: check_government(ents), lambda: check_stations(ents),
                  lambda: check_expected(world, ents), check_glyphs, lambda: check_models(ents),
                  lambda: check_terrain(manifest), lambda: check_round_borders(ents)):
        results.update(check())
    for what, bad in results.items():
        print(f"{'ok  ' if not bad else 'FAIL'} {what}" + (f": {len(bad)}\n  " + "\n  ".join(bad[:20]) if bad else ""))
    sys.exit(1 if any(results.values()) else 0)


if __name__ == "__main__":
    main()
