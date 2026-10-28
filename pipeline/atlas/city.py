"""City detail: street networks, buildings and parks, station names and metro lines."""
from __future__ import annotations

import hashlib
import math

import numpy as np
import shapely
from shapely import affinity
from shapely.geometry import LineString, Point

from . import buildings, streets
from .world import ROOT, World
from .common import derived_id, log, short_name
from .sites import core_zone, landmark_sites, main_axis


def street_place_stems(features: list[dict], cities: list[dict], skip: str) -> list[dict]:
    """Stems for streets named after the territory's other cities and its named landforms."""
    out = []
    for c in cities:
        if c["id"] == skip:
            continue
        n = c["names"]
        out.append({"zh": n["zh"].removesuffix("市"), "en": n["en"].removesuffix(" City"),
                    **{k: n[k] for k in CONLANGS if n.get(k)}})
    for fe in features:
        if fe["subtype"] in ("bay", "fjord", "peak", "lake", "mountain_range", "island", "cape", "glacier"):
            n = fe["names"]
            out.append({"zh": n["zh"], "en": n["en"], **{k: n[k] for k in CONLANGS if n.get(k)}})
    return out


def territory_langs(cities: list[dict]) -> tuple[str, ...]:
    """The constructed languages a territory's names are given in: those its cities are named in."""
    return tuple(k for k in CONLANGS if any(c["names"].get(k) for c in cities))


def build_streets(world, sp, features, frame, seed, cities, districts, district_city, dist_polys, poles, urban, land, lake_polys, river_lines):
    """Street networks of the cities listed in the generator's `streets` section.

    Returns [(city, [Street] in design km, {district: context in real km}, [landmark site])]."""
    if urban is None:
        return []
    s = frame.scale

    def real(geom):
        return affinity.scale(geom, s, s, origin=(0, 0))

    lakes_r = real(shapely.union_all(lake_polys)) if lake_polys else None
    rivers_r = real(shapely.union_all(river_lines)).buffer(sp.get("river_gap_km", 0.05)) if river_lines else None
    safe_all = real(land) if lakes_r is None else real(land).difference(lakes_r)
    out = []
    for cid in sp["cities"]:
        ci = next(i for i, c in enumerate(cities) if c["id"] == cid)
        namer = streets.Namer(ROOT / "world" / "names" / "streets.yaml", street_place_stems(features, cities, cid),
                              territory_langs(cities), sp.get("name_styles"))
        city_streets, styles, named, ctx, city_sites = [], {}, {}, {}, []
        for i, d in enumerate(districts):
            if district_city[i] != ci:
                continue
            built = real(dist_polys[i].intersection(urban))
            if lakes_r is not None:
                built = built.difference(lakes_r)
            if built.area < 1.0:
                continue
            cfg = sp.get("districts", {}).get(d["id"], {})
            style = cfg.get("style", "mixed")
            rng = np.random.default_rng([seed, int(hashlib.sha1(d["id"].encode()).hexdigest()[:8], 16)])
            angle = math.radians(cfg["angle_deg"]) if "angle_deg" in cfg else main_axis(built)
            core = (poles[i][0] * s, poles[i][1] * s)
            ds = streets.district_streets(built, core, style, angle, rng, sp, i, cfg.get("main_only", False))
            streets.bend(ds, streets.Field(rng, sp["warp_wavelength_km"]), sp["warp_km"][style])
            sites = landmark_sites(world, d, core, angle, built, safe_all, seed)
            safe = built.buffer(0.05).intersection(safe_all)
            if sites:
                safe = safe.difference(shapely.union_all([site for _, site, _ in sites]).buffer(0.004))
            dry = safe.difference(rivers_r) if rivers_r is not None else safe
            detail = core_zone(built, core, cfg["detail_km2"]) if "detail_km2" in cfg else None
            if detail is not None:
                dry = dry.intersection(detail.buffer(0.05))
            kept, real_lines = [], []
            for st in ds:
                g = streets.keep(st.geom.intersection(dry if st.cls == "local" else safe).simplify(0.004), st.cls)
                if g is not None:
                    real_lines.append((st.cls, g))
                    st.geom = affinity.scale(g, 1 / s, 1 / s, origin=(0, 0))
                    kept.append(st)
            styles[i] = style
            ctx[i] = {"name": d["names"]["zh"], "built": built.intersection(safe_all), "style": style, "angle": angle, "core": core, "lines": real_lines,
                      "radius": math.sqrt(built.area / math.pi), "mix": cfg.get("mix"), "main_only": cfg.get("main_only", False),
                      "detail": detail}
            city_sites += [(pid, site, parts, i) for pid, site, parts in sites]
            city_streets += kept
            counts = {c: sum(1 for st in kept if st.cls == c) for c in streets.CLASSES}
            log(f"  {d['names']['zh']} ({style}): {frame.km2(dist_polys[i].intersection(urban).area):.0f} km² built up, "
                + ", ".join(f"{n} {c}" for c, n in counts.items()))
        district_index = {d["id"]: i for i, d in enumerate(districts)}
        for nm in sp.get("named", []):
            if nm["district"] in district_index:
                named[(district_index[nm["district"]], "grid", nm["axis"], nm.get("line", 0))] = nm
        missing = [nm["names"]["zh"] for nm in sp.get("named", []) if nm["district"] in district_index and
                   district_city[district_index[nm["district"]]] == ci and not any(st.key == (district_index[nm["district"]], "grid", nm["axis"], nm.get("line", 0)) for st in city_streets)]
        for zh in missing:
            log(f"  WARN street {zh}: no arterial at that axis and line")
        rng = np.random.default_rng([seed, 7, ci])
        streets.assign_names(city_streets, namer, styles, rng, named)
        out.append((cities[ci], city_streets, ctx, city_sites))
    return out


def build_buildings(street_out, seed) -> tuple[list, list]:
    """Generated building footprints and parks, [(cls, polygon)] and [polygon] in real km."""
    out, parks = [], []
    for city, _, ctx, sites in street_out:
        taken = buildings.corridors([line for c in ctx.values() for line in c["lines"]])
        if sites:
            taken = taken.union(shapely.union_all([site.buffer(0.01) for _, site, _, _ in sites]))
        for i, c in ctx.items():
            if c["main_only"]:
                continue
            blks = buildings.blocks(c["built"] if c["detail"] is None else c["built"].intersection(c["detail"]), taken)
            rng = np.random.default_rng([seed, 11, i])
            bl, pk = buildings.district_buildings(blks, c["style"], c["core"], c["angle"], c["radius"], rng, c["mix"])
            out += [(b.cls, b.geom) for b in bl]
            parks += pk
            log(f"  {c['name']}: {len(blks)} blocks, {len(bl)} buildings, {len(pk)} parks")
    return out, parks


CONLANGS = ("art-x-viking", "art-x-buckham", "art-x-tavrunaq")
# Administrative suffixes dropped when a station or line is named after a city, longest first.
CITY_SUFFIXES = {"zh": ("原住民自治区", "自由贸易区", "金融特区", "市"),
                 "en": (" Indigenous Autonomous Region", " Free Trade Zone", " Financial Zone", " City"),
                 "art-x-viking": (" Frei auf Hea", " auf Hea"), "art-x-buckham": (" Libre en Teatu", " en Teatu"),
                 "art-x-tavrunaq": (" Nalliqut",)}
# Railway station and metro line names in each constructed language.
STATION_NAMES = {"art-x-viking": "Bahnhof {}", "art-x-buckham": "Stazione di {}", "art-x-tavrunaq": "{} Sukkaniq"}
FREIGHT_STATION_NAMES = {"art-x-viking": "Güterbahnhof {}", "art-x-buckham": "Scalo merci di {}", "art-x-tavrunaq": "{} Usirvik"}
METRO_LINE_NAMES = {"art-x-viking": "{} Linie {}", "art-x-buckham": "{} Linea {}", "art-x-tavrunaq": "{} Ingiut {}"}
METRO_COLORS = ("#E4453A", "#2F80ED", "#F2A33A", "#27AE60", "#9B51E0", "#00A3A3", "#EB5E9B", "#8D6E63")


def bare_name(d: dict) -> dict:
    """A city's or district's name without its administrative suffix (维京港市 -> 维京港, 沙洲区 -> 沙洲)."""
    if d["subtype"] == "borough":
        return {**short_name(d["names"]), **{k: d["names"][k] for k in CONLANGS if d["names"].get(k)}}
    out = {}
    for lang, sufs in CITY_SUFFIXES.items():
        v = d["names"].get(lang)
        if v:
            out[lang] = next((v[: -len(s)] for s in sufs if v.endswith(s) and len(v) > len(s)), v)
    return out


def rail_station_names(stem: dict, freight: bool = False) -> dict:
    if freight:
        out = {"zh": stem["zh"] + "货运站", "en": f"{stem['en']} Freight Yard"}
        formats = FREIGHT_STATION_NAMES
    else:
        out = {"zh": stem["zh"] + "站", "en": f"{stem['en']} Station"}
        formats = STATION_NAMES
    for lang, fmt in formats.items():
        if stem.get(lang):
            out[lang] = fmt.format(stem[lang])
    return out


def metro_station_names(stem: dict, langs: tuple[str, ...] = CONLANGS) -> dict:
    """Metro stations take the name of the square, street or landmark above them (人民广场站, People's Square)."""
    zh = stem["zh"] if stem["zh"].endswith("站") else stem["zh"] + "站"
    return {"zh": zh, "en": stem["en"], **{k: stem[k] for k in langs if stem.get(k)}}


def points_of(geom) -> list:
    out = []
    for g in shapely.get_parts(geom):
        out.append(g if g.geom_type == "Point" else g.representative_point())
    return [p for p in out if not p.is_empty]


def through(line: LineString, p: Point) -> LineString:
    """The line with p inserted as a vertex where it projects, so the line passes through p."""
    t, cs = line.project(p), list(line.coords)
    if t <= 1e-9:
        return LineString([p.coords[0], *cs])
    acc = 0.0
    for q in range(1, len(cs)):
        acc += math.dist(cs[q - 1], cs[q])
        if acc >= t:
            return LineString([*cs[:q], p.coords[0], *cs[q:]])
    return LineString([*cs, p.coords[0]])


def build_metro(mp: dict, world: World, seed, s, cities, districts, district_city, dist_polys, poles, urban, land_r,
                street_out, sites, stations: dict, street_cfg: dict) -> list[dict]:
    """City metro lines (real km) and their stations, added to `stations` (design km, shared with rail).

    Each line runs straight along one street-grid axis of a district through its centre (moved by
    at_km), across the built-up area, and on to the places named by from / to. Lines that cross
    share a station, and a line passing a railway station stops there."""
    real = lambda g: affinity.scale(g, s, s, origin=(0, 0))
    spacing = mp.get("spacing_km", 1.2)
    ctx_all = {i: c for _, _, ctx, _ in street_out for i, c in ctx.items()}
    named_streets = {city["id"]: [(st.names, real(st.geom)) for st in sts if st.cls != "local"] for city, sts, _, _ in street_out}
    dist_index = {d["id"]: i for i, d in enumerate(districts)}
    site_of = {pid: poly for pid, poly, _, _ in sites}

    def place_xy(pid):
        if pid in site_of:
            return site_of[pid].centroid
        pl = world.places[pid]
        i = dist_index[pl["in"]]
        ox, oy = pl.get("offset_km", (0, 0))
        return Point(poles[i][0] * s + ox, poles[i][1] * s + oy)

    out = []
    for system in mp.get("cities", []):
        cid = system["city"]
        ci = next((k for k, c in enumerate(cities) if c["id"] == cid), None)
        if ci is None:
            continue
        langs = territory_langs(cities)
        namer = streets.Namer(ROOT / "world" / "names" / "streets.yaml", [], langs)
        rng = np.random.default_rng([seed, 13, ci])
        geoms, specs = [], []
        for k, ln in enumerate(system["lines"], 1):
            i = dist_index[ln["district"]]
            built = real(dist_polys[i].intersection(urban)).intersection(land_r)
            cfg = street_cfg.get("districts", {}).get(ln["district"], {})
            if i in ctx_all:
                angle = ctx_all[i]["angle"]
            elif "angle_deg" in cfg:
                angle = math.radians(cfg["angle_deg"])
            else:
                angle = main_axis(max(getattr(built, "geoms", [built]), key=lambda p: p.area))
            angle += ln["axis"] * math.pi / 2
            ox, oy = ln.get("at_km", (0, 0))
            ax, ay = poles[i][0] * s + ox, poles[i][1] * s + oy
            ux, uy = math.cos(angle), math.sin(angle)
            seg = LineString([(ax - 100 * ux, ay - 100 * uy), (ax + 100 * ux, ay + 100 * uy)])
            spans = sorted(sorted((seg.project(Point(p.coords[0])), seg.project(Point(p.coords[-1]))))
                           for p in streets.pieces(seg.intersection(built)))
            if not spans:
                log(f"  WARN metro {cities[ci]['names']['zh']} line {k}: axis misses the built-up area")
                continue
            j = min(range(len(spans)), key=lambda q: 0 if spans[q][0] <= 100 <= spans[q][1] else min(abs(spans[q][0] - 100), abs(spans[q][1] - 100)))
            lo = hi = j
            while lo > 0 and spans[lo][0] - spans[lo - 1][1] < 1.0:
                lo -= 1
            while hi + 1 < len(spans) and spans[hi + 1][0] - spans[hi][1] < 1.0:
                hi += 1
            t0, t1 = spans[lo][0] + 0.3, spans[hi][1] - 0.3
            coords = [seg.interpolate(t0).coords[0], seg.interpolate(t1).coords[0]]
            if "to" in ln:
                p = place_xy(ln["to"])
                if Point(coords[0]).distance(p) < Point(coords[-1]).distance(p):
                    coords.reverse()
                coords.append(p.coords[0])
            if "from" in ln:
                p = place_xy(ln["from"])
                if "to" not in ln and Point(coords[-1]).distance(p) < Point(coords[0]).distance(p):
                    coords.reverse()
                coords.insert(0, p.coords[0])
            geoms.append(LineString(coords))
            specs.append((k, ln, i))

        # stations: railway stations next to a line (the line bends through them), transfers at
        # crossings, then evenly in between
        keyed: dict = {}
        anchors = {a: [] for a in range(len(geoms))}
        for sid, st in stations.items():
            if district_city[st["district"]] != ci:
                continue
            p = Point(st["xy"][0] * s, st["xy"][1] * s)
            for a, g in enumerate(geoms):
                if g.distance(p) < 0.6:
                    keyed[sid] = p
                    geoms[a] = through(g, p)
        rail_keyed = dict(keyed)
        for a in range(len(geoms)):
            for sid, p in rail_keyed.items():
                if geoms[a].distance(p) < 1e-6:
                    anchors[a].append((geoms[a].project(p), sid))
            for b in range(a + 1, len(geoms)):
                for p in points_of(geoms[a].intersection(geoms[b])):
                    if any(p.distance(q) < 0.3 for q in rail_keyed.values()):
                        continue
                    key = ("x", a, b, round(p.x, 3), round(p.y, 3))
                    keyed[key] = p
                    anchors[a].append((geoms[a].project(p), key))
                    anchors[b].append((geoms[b].project(p), key))
        for a, (_, ln, _) in enumerate(specs):
            for end in ("to", "from"):
                if end in ln:
                    key = ("p", ln[end])
                    keyed[key] = place_xy(ln[end])
                    anchors[a].append((geoms[a].project(keyed[key]), key))
        plain = lambda key: isinstance(key, tuple) and key[0] in ("s", "e")
        line_keys = []
        for a, g in enumerate(geoms):
            ts = sorted(anchors[a], key=lambda v: v[0])
            for t in (0.0, g.length):
                if all(abs(t - u) > 0.5 for u, _ in ts):
                    ts.append((t, ("e", a, round(t, 3))))
            ts.sort(key=lambda v: v[0])
            filled = []
            for (t0, k0), (t1, _) in zip(ts[:-1], ts[1:]):
                filled.append((t0, k0))
                n = max(1, round((t1 - t0) / spacing))
                filled += [(t0 + (t1 - t0) * q / n, ("s", a, round(t0, 3), q)) for q in range(1, n)]
            filled.append(ts[-1])
            merged = []
            for t, key in filled:
                if merged and t - merged[-1][0] < 0.45 and (plain(key) or plain(merged[-1][1])):
                    if plain(merged[-1][1]) and not plain(key):
                        merged[-1] = (t, key)
                    continue
                merged.append((t, key))
            for t, key in merged:
                keyed.setdefault(key, g.interpolate(t))
            line_keys.append([key for _, key in merged])

        line_ids = [derived_id("rte", f"metro:{cid}:{k}") for k, _, _ in specs]
        users: dict = {}
        for a, keys in enumerate(line_keys):
            for key in keys:
                users.setdefault(key, []).append(a)
        site_pool = [(pid, poly) for pid, poly, _, i in sites if district_city[i] == ci]
        used = {st["names"]["zh"] for st in stations.values()}
        sid_of = {}
        for key, p in keyed.items():
            if key not in users:
                continue
            if key in stations:
                stations[key]["lines"] += [line_ids[a] for a in users[key]]
                sid_of[key] = key
                continue
            cands = [(-1.0, world.places[key[1]]["names"])] if isinstance(key, tuple) and key[0] == "p" else []
            cands += [(poly.distance(p), world.places[pid]["names"]) for pid, poly in site_pool if poly.distance(p) < 0.3]
            for names, sg in named_streets.get(cid, []):
                for a in users[key]:
                    if sg.buffer(0.05).intersection(geoms[a]).length > 0.4:
                        continue
                    cands += [(q.distance(p) + 0.05, names) for q in points_of(sg.intersection(geoms[a])) if q.distance(p) < 0.3]
            cands.sort(key=lambda c: c[0])
            names = next((metro_station_names(n, langs) for _, n in cands if metro_station_names(n, langs)["zh"] not in used), None)
            for _ in range(80):
                if names is not None:
                    break
                theme = namer.theme("mixed", rng)
                if theme not in ("numbered", "places"):
                    cand = metro_station_names(namer.stem(theme, rng), langs)
                    names = cand if cand["zh"] not in used else None
            used.add(names["zh"])
            sid = derived_id("poi", f"metro:{cid}:{names['zh']}")
            dpt = Point(p.x / s, p.y / s)
            home = next((i for i, dc in enumerate(district_city) if dc == ci and dist_polys[i].contains(dpt)), specs[users[key][0]][2])
            stations[sid] = {"names": names, "xy": (dpt.x, dpt.y), "district": home, "lines": [line_ids[a] for a in users[key]]}
            sid_of[key] = sid

        sysn = system["names"]
        for a, (k, ln, i) in enumerate(specs):
            names = {"zh": f"{sysn['zh']}{k}号线", "en": f"{sysn['en']} Line {k}"}
            for lang, fmt in METRO_LINE_NAMES.items():
                if sysn.get(lang):
                    names[lang] = fmt.format(sysn[lang], k)
            out.append({"id": line_ids[a], "city": cid, "n": k, "names": names, "geom": geoms[a],
                        "color": ln.get("color", METRO_COLORS[(k - 1) % len(METRO_COLORS)]),
                        "stations": [sid_of[key] for key in line_keys[a]]})
        n_st = len({sid_of[key] for keys in line_keys for key in keys})
        log(f"  {cities[ci]['names']['zh']}: {len(specs)} metro lines, {n_st} stations, "
            f"{sum(g.length for g in geoms):.0f} km")
    return out
