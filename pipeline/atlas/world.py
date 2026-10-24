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
        self.generators = [_load(p) for p in sorted((root / "generator").glob("*.yaml"))]

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

    def children(self, parent_id: str) -> list[dict]:
        return [d for d in self.divisions.values() if d.get("parent") == parent_id]

    def ancestors(self, entity_id: str) -> list[str]:
        chain, cur = [], self.entities[entity_id].get("parent")
        while cur:
            chain.append(cur)
            cur = self.entities[cur].get("parent")
        return chain

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
            if admin:
                if admin in codes:
                    errors.append(f"{did}: admin code {admin} already used by {codes[admin]}")
                codes[admin] = did
                parent_admin = parent.get("codes", {}).get("admin")
                if parent_admin and not admin.startswith(parent_admin):
                    errors.append(f"{did}: admin code {admin} does not extend parent code {parent_admin}")
            kids = self.children(did)
            if kids and d.get("area_km2"):
                total = sum(k.get("area_km2", 0) for k in kids)
                if abs(total - d["area_km2"]) > 0.5:
                    errors.append(f"{did}: children area {total} != {d['area_km2']}")
            if kids and d.get("population"):
                total = sum(k.get("population", 0) for k in kids)
                if abs(total - d["population"]) > 100:
                    errors.append(f"{did}: children population {total} != {d['population']}")
        for rid, r in self.routes.items():
            for v in r.get("via", []):
                if v not in self.divisions:
                    errors.append(f"{rid}: via {v} is not a division")
        for gen in self.generators:
            layout = gen.get("layout", {})
            for key in list(layout.get("cities", {})) + list(layout.get("districts", {})):
                if key not in self.divisions:
                    errors.append(f"generator: unknown division {key}")
            for r in gen.get("terrain", {}).get("ridges", []):
                if r["feature"] not in self.features:
                    errors.append(f"generator: unknown feature {r['feature']}")
        return errors
