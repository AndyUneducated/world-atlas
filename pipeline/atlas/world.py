"""Loading and validating the world source files under world/."""
from __future__ import annotations

import copy
import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WORLD_DIR = ROOT / "world"

ID_PATTERN = re.compile(r"^(div|nat|rte|poi|bld|pty)_[0-9a-hjkmnp-tv-z]{6}$|^country:[A-Z]{2}$|^bloc:[a-z]+$")
# Name languages, as NAME_LANGS in src/lib/types.ts: Chinese and English are required, the conlangs optional.
NAME_LANGS = ("zh", "en", "art-x-viking", "art-x-buckham", "art-x-tavrunaq", "art-x-ivuran", "es", "art-x-ranova", "art-x-kasiri")
REQUIRED_LANGS, CONLANGS = NAME_LANGS[:2], NAME_LANGS[2:]
DIVISION_SUBTYPES = ("country", "dependency", "region", "locality", "borough")
# Division codes (GB/T 2260): six digits, of which a territory uses the first two, a city four
# and a district all six; the rest are zeros (900000 → 900100 → 900101).
CODE_DIGITS = {"dependency": 2, "locality": 4, "borough": 6}
ROLE_DIGITS = {"nation": 2, "city": 4}  # a region's nations are numbered like territories, their cities like cities


def code_digits(d: dict) -> int | None:
    """How many leading digits of a division's admin code are its own; the rest are zero."""
    return ROLE_DIGITS.get(d.get("role"), CODE_DIGITS.get(d.get("subtype")))

# Landmark footprint templates (see pipeline/atlas/buildings.py); the last five are transport facilities.
MILITARY_VARIANTS = {  # military and space facility layouts and the kinds each draws (first is the default)
    "airbase": ("fighter", "heavy", "uav", "school"), "radar": ("dome", "array", "domes"), "antenna": ("small", "large"),
    "sam": (), "range": ("air", "armor", "cold"), "plant": ("depot", "assembly", "propellant", "tunnel", "hangar", "engine"),
    "test_stand": (), "silo": (), "bunker": (), "launch_track": (), "camp": ("barracks", "hq", "hospital", "training"), "heliport": (),
}
SITE_VARIANTS = {**MILITARY_VARIANTS, "estate": ("villa", "compound", "bunker"), "vineyard": ("red", "white"),
                 "fab": ("logic", "memory", "packaging", "mask"), "works": ("plates", "winery", "recycling", "tissue", "brewery", "garage"),
                 "zoo": ("primates", "felids", "ungulates", "marine_mammals", "polar", "birds", "reptiles", "amphibians",
                         "freshwater", "marine", "insects", "arachnids", "cephalopods", "coral"),
                 "triangle": ("hollow", "mountain"), "retail": ("supermarket", "mall", "fuel"), "apartments": (),
                 "lido": (), "breeze": (), "square": ("round", "square"), "fashion": ("studio", "fitting", "show"), "chip": (),
                 "brewhouse": ("pilsner", "wheat", "ipa", "stout", "abbey", "sour"), "orchard": ("durian",), "spine": (), "camera": (),
                 "armoury": (), "shooting": (), "chair": (), "dronetower": (), "refugee": ()}
SITE_LAYOUTS = ("complex", "hall", "courtyard", "slab", "lshape", "block", "campus", "ring", "stadium", "tower", "dome", "park", "plaza", "market",
                "airport", "port", "harbour", "offshore_port", "spaceport", "mine", *SITE_VARIANTS, "detention", "checkpoint", "racetrack", "clinic")
FACILITY_LAYOUTS = ("airport", "port", "harbour", "offshore_port", "spaceport", "mine", *SITE_VARIANTS, "detention", "checkpoint", "racetrack", "clinic")
RUNWAY_LAYOUTS = ("airport", "spaceport", "airbase", "launch_track", "racetrack")  # roads and railways go round these
COASTAL_LAYOUTS = ("port", "harbour")  # sites centred on the shore
HARBOUR_TERMINALS = ("container", "bulk", "oil", "roro")
RAIL_NETWORKS = ("intercity_rail", "freight_rail")
# Lines whose cards carry a construction background, and who runs them (operators in the territory record).
BACKGROUND_NETWORKS = ("national_expressway", "territorial_expressway", "territorial_highway", "intercity_rail", "freight_rail")
OPERATOR_KINDS = ("expressway", "highway", "rail")
# Card text, traits and flags: no region build reads them, so they stay out of a region's cache key and
# build.py takes them from the sources after the regions are merged.
TEXT_KEYS = ("notes", "background", "motto", "military", "traits", "wonder", "flag", "flag_notes", "climate_notes", "nation", "bloc",
             "symbols", "facts", "religion")
# A territory's or city's emblems (symbols:), and a territory's basic facts (facts:).
LOCAL_SYMBOLS = ("anthem", "flower", "tree", "animal", "bird")
LOCAL_FACTS = ("calling_code", "time_zone", "driving")
# A wonder on a line is one of its built structures (named in the build); elsewhere it is the entity itself.
WONDER_STRUCTURES = ("bridge", "tunnel", "snow_shed")
TRAIT_KEYS = ("industries", "heritage", "age", "income", "ethnicity")
ROUTE_SHIELDS = ("crest", "maritime", "polar", "tropic", "spade")  # territorial route shield designs, see src/lib/shields.ts
FLAGS = ("north_viking", "viking_islands", "arctic_ocean", "everlong_summer", "california")  # territory flag designs, see src/lib/flags.tsx


def ts_names(file: str, const: str) -> tuple[str, ...]:
    """The keys of an object literal (or the strings of an array) declared as `const` in src/lib/<file>."""
    src = (ROOT / "src" / "lib" / file).read_text(encoding="utf-8")
    block = re.split(rf"(?:export )?const {const}\b", src, maxsplit=1)[1].split("\n};", 1)[0].split("] as const", 1)[0]
    return tuple(re.findall(r'^  (\w+):', block, flags=re.M)) or tuple(re.findall(r'"(\w+)"', block))


# City flags: the layouts in src/lib/cityFlags.tsx and the charges in src/lib/charges.tsx and emblems.tsx.
FLAG_LAYOUTS = ts_names("cityFlags.tsx", "FLAG_LAYOUTS")
# Flags of the nations of a region (role: nation), each its own drawing in src/lib/nationFlags.tsx.
NATION_FLAGS = ts_names("nationFlags.tsx", "NATION_FLAGS")
# A state's card block (nation: in a region's nation, a government in exile or a country): kinds of state and the facts it lists.
NATION_KEYS = ("exile", "ideology", "government", "head", "power", "bloc", "bloc_role", "recognition", "executive", "legislature", "judiciary", "military", "wars",
               "allies", "rivals", "backers", "religion", "freedom", "refugees", "symbols", "facts", "heir", "predecessors", "offices",
               "culture", "travel", "name_langs")
FLAG_CHARGES = ts_names("emblems.tsx", "MOTIFS") + ts_names("charges.tsx", "NEW") + ts_names("charges.tsx", "CALIFORNIA")
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
POLITICS_SYSTEMS = ("mmp", "fptp", "pr_reserved", "pr_regional", "top_two")
# a party's place on the scales of expert party surveys, 0 to 10: economic left to right, social
# green-alternative-libertarian to traditional-authoritarian-nationalist, the territory's self-rule to
# the centre's, and ecology to growth
PARTY_AXES = ("econ", "galtan", "autonomy", "green")
PARTY_ORGANISATION = ("newspaper", "think_tank", "unions", "women")
# where a party stands at home: leads the government, sits in it, is a licensed partner of the ruling party,
# holds the majority in a parliament that forms no government, opposes it, or holds no seats
PARTY_STANDINGS = ("lead", "coalition", "allied", "majority", "opposition", "extra")
STREET_STYLES = ("planned", "mixed", "organic")
BUILDING_MIX_KEYS = ("slabs", "towers", "perimeter", "houses", "podium", "industrial", "civic", "park")
# Landforms the generator detects and names by location (see pipeline/atlas/coast.py).
DETECT_KINDS = ("island", "bay", "fjord", "cape", "strait", "estuary", "river", "peak", "pass", "glacier")


def _load(path: Path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in over.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


class ValidationError(Exception):
    pass


class World:
    def __init__(self, root: Path = WORLD_DIR):
        self.root = root
        self.planet = _load(root / "planet.yaml")["planet"]
        self.entities: dict[str, dict] = {}
        self.countries = self._collect(root / "registry", "countries")
        self.blocs = self._collect(root / "registry", "blocs")
        self.divisions = self._collect(root / "divisions", "divisions")
        self.features = self._collect(root / "features", "features")
        self.routes = self._collect(root / "transport", "routes")
        self.railways = self._collect(root / "transport", "railways")
        self.places = self._collect(root / "places", "places")
        # A region's features live in world/features/<generator file name>-*.yaml.
        # Each generator is merged over the settings every territory shares (world/generator/_defaults.yaml).
        defaults = _load(root / "generator" / "_defaults.yaml")
        self.generators = [{**_merge(defaults, _load(p)), "_region": p.stem}
                           for p in sorted((root / "generator").glob("*.yaml")) if not p.stem.startswith("_")]
        eng = root / "transport" / "engineering.yaml"
        self.engineering: dict = _load(eng) if eng.exists() else {}
        econ = root / "economy.yaml"
        self.economy: dict = _load(econ) if econ.exists() else {}
        clim = root / "climate.yaml"
        self.climate: dict = _load(clim) if clim.exists() else {}
        pol = root / "politics.yaml"
        self.politics: dict = _load(pol) if pol.exists() else {}

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

    @staticmethod
    def _flag_errors(d: dict) -> list[str]:
        """A city flag names a known layout, #RRGGBB tinctures and known charges."""
        f = d.get("flag")
        if not isinstance(f, dict):
            return ["missing: a city flag gives at least a layout and its colours"]
        out = []
        if f.get("layout") not in FLAG_LAYOUTS:
            out.append(f"layout {f.get('layout')!r} is not one of {', '.join(FLAG_LAYOUTS)}")
        colours = [*(f.get("colors") or []), *(f[k] for k in ("charge_color", "outline") if k in f), *(x.get("color") for x in f.get("extra", []))]
        if not f.get("colors") or not all(HEX.match(str(c)) for c in colours):
            out.append("colours must be #RRGGBB")
        for name in [f.get("charge"), *(x.get("charge") for x in f.get("extra", []))]:
            if name is not None and name not in FLAG_CHARGES:
                out.append(f"charge {name!r} is not drawn in src/lib/charges.tsx or emblems.tsx")
        if "legend" in f and not d["names"].get(f["legend"]):
            out.append(f"legend language {f['legend']} has no name to write")
        return out

    def _local_errors(self, d: dict) -> list[str]:
        """A territory's or city's emblems, and a territory's calling code, time zone, driving side and faiths."""
        both = lambda v: isinstance(v, dict) and all(v.get(lang) for lang in REQUIRED_LANGS)
        out = []
        s = d.get("symbols", {})
        if not isinstance(s, dict) or set(s) - set(LOCAL_SYMBOLS) or not all(both(v) for v in s.values()):
            out.append(f"symbols name any of {', '.join(LOCAL_SYMBOLS)} (zh, en)")
        f = d.get("facts", {})
        if not isinstance(f, dict) or set(f) - set(LOCAL_FACTS) or d["subtype"] != "dependency" and f \
                or not all(isinstance(f[k], str) for k in ("calling_code", "time_zone") if k in f) or f.get("driving", "right") not in ("left", "right"):
            out.append("a territory's facts may give calling_code, time_zone and driving (left, right)")
        rel = d.get("religion")
        if rel is not None and (d["subtype"] != "dependency" or not all(both(r.get("names")) and isinstance(r.get("share"), (int, float)) for r in rel)
                                or abs(sum(r["share"] for r in rel) - 100) > 0.5):
            out.append("a territory's religion lists faiths (names zh, en) with shares adding up to 100")
        return out

    def _nation_errors(self, d: dict) -> list[str]:
        """A state's card block, the same for a region's nations, a government in exile and a country: what kind
        of state it is, who holds power, its bloc, armed forces, wars, faiths, freedoms, refugees, symbols and
        facts, each text in zh and en; and a card's worth of notes."""
        n = d.get("nation")
        if not isinstance(n, dict):
            return ["a nation needs its card block (nation:)"]
        out = []
        both = lambda v: isinstance(v, dict) and all(v.get(lang) for lang in REQUIRED_LANGS)
        if extra := set(n) - set(NATION_KEYS):
            out.append(f"nation: unknown keys {', '.join(sorted(extra))}")
        if len(d.get("notes", {}).get("zh", "")) < 500:
            out.append("a nation's card (notes.zh) needs at least 500 characters")
        if not (n.get("ideology") and all(both(x) for x in n["ideology"])) or not both(n.get("government")) or not both(n.get("power")):
            out.append("nation: ideology (tags), government and power need zh and en")
        if (exile := n.get("exile")) is not None and not (both(exile.get("names")) and exile.get("seat") in self.divisions):
            out.append("nation: a government in exile gives its state's names (zh, en) and its seat (a division id)")
        if (exile is not None) != (d.get("role") == "region"):
            out.append("nation: only a region's card block is a government in exile (exile:)")
        head = n.get("head", {})
        if not (both(head.get("title")) and both(head.get("name"))):
            out.append("nation: head gives the head of state's title and name (zh, en)")
        if n.get("bloc") is not None and n["bloc"] not in self.blocs:
            out.append(f"nation: bloc {n['bloc']} is not in world/registry/blocs.yaml")
        if not isinstance(n.get("recognition"), int):
            out.append("nation: recognition is how many of the region's states recognise it (a whole number)")
        mil = n.get("military", {})
        if not (isinstance(mil.get("active"), int) and isinstance(mil.get("reserve"), int) and mil.get("strength") in (1, 2, 3, 4, 5)
                and all(both(x) for x in mil.get("branches", [None])) and both(mil.get("equipment"))):
            out.append("nation: military gives active and reserve personnel, strength 1–5, branches and equipment (zh, en)")
        for w in n.get("wars", []):
            if not (both(w.get("names")) and both(w.get("role")) and w.get("status") in ("active", "ceasefire", "frozen", "ended")):
                out.append("nation: each war has names, the nation's role (zh, en) and a status: active, ceasefire, frozen or ended")
        for rel in ("allies", "rivals", "backers"):
            if bad := [x for x in n.get(rel, []) if x not in self.entities]:
                out.append(f"nation: unknown {rel} {', '.join(bad)}")
        none = lambda b: both(b.get("none")) and len(b) == 1
        elected = d["id"] in self.politics.get("legislatures", {})
        if elected and {"executive", "legislature", "judiciary"} & set(n):
            out.append("nation: a nation with an elected legislature in world/politics.yaml gives its government there")
        if not elected:
            leg = n.get("legislature", {})
            groups = leg.get("groups", [])
            if not none(leg) and not (both(leg.get("names")) and isinstance(leg.get("seats"), int) and groups
                    and all(both(g.get("names")) and isinstance(g.get("seats"), int) and HEX.match(str(g.get("color", ""))) for g in groups)
                    and sum(g["seats"] for g in groups) == leg["seats"]):
                out.append("nation: a fixed legislature has names, seats and groups (names, seats, color) filling them, or none (zh, en)")
            ex = n.get("executive", {})
            if not none(ex) and not (both(ex.get("names")) and all(both(m) for m in ex.get("ministries", []))
                                     and all(both(ex[k].get("title")) and both(ex[k].get("name", ex[k].get("title"))) for k in ("head", "deputy") if k in ex)
                                     and both(ex.get("notes", ex.get("names"))) and set(ex) <= {"names", "head", "deputy", "ministries", "notes"}):
                out.append("nation: executive gives names and ministries (zh, en), and may give head and deputy (title, name) and notes; or none")
            ju = n.get("judiciary", {})
            if not none(ju) and not (all(both(ju.get(k)) for k in ("names", "title", "law")) and isinstance(ju.get("judges"), int)
                                     and 1 <= ju["judges"] <= 15 and both(ju.get("notes", ju.get("law"))) and set(ju) <= {"names", "title", "law", "judges", "notes"}):
                out.append("nation: judiciary gives names, title, law (zh, en) and 1 to 15 judges, and may give notes; or none")
        if not all(isinstance(o, dict) and set(o) <= {"names", "title", "name"} and both(o.get("names")) and both(o.get("title"))
                   and both(o.get("name", o.get("title"))) for o in n.get("offices", [])):
            out.append("nation: each office gives names and its holder's title (zh, en), and may name the holder; otherwise one is drawn")
        c = n.get("culture", {})
        if not isinstance(c, dict) or set(c) - {"holiday", "dish", "sport"} or not all(both(v) for v in c.values()):
            out.append("nation: culture may name the holiday, dish and sport (zh, en)")
        if (tr := n.get("travel")) is not None and not (isinstance(tr, dict) and tr.get("level") in (1, 2, 3, 4) and both(tr.get("note")) and len(tr) == 2):
            out.append("nation: travel gives the advice level (1 normal precautions to 4 do not travel) and a note (zh, en)")
        pools = self.politics.get("names", {}) | self.politics.get("local_names", {}).get(d["id"], {})
        if (nl := n.get("name_langs")) is not None and not (isinstance(nl, dict) and nl and all(
                lg in pools and isinstance(v, (int, float)) and v > 0 for lg, v in nl.items())):
            out.append("nation: name_langs gives the languages its officeholders are named in (with shares), each with a name pool")
        people = ([n["heir"]] if "heir" in n else []) + n.get("predecessors", [])
        if not all(isinstance(p, dict) and both(p.get("title")) and both(p.get("name")) and both(p.get("note", p.get("name"))) for p in people):
            out.append("nation: the heir and each predecessor give a title and name, and a predecessor may give a note (zh, en)")
        rel = n.get("religion", [])
        if not rel or not all(both(r.get("names")) and isinstance(r.get("share"), (int, float)) for r in rel) or abs(sum(r["share"] for r in rel) - 100) > 0.5:
            out.append("nation: religion lists faiths (names zh, en) with shares adding up to 100")
        fr = n.get("freedom", {"political": 0, "civil": 0, "press": 0, "economic": 0} if exile is not None else {})  # an exile government rules no one
        if set(fr) != {"political", "civil", "press", "economic"} or not all(isinstance(v, int) and 0 <= v <= 100 for v in fr.values()):
            out.append("nation: freedom scores political, civil, press and economic, each 0–100")
        ref = n.get("refugees", {})
        if not (isinstance(ref.get("hosted"), int) and isinstance(ref.get("abroad"), int)):
            out.append("nation: refugees gives hosted and abroad (whole numbers)")
        if not all(both(n.get("symbols", {}).get(k)) for k in ("anthem", "flower", "animal")):
            out.append("nation: symbols name the anthem, flower and animal (zh, en)")
        f = n.get("facts", {})
        if not (both(f.get("currency")) and f.get("driving") in ("left", "right")
                and all(isinstance(f.get(k), str) for k in ("currency_code", "time_zone", "calling_code", "tld"))):
            out.append("nation: facts give currency (zh, en), currency_code, time_zone, calling_code, tld and driving (left, right)")
        if not all(isinstance(f[k], (int, float)) and 0 <= f[k] <= 100 for k in ("gini", "unemployment", "inflation", "literacy") if k in f):
            out.append("nation: facts may give gini, unemployment, inflation (%) and literacy (%), each a number from 0 to 100")
        return out

    def _trait_errors(self, traits: dict) -> list[str]:
        """A division's or country's traits name known industries, heritage, age and ethnicity."""
        econ, out = self.economy, []
        if extra := set(traits) - set(TRAIT_KEYS):
            out.append(f"unknown traits {', '.join(sorted(extra))} (use {', '.join(TRAIT_KEYS)})")
        if bad := [i for i in traits.get("industries", []) if i not in econ.get("industries", {})]:
            out.append(f"industries {', '.join(bad)} not in world/economy.yaml")
        for key, table in (("heritage", "heritage"), ("age", "age")):
            if key in traits and traits[key] not in econ.get(table, {}):
                out.append(f"{key} {traits[key]} not in world/economy.yaml")
        if "ethnicity" in traits and traits["ethnicity"] not in econ.get("ethnicity", {}).get("profiles", {}):
            out.append(f"ethnicity {traits['ethnicity']} not in world/economy.yaml")
        return out

    def _bloc_errors(self) -> list[str]:
        out = []
        for bid, b in self.blocs.items():
            if len(b.get("notes", {}).get("zh", "")) < 500 or not b.get("notes", {}).get("en"):
                out.append(f"{bid}: a bloc's card (notes) needs zh of at least 500 characters, and en")
            if not HEX.match(str(b.get("color", ""))):
                out.append(f"{bid}: color must be #RRGGBB")
            members = [did for did, d in self.divisions.items() if d.get("nation", {}).get("bloc") == bid]
            if b.get("leader") not in members:
                out.append(f"{bid}: leader must be one of its member nations")
            if not all(isinstance(b.get(k), dict) and all(b[k].get(lang) for lang in REQUIRED_LANGS) for k in ("short_names", "motto", "doctrine")):
                out.append(f"{bid}: short_names, motto and doctrine need zh and en")
        return out

    def validate(self) -> list[str]:
        errors: list[str] = self._bloc_errors()
        for cid, c in self.countries.items():
            errors += [f"{cid}: {e}" for e in self._nation_errors(c) + self._trait_errors(c.get("traits", {}))]
            if self.economy and (missing := [k for k in ("industries", "heritage", "age") if k not in c.get("traits", {})]):
                errors.append(f"{cid}: traits need {', '.join(missing)}")
            if not all(isinstance(c.get(k), (int, float)) and c[k] > 0 for k in ("population", "area_km2")):
                errors.append(f"{cid}: a country gives its own population and area_km2, not its territories' sum")
            if self.economy and cid not in self.economy.get("base_gdp_per_capita", {}):
                errors.append(f"{cid}: a country needs its base_gdp_per_capita in world/economy.yaml")
        for eid, e in self.entities.items():
            if not ID_PATTERN.match(eid):
                errors.append(f"{eid}: malformed id")
            for lang in REQUIRED_LANGS:
                if not e.get("names", {}).get(lang):
                    errors.append(f"{eid}: missing name in '{lang}'")
            if e.get("status") not in ("canon", "draft", "generated"):
                errors.append(f"{eid}: status must be canon | draft | generated")
            if (w := e.get("wonder")) is not None:
                if not (isinstance(w, dict) and all(w.get(lang) for lang in REQUIRED_LANGS)):
                    errors.append(f"{eid}: wonder needs zh and en: what makes it the territory's wonder")
                elif "structure" in w and (w["structure"] not in WONDER_STRUCTURES or eid not in {**self.routes, **self.railways}):
                    errors.append(f"{eid}: wonder.structure is one of {', '.join(WONDER_STRUCTURES)} and only on a line")
        codes: dict[str, str] = {}
        for did, d in self.divisions.items():
            if d["subtype"] not in DIVISION_SUBTYPES:
                errors.append(f"{did}: unknown subtype {d['subtype']}")
            role = d.get("role")
            if role not in (None, "region", "nation", "city") or (role == "region") != (d["subtype"] == "dependency" and "parent" not in d) \
                    or (role == "nation" and d["subtype"] != "locality") \
                    or (role == "city") != (self.divisions.get(d.get("parent", ""), {}).get("role") == "nation"):
                errors.append(f"{did}: role region is a territory with no country above it, role nation one of its localities, "
                              "role city a borough of a nation")
            if role == "nation" or (role == "region" and "nation" in d):
                errors += [f"{did}: {e}" for e in self._nation_errors(d)]
            elif {"symbols", "facts", "religion"} & set(d):
                errors += [f"{did}: {e}" for e in self._local_errors(d)]
            parent = self.entities.get(d.get("parent"), {"codes": {}, "subtype": "country"} if role == "region" else None)
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
                level = code_digits(d)
                if not re.fullmatch(r"\d{6}", admin) or (level and admin[level:].strip("0")):
                    errors.append(f"{did}: admin code {admin} must have 6 digits, zero past the first {level}")
                parent_admin = parent.get("codes", {}).get("admin")
                parent_level = None if parent.get("role") == "region" else code_digits(parent)  # a nation's code stands alone
                if parent_admin and parent_level and not admin.startswith(parent_admin[:parent_level]):
                    errors.append(f"{did}: admin code {admin} does not extend parent code {parent_admin}")
            if d.get("route_shield", "crest") not in ROUTE_SHIELDS:
                errors.append(f"{did}: route_shield must be one of {', '.join(ROUTE_SHIELDS)}")
            if d["subtype"] == "dependency" and role != "region" and d.get("flag") not in FLAGS:
                errors.append(f"{did}: a territory needs a flag, one of {', '.join(FLAGS)}")
            if d["subtype"] == "locality":
                if not HEX.match(str(d.get("color", ""))):
                    errors.append(f"{did}: a city needs a colour (#RRGGBB) for its map tint and card accents")
                if role == "nation":
                    if d.get("flag") not in NATION_FLAGS:
                        errors.append(f"{did}: a nation's flag is one of the drawings in src/lib/nationFlags.tsx")
                else:
                    errors += [f"{did}: flag {e}" for e in self._flag_errors(d)]
            if d["subtype"] in ("dependency", "locality") and role != "region" and not all(d.get("flag_notes", {}).get(lang) for lang in REQUIRED_LANGS):
                errors.append(f"{did}: a flag needs flag_notes (zh, en): what its colours and charges stand for")
            kids = self.children(did)
            if kids and d.get("area_km2"):
                total = sum(k.get("area_km2", 0) for k in kids)
                if abs(total - d["area_km2"]) > 0.5:
                    errors.append(f"{did}: children area {total} != {d['area_km2']}")
            if kids and d.get("population"):
                total = sum(k.get("population", 0) for k in kids)
                if abs(total - d["population"]) > 100:
                    errors.append(f"{did}: children population {total} != {d['population']}")
            errors += [f"{did}: {e}" for e in self._trait_errors(d.get("traits", {}))]
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
            if "build_order" in r and not (isinstance(r["build_order"], int) and r["build_order"] > 0):
                errors.append(f"{rid}: build_order must be a positive whole number")
            if "unlimited" in r and r["unlimited"] is not True:
                errors.append(f"{rid}: unlimited takes only true (no speed limit anywhere, towns and mountains included)")
            if r.get("ring") and len(r.get("via", [])) < 3:
                errors.append(f"{rid}: a ring needs at least three via divisions")
            for v in r.get("legs", {}):
                if v not in r.get("via", []):
                    errors.append(f"{rid}: legs entry {v} is not one of the via divisions")
            if line := r.get("line"):
                pts = line.get("points")
                if not (isinstance(pts, list) and len(pts) >= 2 and all(isinstance(p, list) and len(p) == 2 for p in pts)):
                    errors.append(f"{rid}: line.points is a polyline [[x, y], …] in design km")
                via = r.get("via", [])
                ends = [via.index(line[k]) if line.get(k) in via else None for k in ("from", "to") if k in line]
                if None in ends or ends != sorted(set(ends)):
                    errors.append(f"{rid}: line.from and line.to name via stops, from before to")
            for kind, names in r.get("structure_names", {}).items():
                if kind not in ("bridge", "tunnel") or not all(names.get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"{rid}: structure_names gives the longest bridge or tunnel its names (zh, en)")
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
            if "at" in p and ("offset_km" in p or not (isinstance(p["at"], list) and len(p["at"]) == 2
                                                       and all(isinstance(v, (int, float)) for v in p["at"]))):
                errors.append(f"{pid}: at is a fixed spot [x, y] (design km) and replaces offset_km")
            if "short_names" in p and not (isinstance(p["short_names"], dict) and p["short_names"].get("zh") and p["short_names"].get("en")):
                errors.append(f"{pid}: short_names (the map label; the card shows the full names) needs zh and en")
            if p.get("subtype") == "government" and "short_names" in p and len(p.get("notes", {}).get("zh", "")) < 100:
                errors.append(f"{pid}: a government institution's card (notes.zh) needs at least 100 characters")
            if "access_road" in p and not (p["access_road"] is False and p.get("site")):
                errors.append(f"{pid}: access_road takes only false, on a sited facility with no road by design "
                              "(any other sited facility off the network gets one)")
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
                if not (isinstance(size, list) and len(size) == 2 and all(isinstance(v, (int, float)) and v > 0 for v in size)):
                    errors.append(f"{pid}: site size_m must be [along, across] in metres, both positive")
                if "variant" in site and site["variant"] not in SITE_VARIANTS.get(site.get("layout"), ()):
                    errors.append(f"{pid}: site variant must be one of {', '.join(SITE_VARIANTS.get(site.get('layout'), ())) or 'none for this layout'}")
                if "angle_deg" in site and not isinstance(site["angle_deg"], (int, float)):
                    errors.append(f"{pid}: site angle_deg must be a number (degrees, east = 0, counter-clockwise)")
                if site.get("rural", True) is not True:
                    errors.append(f"{pid}: site rural is either true (deliberately out of town) or left out")
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
                if self.divisions.get(v, {}).get("subtype") not in ("locality", "borough") and not self.places.get(v, {}).get("site"):
                    errors.append(f"{rid}: via {v} is not a city, district or a place with a site")
            if line := r.get("line"):
                pts = line.get("points")
                if not r.get("maglev") or not (isinstance(pts, list) and len(pts) >= 2 and all(isinstance(p, list) and len(p) == 2 for p in pts)):
                    errors.append(f"{rid}: line.points ([[x, y], …] in design km) is for a maglev, on its own guideway")
            for v in r.get("station_names", {}):
                if v not in via:
                    errors.append(f"{rid}: station_names entry {v} is not one of the stops")
            if r.get("color") and not re.match(r"^#[0-9A-Fa-f]{6}$", str(r["color"])):
                errors.append(f"{rid}: color must be #RRGGBB")
            if "maglev" in r and (r["maglev"] is not True or r.get("network") != "intercity_rail"):
                errors.append(f"{rid}: maglev: true is for intercity railways only")
            speed = r.get("tech", {}).get("operating_speed_kmh")
            if speed is not None and not (isinstance(speed, int) and speed > 0):
                errors.append(f"{rid}: tech.operating_speed_kmh must be a positive whole number of km/h")
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
            def ring(path):
                return isinstance(path, list) and len(path) >= 3 and all(isinstance(p, list) and len(p) == 2 for p in path)

            for did, z in layout.get("zones", {}).items():
                if did not in self.divisions or not layout.get("anchored"):
                    errors.append(f"generator: zone of {did}: not a division, or the layout is not anchored")
                elif isinstance(z, dict):
                    if (not ring(z.get("path")) or not all(ring(h) for h in z.get("holes", []))
                            or set(z) - {"path", "holes", "exact", "whole"}):
                        errors.append(f"generator: zone of {did} must be {{path, holes, exact, whole}} with polygons [[x, y], …]")
                elif not ring(z):
                    errors.append(f"generator: zone of {did} must be a polygon [[x, y], …] (design km)")
            for did in layout.get("added_districts", []):
                if self.divisions.get(did, {}).get("subtype") != "borough":
                    errors.append(f"generator: added district {did} is not a district")
            for did, at in layout.get("centres", {}).items():
                if self.divisions.get(did, {}).get("subtype") != "borough":
                    errors.append(f"generator: centre of {did}: not a district")
                elif not (isinstance(at, list) and len(at) == 2 and all(isinstance(v, (int, float)) for v in at)):
                    errors.append(f"generator: centre of {did} must be [x, y] (design km)")
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
            if sp and not isinstance(sp.get("core_people_per_km2"), (int, float)):
                errors.append("generator: streets needs core_people_per_km2: residents per km² of a district's "
                              "core zone with local streets and buildings")
            for did, cfg in sp.get("districts", {}).items():
                if self.divisions.get(did, {}).get("subtype") != "borough":
                    errors.append(f"generator: streets district {did} is not a district")
                want = cfg.get("detail_km2", 0)
                if want != "full" and (not isinstance(want, (int, float)) or want < 0):
                    errors.append(f"generator: streets district {did}: detail_km2 must be km² >= 0 or full")
                if cfg.get("style", "mixed") not in STREET_STYLES:
                    errors.append(f"generator: streets district {did}: style must be one of {', '.join(STREET_STYLES)}")
                for k, f in (cfg.get("mix") or {}).items():
                    if k not in BUILDING_MIX_KEYS or not isinstance(f, (int, float)) or f < 0:
                        errors.append(f"generator: streets district {did}: mix {k} must be one of "
                                      f"{', '.join(BUILDING_MIX_KEYS)} with a factor >= 0")
            for nm in sp.get("named", []):
                if self.divisions.get(nm.get("district"), {}).get("subtype") != "borough":
                    errors.append(f"generator: named street {nm.get('names', {}).get('zh')}: {nm.get('district')} is not a district")
        return errors + self._politics_errors()

    def _politics_errors(self) -> list[str]:
        """world/politics.yaml: every legislature in a territory with a known system, every party with a flag,
        a place on the spectrum, targets only where there is a legislature and a card's worth of text."""
        pol = self.politics
        if not pol:
            return []
        errors: list[str] = []
        legs = pol.get("legislatures", {})
        for tid, leg in legs.items():
            if self.divisions.get(tid, {}).get("subtype") != "dependency" and self.divisions.get(tid, {}).get("role") != "nation":
                errors.append(f"politics: legislature {tid} is not a territory or a nation")
            if self.divisions.get(tid, {}).get("role") == "nation" and leg.get("councils"):
                errors.append(f"politics: {tid}: a nation's cities have no councils of their own")
            if leg.get("system") not in POLITICS_SYSTEMS:
                errors.append(f"politics: {tid}: system must be one of {', '.join(POLITICS_SYSTEMS)}")
            court = leg.get("court", {})
            elected = leg.get("executive") == "elected"
            upper = leg.get("upper")
            offices = (("governor", leg.get("governor")), ("minority", leg.get("minority"))) if elected else \
                (*((("governor", leg.get("governor")), ("governor_name", leg.get("governor_name"))) if "governor" in leg or "governor_name" in leg else ()),
                 ("premier", leg.get("premier")))
            for k, v in (("names", leg.get("names")), *offices, ("speaker", leg.get("speaker")), ("mayor", leg.get("mayor")),
                         ("court names", court.get("names")), ("court title", court.get("title")),
                         *((("notes", leg["notes"]),) if "notes" in leg else ()),
                         *((("upper names", upper.get("names")), ("upper speaker", upper.get("speaker"))) if upper else ())):
                if not all((v or {}).get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"politics: {tid}: {k} needs zh and en")
            if leg.get("executive", "appointed") not in ("appointed", "elected"):
                errors.append(f"politics: {tid}: executive is appointed (a premier from the parliament) or elected (a governor by the voters)")
            if upper and not (isinstance(upper.get("seats"), int) and upper["seats"] > 0 and elected):
                errors.append(f"politics: {tid}: an upper chamber has a number of seats, under an elected executive")
            known = {m.get("id") for m in pol.get("ministries", [])}
            for mid, names in leg.get("ministries", {}).items():
                if mid not in known or not all(names.get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"politics: {tid}: ministry {mid} renames a known ministry, in zh and en")
            for k, v in [*((k, leg[k]) for k in ("deputy", "deputy_mayor") if k in leg), *(("deputy_speakers", v) for v in leg.get("deputy_speakers", []))]:
                if not all(v.get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"politics: {tid}: {k} needs zh and en")
            if not all((a.get(k) or {}).get(lang) for a in leg.get("agencies", []) for k in ("names", "title") for lang in REQUIRED_LANGS):
                errors.append(f"politics: {tid}: each agency has names and its head's title, in zh and en")
            if "law" in court and not all(court["law"].get(lang) for lang in REQUIRED_LANGS):
                errors.append(f"politics: {tid}: court law needs zh and en")
            if not (isinstance(court.get("judges"), int) and 6 <= court["judges"] <= 12):
                errors.append(f"politics: {tid}: the court has 6 to 12 judges, the chief justice among them")
            if sum(court.get("tongues", {}).values()) >= court.get("judges", 0):
                errors.append(f"politics: {tid}: court tongues name fewer judges than the court has, besides the chief justice")
            for cid, c in leg.get("councils", {}).items():
                if self.divisions.get(cid, {}).get("parent") != tid:
                    errors.append(f"politics: {tid}: council {cid} is not a city of the territory")
                if "lead" in c and c["lead"] not in {p.get("id") for p in pol.get("parties", [])}:
                    errors.append(f"politics: {cid}: lead {c['lead']} is not a party")
                if c.get("type", "council") not in pol.get("council_types", {}):
                    errors.append(f"politics: {cid}: council type {c.get('type')} is not in council_types")
                for k in ("names", "mayor", "deputy_mayor", "speaker", "notes"):
                    if k in c and not all(c[k].get(lang) for lang in REQUIRED_LANGS):
                        errors.append(f"politics: {cid}: {k} needs zh and en")
                if "constituencies" in c:
                    inside = sorted(d for ds in c["constituencies"].values() for d in ds)
                    if leg.get("system") != "pr_regional" or inside != sorted(d for d, v in self.divisions.items() if v.get("parent") == cid):
                        errors.append(f"politics: {cid}: constituencies are for pr_regional and take in each of the city's districts once")
        mins = pol.get("ministries", [])
        if not mins or len({m.get("id") for m in mins}) != len(mins):
            errors.append("politics: ministries lists each ministry once, with an id")
        for m in mins:
            if not all(m.get("names", {}).get(lang) for lang in REQUIRED_LANGS):
                errors.append(f"politics: ministry {m.get('id')}: names need zh and en")
            if set(m.get("lean", {})) - set(PARTY_AXES) or not 0 <= m.get("nonpartisan", 0) < 1:
                errors.append(f"politics: ministry {m.get('id')}: lean is on {', '.join(PARTY_AXES)}; nonpartisan odds below 1")
        for k, ct in pol.get("council_types", {}).items():
            if not all(ct.get(f, {}).get(lang) for f in ("names", "speaker") for lang in REQUIRED_LANGS):
                errors.append(f"politics: council type {k}: names and speaker need zh and en")
        ids = set()
        for p in pol.get("parties", []):
            pid = p.get("id", "?")
            if not ID_PATTERN.match(pid) or not pid.startswith("pty_") or pid in self.entities or pid in ids:
                errors.append(f"politics: {pid}: a party id is pty_ and unique among all ids")
            ids.add(pid)
            for k in ("names", "short_names", "family", "leader", "youth_wing", "slogan", "notes", "history", "flag_notes"):
                if not all(p.get(k, {}).get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"politics: {pid}: {k} needs zh and en")
            if not HEX.match(str(p.get("color", ""))):
                errors.append(f"politics: {pid}: color must be #RRGGBB")
            errors += [f"politics: {pid}: flag {e}" for e in self._flag_errors(p)]
            if not (isinstance(p.get("spectrum"), (int, float)) and -3 <= p["spectrum"] <= 3):
                errors.append(f"politics: {pid}: spectrum is a number from -3 (left) to 3 (right)")
            if not (isinstance(p.get("members"), int) and p["members"] > 0):
                errors.append(f"politics: {pid}: members must be a whole number")
            if seated := p.get("seated"):
                groups = self.divisions.get(seated, {}).get("nation", {}).get("legislature", {}).get("groups", [])
                if "targets" in p or self.divisions.get(seated, {}).get("role") != "nation" or sum(g.get("party") == pid for g in groups) != 1:
                    errors.append(f"politics: {pid}: a seated party is one group of a nation's fixed legislature and stands in no election")
                if p.get("standing", "lead") not in PARTY_STANDINGS:
                    errors.append(f"politics: {pid}: standing is one of {', '.join(PARTY_STANDINGS)}")
            elif "standing" in p or not p.get("targets") or set(p["targets"]) - set(legs):
                errors.append(f"politics: {pid}: targets name only territories with a legislature; its standing follows from the result")
            for k in ("legal_status", "reunification"):
                if k in p and not all(p[k].get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"politics: {pid}: {k} needs zh and en")
            if bad := [x for x in p.get("backers", []) if x not in self.entities]:
                errors.append(f"politics: {pid}: unknown backers {', '.join(bad)}")
            if "hq" in p and self.divisions.get(p["hq"], {}).get("subtype") not in ("locality", "borough"):
                errors.append(f"politics: {pid}: hq is a city or district")
            if len(p.get("policies", [])) < 3 or not all(all(x.get(lang) for lang in REQUIRED_LANGS) for x in p.get("policies", [])):
                errors.append(f"politics: {pid}: at least three policies, each in zh and en")
            if len(p.get("notes", {}).get("zh", "")) < 800:
                errors.append(f"politics: {pid}: notes.zh needs at least 800 characters: its lines, record, symbols, voters and culture")
            tags = p.get("ideology", [])
            if not (len(tags) >= 2 and all(all(x.get(lang) for lang in REQUIRED_LANGS) for x in tags)):
                errors.append(f"politics: {pid}: ideology is two or more tags, each in zh and en")
            axes = p.get("axes", {})
            if set(axes) != set(PARTY_AXES) or not all(isinstance(v, (int, float)) and 0 <= v <= 10 for v in axes.values()):
                errors.append(f"politics: {pid}: axes gives {', '.join(PARTY_AXES)}, each from 0 to 10")
            factions = p.get("factions", [])
            if not (len(factions) >= 2 and all(all(f.get(k, {}).get(lang) for k in ("names", "notes") for lang in REQUIRED_LANGS) for f in factions)):
                errors.append(f"politics: {pid}: two or more factions, each with names and notes in zh and en")
            if len(p.get("organisation", {})) < 3:
                errors.append(f"politics: {pid}: organisation names at least three of {', '.join(PARTY_ORGANISATION)}")
            for k, v in p.get("organisation", {}).items():
                if k not in PARTY_ORGANISATION or not all(v.get(lang) for lang in REQUIRED_LANGS):
                    errors.append(f"politics: {pid}: organisation {k} is one of {', '.join(PARTY_ORGANISATION)}, in zh and en")
        for p in pol.get("parties", []):
            if bad := [a for a in p.get("allies", []) if a not in ids]:
                errors.append(f"politics: {p.get('id')}: unknown allies {', '.join(bad)}")
        seated = {p.get("id"): p.get("seated") for p in pol.get("parties", [])}
        for did, d in self.divisions.items():
            for g in d.get("nation", {}).get("legislature", {}).get("groups", []):
                if "party" in g and seated.get(g["party"]) != did:
                    errors.append(f"politics: {did}: legislature group {g['names'].get('en')} names {g['party']}, which is not a party seated there")
        return errors
