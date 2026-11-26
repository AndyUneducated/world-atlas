"""The short forms a place may be written in, expanded into plain places when the world loads.

A building type (world/registry/building_types.yaml) gives a subtype and a site; a place writes `type:` and
may override any of it. A group (`groups:` in a places file) lays its members out on fixed slots from one
anchor, so a batch of like buildings takes one position and one spacing."""
from __future__ import annotations

import math

TYPE_SITE_KEYS = ("layout", "size_m", "rural", "variant")
PATTERNS = ("row", "grid", "ring")
GROUP_KEYS = {"group", "in", "type", "status", "anchor_km", "pattern", "spacing_m", "columns", "radius_m", "count", "angle_deg", "site", "members"}
MEMBER_ONLY = ("in", "offset_km", "at", "slot_km", "slot_angle_deg", "group")  # the group gives a member its position


def type_name(t: dict) -> str:
    """The name a type must carry: its parameters, so a type's size cannot change under the places that use it."""
    size = "x".join(f"{v:g}" for v in t.get("size_m") or ())
    head = t.get("subtype", "") if t.get("subtype") == t.get("layout") else f"{t.get('subtype')}_{t.get('layout')}"
    return "_".join([head, size, *([t["variant"]] if t.get("variant") else []), *(["rural"] if t.get("rural") else [])])


def expand_type(item: dict, types: dict) -> dict:
    """`item` with its type written out: the type's subtype and site, under the item's own."""
    if "type" not in item:
        return item
    t = types.get(item["type"])
    if t is None:
        raise ValueError(f"{item.get('id')}: unknown building type {item['type']!r}")
    site = {**{k: t[k] for k in TYPE_SITE_KEYS if k in t}, **(item.get("site") or {})}
    out: dict = {}
    for k, v in item.items():
        if k == "type":
            out.setdefault("subtype", t["subtype"])
        elif k == "site":
            out["site"] = site
        else:
            out[k] = v
    out.setdefault("site", site)
    return out


def slot_km(g: dict, n: int) -> list[float]:
    """Slot n of group `g`, [along, across] km from its anchor: a row along the group's direction, a grid
    filling rows of `columns`, or a ring of `count` slots round the anchor."""
    if g["pattern"] == "ring":
        a = 2 * math.pi * n / g["count"]
        x, y = g["radius_m"] * math.cos(a), g["radius_m"] * math.sin(a)
    else:
        sp = g["spacing_m"]
        sx, sy = sp if isinstance(sp, list) else (sp, sp)
        cols = g.get("columns") if g["pattern"] == "grid" else None
        x, y = (n % cols * sx, n // cols * sy) if cols else (n * sx, 0.0)
    return [round(x / 1000, 4), round(y / 1000, 4)]


def _group_errors(g: dict) -> list[str]:
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
    out = []
    if set(g) - GROUP_KEYS:
        out.append(f"unknown keys {', '.join(sorted(set(g) - GROUP_KEYS))}")
    if not (isinstance(g.get("anchor_km"), list) and len(g["anchor_km"]) == 2 and all(num(v) for v in g["anchor_km"])):
        out.append("anchor_km is slot 0 (a ring's centre), [east, north] km from the district centre")
    if g.get("pattern") not in PATTERNS:
        out.append(f"pattern is one of {', '.join(PATTERNS)}")
    elif g["pattern"] == "ring":
        if not (num(g.get("radius_m")) and g["radius_m"] > 0 and isinstance(g.get("count"), int) and g["count"] >= 2):
            out.append("a ring takes radius_m and count (the number of slots round it)")
    else:
        sp = g.get("spacing_m")
        if not (num(sp) and sp > 0 or isinstance(sp, list) and len(sp) == 2 and all(num(v) and v > 0 for v in sp)):
            out.append("spacing_m is the distance between slots in metres, or [along, across]")
        if g["pattern"] == "grid" and not (isinstance(g.get("columns"), int) and g["columns"] >= 1):
            out.append("a grid takes columns (slots per row)")
    if "angle_deg" in g and not num(g["angle_deg"]):
        out.append("angle_deg is the group's direction (degrees, east = 0); left out, it follows the street grid")
    if not (isinstance(g.get("members"), list) and g["members"]):
        out.append("members lists the places, each on its own slot")
    return out


def expand_group(g: dict, types: dict) -> list[dict]:
    """The members of group `g` as plain places: the group's district, type and status under each member's own,
    at the anchor, with the member's slot (slot_km) to be turned to the group's direction when its site is laid out."""
    name = g.get("group")
    if not (isinstance(name, str) and name):
        raise ValueError("a group needs a name (group:)")
    if errs := _group_errors(g):
        raise ValueError(f"group {name}: " + "; ".join(errs))
    out, slots = [], {}
    for m in g["members"]:
        mid, n = m.get("id"), m.get("slot")
        if not (isinstance(n, int) and not isinstance(n, bool) and n >= 0) or g["pattern"] == "ring" and n >= g["count"]:
            raise ValueError(f"group {name}: {mid}: slot is a whole number from 0" + (f" to {g['count'] - 1}" if g["pattern"] == "ring" else ""))
        if n in slots:
            raise ValueError(f"group {name}: {mid} and {slots[n]} share slot {n}")
        if bad := [k for k in MEMBER_ONLY if k in m]:
            raise ValueError(f"group {name}: {mid}: the group gives {', '.join(bad)}")
        slots[n] = mid
        item = {"id": mid}
        for k in ("type", "subtype", "status"):
            if k in m or k in g and not (k == "type" and "subtype" in m and "site" in m):
                item[k] = m.get(k, g.get(k))
        item.update({k: v for k, v in m.items() if k not in ("id", "slot", "type", "subtype", "status", "site")})
        item.update({"in": g.get("in"), "offset_km": list(g["anchor_km"]), "slot_km": slot_km(g, n), "group": name})
        site = {**({"angle_deg": g["angle_deg"]} if "angle_deg" in g else {}), **(g.get("site") or {}), **(m.get("site") or {})}
        if "angle_deg" in g:
            item["slot_angle_deg"] = g["angle_deg"]
        if site:
            item["site"] = site
        item = expand_type(item, types)
        if not item.get("site"):
            raise ValueError(f"group {name}: {mid}: a group's member needs a type (or a subtype and a site)")
        out.append(item)
    # slots too close for the sites on them
    along = max(p["site"].get("size_m", [0, 0])[0] for p in out)
    across = max(p["site"].get("size_m", [0, 0])[1] for p in out)
    if g["pattern"] == "ring":
        if 2 * g["radius_m"] * math.sin(math.pi / g["count"]) < max(along, across):
            raise ValueError(f"group {name}: the ring's slots are closer than its sites are wide ({max(along, across):g} m)")
    else:
        sp = g["spacing_m"]
        sx, sy = sp if isinstance(sp, list) else (sp, sp)
        if sx < along or g["pattern"] == "grid" and sy < across:
            raise ValueError(f"group {name}: spacing_m is less than the sites' size ({along:g} × {across:g} m)")
    return out


def expand_file(doc: dict, types: dict) -> list[dict]:
    """Every place of a places file: its `places`, then the members of its `groups`."""
    groups = doc.get("groups") or []
    names = [g.get("group") for g in groups]
    if dup := sorted({n for n in names if isinstance(n, str) and names.count(n) > 1}):
        raise ValueError(f"group {dup[0]} is written twice")
    return [expand_type(p, types) for p in doc.get("places") or []] + [p for g in groups for p in expand_group(g, types)]


def turned(slot, angle: float) -> tuple[float, float]:
    """A slot's [along, across] km as (east, north) km when the group points along `angle` (radians)."""
    return slot[0] * math.cos(angle) - slot[1] * math.sin(angle), slot[0] * math.sin(angle) + slot[1] * math.cos(angle)
