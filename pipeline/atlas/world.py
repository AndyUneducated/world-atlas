"""Loading and validating the world source files under world/."""
from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WORLD_DIR = ROOT / "world"

ID_PATTERN = re.compile(r"^(div|nat|rte|poi|bld|ctx)_[0-9a-hjkmnp-tv-z]{6}$|^country:[A-Z]{2}$")
REQUIRED_LANGS = ("zh", "en")
DIVISION_SUBTYPES = ("country", "dependency", "region", "locality", "borough")
# Division codes (GB/T 2260): six digits, of which a territory uses the first two, a city four
# and a district all six; the rest are zeros (900000 → 900100 → 900101).
CODE_DIGITS = {"dependency": 2, "locality": 4, "borough": 6}
# Landmark footprint templates (see pipeline/atlas/buildings.py); the last five are transport facilities.
MILITARY_VARIANTS = {  # military and space facility layouts and the kinds each draws (first is the default)
    "airbase": ("fighter", "heavy", "uav", "school"), "radar": ("dome", "array", "domes"), "antenna": ("small", "large"),
    "sam": (), "range": ("air", "armor", "cold"), "plant": ("depot", "assembly", "propellant", "tunnel", "hangar", "engine"),
    "test_stand": (), "silo": (), "bunker": (), "launch_track": (), "camp": ("barracks", "hq", "hospital", "training"), "heliport": (),
}
SITE_LAYOUTS = ("complex", "hall", "campus", "stadium", "tower", "dome", "park", "plaza", "market",
                "airport", "port", "harbour", "offshore_port", "spaceport", "mine", *MILITARY_VARIANTS)
FACILITY_LAYOUTS = ("airport", "port", "harbour", "offshore_port", "spaceport", "mine", *MILITARY_VARIANTS)
RUNWAY_LAYOUTS = ("airport", "spaceport", "airbase", "launch_track")  # roads and railways go round these
COASTAL_LAYOUTS = ("port", "harbour")  # sites centred on the shore
HARBOUR_TERMINALS = ("container", "bulk", "oil", "roro")
RAIL_NETWORKS = ("intercity_rail", "freight_rail")
RAIL_SPEED_KMH = {"intercity_rail": (160, 400), "freight_rail": (60, 160)}  # allowed tech.operating_speed_kmh
# Lines whose cards carry a construction background, and who runs them (operators in the territory record).
BACKGROUND_NETWORKS = ("national_expressway", "territorial_expressway", "territorial_highway", "intercity_rail", "freight_rail")
OPERATOR_KINDS = ("expressway", "highway", "rail")
# Card text and traits: no region build reads them, so they stay out of a region's cache key and
# build.py takes them from the sources after the regions are merged.
TEXT_KEYS = ("notes", "background", "motto", "military", "traits")
TRAIT_KEYS = ("industries", "heritage", "age", "income")
ROUTE_SHIELDS = ("crest", "maritime", "polar")  # territorial route shield designs, see src/lib/shields.ts
STREET_STYLES = ("planned", "mixed", "organic")
BUILDING_MIX_KEYS = ("slabs", "towers", "perimeter", "houses", "podium", "industrial", "civic", "park")
# Landforms the generator detects and names by location (see pipeline/atlas/coast.py).
DETECT_KINDS = ("island", "bay", "fjord", "cape", "strait", "estuary", "river", "peak", "pass", "glacier")


def _load(path: Path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


class ValidationError(Exception):
    pass


class World:
    def __init__(self, root: Path = WORLD_DIR):
        self.root = root
        self.planet = _load(root / "planet.yaml")["planet"]
        self.entities: dict[str, dict] = {}
        self.countries = self._collect(root / "registry", "countries")
        self.divisions = self._collect(root / "divisions", "divisions")
        self.features = self._collect(root / "features", "features")
        self.routes = self._collect(root / "transport", "routes")
        self.railways = self._collect(root / "transport", "railways")
        self.places = self._collect(root / "places", "places")
        # A region's features live in world/features/<generator file name>-*.yaml.
        self.generators = [{**_load(p), "_region": p.stem} for p in sorted((root / "generator").glob("*.yaml"))]
        eng = root / "transport" / "engineering.yaml"
        self.engineering: dict = _load(eng) if eng.exists() else {}
        econ = root / "economy.yaml"
        self.economy: dict = _load(econ) if econ.exists() else {}

    def _collect(self, folder: Path, key: str) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for path in sorted(folder.glob("*.yaml")):
            for item in _load(path).get(key, []):
                if item["id"] in self.entities:
                    raise ValidationError(f"duplicate id {item['id']} in {path.name}")
                item["_source"] = str(path.relative_to(self.root.parent)).replace("\\", "/")
                out[item["id"]] = item
                self.entities[item["id"]] = item
        return out

    def region_features(self, spec: dict) -> list[dict]:
        return [f for f in self.features.values() if Path(f["_source"]).stem.startswith(spec["_region"] + "-")]

    def children(self, parent_id: str) -> list[dict]:
        return [d for d in self.divisions.values() if d.get("parent") == parent_id]

    def ancestors(self, entity_id: str) -> list[str]:
        chain, cur = [], self.entities[entity_id].get("parent")
        while cur:
            chain.append(cur)
            cur = self.entities[cur].get("parent")
        return chain

    def region_sources(self, spec: dict) -> dict:
        """Every source a region's build reads: its generator, the divisions, places, features and lines
        in or reaching its territory, engineering standards and name lists. Unchanged sources, unchanged region."""
        tid = spec["territory"]
        inside, todo = set(), [tid]
        while todo:
            inside.add(cur := todo.pop())
            todo += [d["id"] for d in self.children(cur)]
        places = {pid for pid, p in self.places.items() if p["in"] in inside}
        lines = {r["id"] for r in [*self.routes.values(), *self.railways.values()]
                 if tid in r.get("crossing", {}) or any(v in inside or v in places for v in r["via"])}
        named = str(spec)
        features = {f["id"] for f in self.region_features(spec)} | {fid for fid in self.features if fid in named}
        ids = inside | set(self.ancestors(tid)) | places | lines | features
        names = {p.name: p.read_text(encoding="utf-8") for p in sorted((self.root / "names").glob("*.yaml"))}
        entities = {i: {k: v for k, v in self.entities[i].items() if k not in TEXT_KEYS} for i in sorted(ids)}
        return {"spec": spec, "entities": entities, "engineering": self.engineering, "names": names}

    def validate(self) -> list[str]:
        errors: list[str] = []
        for eid, e in self.entities.items():
            if not ID_PATTERN.match(eid):
                errors.append(f"{eid}: malformed id")
            for lang in REQUIRED_LANGS:
                if not e.get("names", {}).get(lang):
                    errors.append(f"{eid}: missing name in '{lang}'")
            if e.get("status") not in ("canon", "draft", "generated"):
                errors.append(f"{eid}: status must be canon | draft | generated")
        codes: dict[str, str] = {}
        for did, d in self.divisions.items():
            if d["subtype"] not in DIVISION_SUBTYPES:
                errors.append(f"{did}: unknown subtype {d['subtype']}")
            parent = self.entities.get(d.get("parent"))
            if parent is None:
                errors.append(f"{did}: parent {d.get('parent')} not found")
                continue
            admin = d.get("codes", {}).get("admin")
            if not admin and d["subtype"] in ("locality", "borough"):
                errors.append(f"{did}: needs an admin code (codes.admin)")
            if admin:
                if admin in codes:
                    errors.append(f"{did}: admin code {admin} already used by {codes[admin]}")
                codes[admin] = did
                level = CODE_DIGITS.get(d["subtype"])
                if not re.fullmatch(r"\d{6}", admin) or (level and admin[level:].strip("0")):
                    errors.append(f"{did}: admin code {admin} must have 6 digits, zero past the first {level}")
                parent_admin = parent.get("codes", {}).get("admin")
                parent_level = CODE_DIGITS.get(parent["subtype"])
                if parent_admin and parent_level and not admin.startswith(parent_admin[:parent_level]):
                    errors.append(f"{did}: admin code {admin} does not extend parent code {parent_admin}")
            if d.get("route_shield", "crest") not in ROUTE_SHIELDS:
                errors.append(f"{did}: route_shield must be one of {', '.join(ROUTE_SHIELDS)}")
            if d["subtype"] == "locality" and not re.match(r"^#[0-9A-Fa-f]{6}$", str(d.get("color", ""))):
                errors.append(f"{did}: a city needs a colour (#RRGGBB) for its map tint and emblem")
            kids = self.children(did)
            if kids and d.get("area_km2"):
                total = sum(k.get("area_km2", 0) for k in kids)
                if abs(total - d["area_km2"]) > 0.5:
                    errors.append(f"{did}: children area {total} != {d['area_km2']}")
            if kids and d.get("population"):
                total = sum(k.get("population", 0) for k in kids)
                if abs(total - d["population"]) > 100:
                    errors.append(f"{did}: children population {total} != {d['population']}")
            if traits := d.get("traits"):
                econ = self.economy
                if extra := set(traits) - set(TRAIT_KEYS):
                    errors.append(f"{did}: unknown traits {', '.join(sorted(extra))} (use {', '.join(TRAIT_KEYS)})")
                if bad := [i for i in traits.get("industries", []) if i not in econ.get("industries", {})]:
                    errors.append(f"{did}: industries {', '.join(bad)} not in world/economy.yaml")
                for key, table in (("heritage", "heritage"), ("age", "age")):
                    if key in traits and traits[key] not in econ.get(table, {}):
                        errors.append(f"{did}: {key} {traits[key]} not in world/economy.yaml")
            if d["subtype"] in ("locality", "borough") and self.economy:
                merged = {**parent.get("traits", {}), **d.get("traits", {})} if d["subtype"] == "borough" else d.get("traits", {})
                if missing := [k for k in ("industries", "heritage", "age") if k not in merged]:
                    errors.append(f"{did}: traits need {', '.join(missing)} (here or in the city)")
        refs: dict[str, str] = {}
        for rid, r in self.routes.items():
            for v in r.get("via", []):
                if v not in self.divisions and not self.places.get(v, {}).get("site"):
                    errors.append(f"{rid}: via {v} is not a division or a place with a site")
            if r["ref"] in refs:
                errors.append(f"{rid}: route number {r['ref']} already used by {refs[r['ref']]}")
            refs[r["ref"]] = rid
            if r.get("ring") and len(r.get("via", [])) < 3:
                errors.append(f"{rid}: a ring needs at least three via divisions")
            for v in r.get("legs", {}):
                if v not in r.get("via", []):
                    errors.append(f"{rid}: legs entry {v} is not one of the via divisions")
            if r.get("network") not in self.engineering.get("standards", {}):
                errors.append(f"{rid}: no engineering standard for network {r.get('network')} (world/transport/engineering.yaml)")
            if str(r.get("network", "")).startswith("territorial_") and not r.get("shield"):
                errors.append(f"{rid}: a territorial route needs a shield symbol (shield: <glyph>, see src/lib/shields.ts)")
        for rid, r in [*self.routes.items(), *self.railways.items()]:
            if r.get("network") in BACKGROUND_NETWORKS and not all(r.get("background", {}).get(lang) for lang in REQUIRED_LANGS):
                errors.append(f"{rid}: an expressway, territorial highway or railway needs a background (zh, en): why and how it was built")
        for fid, f in self.features.items():
            if f["subtype"] == "archipelago" and not all(self.features.get(i, {}).get("subtype") == "island"
                                                         for i in f.get("islands") or [None]):
                errors.append(f"{fid}: an archipelago lists its islands (ids of island features) in 'islands'")
            det = f.get("detect")
            if det is None:
                continue
            if det.get("kind") not in DETECT_KINDS:
                errors.append(f"{fid}: detect.kind must be one of {', '.join(DETECT_KINDS)}")
            at = det.get("at_km")
            if not (isinstance(at, list) and len(at) == 2 and all(isinstance(v, (int, float)) for v in at)):
                errors.append(f"{fid}: detect.at_km must be [x, y] in design km")
        for pid, p in self.places.items():
            if p.get("in") not in self.divisions:
                errors.append(f"{pid}: 'in' must name a division")
            if "access_road" in p and not (p["access_road"] is True and p.get("site")):
                errors.append(f"{pid}: access_road: true needs a site (a city road is built from it to the network)")
            if mil := p.get("military"):
                for k in ("unit", "branch", "equipment", "access"):
                    if not (isinstance(mil.get(k), dict) and mil[k].get("zh") and mil[k].get("en")):
                        errors.append(f"{pid}: military.{k} needs zh and en")
                if not (isinstance(mil.get("personnel"), int) and mil["personnel"] > 0):
                    errors.append(f"{pid}: military.personnel must be a whole number of people")
            if site := p.get("site"):
                if site.get("layout") not in SITE_LAYOUTS:
                    errors.append(f"{pid}: site layout must be one of {', '.join(SITE_LAYOUTS)}")
                size = site.get("size_m")
                top = 40000 if site.get("layout") == "launch_track" else 8000
                if not (isinstance(size, list) and len(size) == 2 and all(isinstance(v, (int, float)) and 10 <= v <= top for v in size)):
                    errors.append(f"{pid}: site size_m must be [along, across] in metres (10–{top})")
                if "variant" in site and site["variant"] not in MILITARY_VARIANTS.get(site.get("layout"), ()):
                    errors.append(f"{pid}: site variant must be one of {', '.join(MILITARY_VARIANTS.get(site.get('layout'), ())) or 'none for this layout'}")
                if "angle_deg" in site and not isinstance(site["angle_deg"], (int, float)):
                    errors.append(f"{pid}: site angle_deg must be a number (degrees, east = 0, counter-clockwise)")
                if self.divisions.get(p.get("in"), {}).get("subtype") != "borough":
                    errors.append(f"{pid}: a place with a site must be 'in' a district")
                if site.get("layout") == "harbour":
                    terms = site.get("terminals")
                    if not (isinstance(terms, list) and len(terms) >= 2 and all(t in HARBOUR_TERMINALS for t in terms)):
                        errors.append(f"{pid}: harbour terminals must list 2 or more of {', '.join(HARBOUR_TERMINALS)} (one per mole, along the quay)")
                if site.get("layout") == "offshore_port" and "bridge_to" in site:
                    to = self.places.get(site["bridge_to"], {})
                    if to.get("in") != p.get("in") or to.get("site", {}).get("layout") not in COASTAL_LAYOUTS:
                        errors.append(f"{pid}: bridge_to must name a port or harbour in the same district")
        for rid, r in self.railways.items():
            if r.get("network") not in RAIL_NETWORKS:
                errors.append(f"{rid}: railway network must be one of {', '.join(RAIL_NETWORKS)}")
            via = r.get("via", [])
            if len(via) < 2:
                errors.append(f"{rid}: a railway needs at least two stops in via")
            for v in via:
                if self.divisions.get(v, {}).get("subtype") not in ("locality", "borough"):
                    errors.append(f"{rid}: via {v} is not a city or district")
            for v in r.get("station_names", {}):
                if v not in via:
                    errors.append(f"{rid}: station_names entry {v} is not one of the stops")
            if r.get("color") and not re.match(r"^#[0-9A-Fa-f]{6}$", str(r["color"])):
                errors.append(f"{rid}: color must be #RRGGBB")
            speed = r.get("tech", {}).get("operating_speed_kmh")
            lo, hi = RAIL_SPEED_KMH.get(r.get("network"), (160, 400))
            if speed is not None and not (isinstance(speed, int) and lo <= speed <= hi):
                errors.append(f"{rid}: tech.operating_speed_kmh must be a whole number of km/h, {lo}–{hi}")
        territories = {g["territory"] for g in self.generators}
        for rid, r in [*self.routes.items(), *self.railways.items()]:
            if "crossing" not in r:
                continue
            portals = r["crossing"]
            if not (isinstance(portals, dict) and len(portals) == 2 and set(portals) <= territories
                    and all(isinstance(p, list) and len(p) == 2 for p in portals.values())):
                errors.append(f"{rid}: crossing must give a portal [x, y] (design km) in each of two generated territories")
                continue
            for key in ("tunnel_names", "operator"):
                if not all(r.get(key, {}).get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"{rid}: a crossing line needs {key} (zh, en)")
            home = [next((t for t in portals if t == v or t in self.ancestors(self.places.get(v, {}).get("in", v))), None) for v in r["via"]]
            if None in home or sum(a != b for a, b in zip(home, home[1:])) != 1:
                errors.append(f"{rid}: via must run through one crossing territory, then the other")
        for gen in self.generators:
            ops = self.divisions.get(gen.get("territory", ""), {}).get("operators", {})
            for k in OPERATOR_KINDS:
                if not all(ops.get(k, {}).get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"{gen.get('territory')}: operators.{k} needs a name (zh, en): who runs the territory's {k} lines")
            layout = gen.get("layout", {})
            for c in self.children(gen.get("territory", "")):
                if c["subtype"] == "locality" and c["id"] not in layout.get("cities", {}):
                    errors.append(f"generator: city {c['id']} has no anchor in layout.cities")
            for key in list(layout.get("cities", {})) + list(layout.get("districts", {})):
                if key not in self.divisions:
                    errors.append(f"generator: unknown division {key}")
            for did in layout.get("islands", {}):
                if self.divisions.get(did, {}).get("subtype") != "borough":
                    errors.append(f"generator: islands of {did}: not a district")
            for did, toward in layout.get("coastal", {}).items():
                if self.divisions.get(did, {}).get("subtype") != "borough":
                    errors.append(f"generator: coastal {did} is not a district")
                rivers = {nr["feature"] for nr in gen.get("hydrology", {}).get("named_rivers", [])}
                if toward is not None and toward not in rivers and not self.features.get(toward, {}).get("detect"):
                    errors.append(f"generator: coastal {did}: {toward} is neither a named river nor a detected landform")
            if (sheds := gen.get("snow_sheds")) is not None and not isinstance((sheds or {}).get("above_m"), (int, float)):
                errors.append("generator: snow_sheds needs above_m (m): the ground height above which roads run under sheds")
            for r in gen.get("terrain", {}).get("ridges", []) + gen.get("terrain", {}).get("valleys", []):
                if r["feature"] not in self.features:
                    errors.append(f"generator: unknown feature {r['feature']}")
            for nr in gen.get("hydrology", {}).get("named_rivers", []):
                if nr["through"] not in self.divisions:
                    errors.append(f"generator: named river through unknown division {nr['through']}")
            for system in gen.get("metro", {}).get("cities", []):
                city = system.get("city")
                if self.divisions.get(city, {}).get("subtype") != "locality":
                    errors.append(f"generator: metro city {city} is not a city")
                for k, ln in enumerate(system.get("lines", []), 1):
                    if self.divisions.get(ln.get("district"), {}).get("parent") != city:
                        errors.append(f"generator: metro line {k} of {city}: district {ln.get('district')} is not in that city")
                    if ln.get("axis") not in (0, 1):
                        errors.append(f"generator: metro line {k} of {city}: axis must be 0 or 1")
                    for end in ("from", "to"):
                        if end in ln and ln[end] not in self.places:
                            errors.append(f"generator: metro line {k} of {city}: {end} {ln[end]} is not a place")
            sp = gen.get("streets", {})
            for cid in sp.get("cities", []):
                if self.divisions.get(cid, {}).get("subtype") != "locality":
                    errors.append(f"generator: streets city {cid} is not a city")
            for did, cfg in sp.get("districts", {}).items():
                if self.divisions.get(did, {}).get("subtype") != "borough":
                    errors.append(f"generator: streets district {did} is not a district")
                if cfg.get("style", "mixed") not in STREET_STYLES:
                    errors.append(f"generator: streets district {did}: style must be one of {', '.join(STREET_STYLES)}")
                for k, f in (cfg.get("mix") or {}).items():
                    if k not in BUILDING_MIX_KEYS or not isinstance(f, (int, float)) or f < 0:
                        errors.append(f"generator: streets district {did}: mix {k} must be one of "
                                      f"{', '.join(BUILDING_MIX_KEYS)} with a factor >= 0")
            for nm in sp.get("named", []):
                if self.divisions.get(nm.get("district"), {}).get("subtype") != "borough":
                    errors.append(f"generator: named street {nm.get('names', {}).get('zh')}: {nm.get('district')} is not a district")
        return errors
