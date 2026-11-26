"""Add a batch of standard buildings in one go: ids, positions, checks, YAML.

    python pipeline/add_places.py batch.yaml            # check, then write
    python pipeline/add_places.py batch.yaml --check    # check only

The batch names a district and a building type once, then lists the places by name and text
(templates/batch/places.yaml). With `group:` they stand on the slots of a building group, new or
existing, from one anchor; without, each takes its own offset_km. `auto` for anchor_km or offset_km
takes the nearest free spot. Every place is laid out against the last build with the build's own
checks (pipeline/placecheck.py), and nothing is written unless the batch is clean."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))

import placecheck  # noqa: E402
from atlas import placeforms  # noqa: E402
from atlas.world import ROOT, WORLD_DIR, World  # noqa: E402
from new_id import mint  # noqa: E402

BATCH_KEYS = {"into", "in", "type", "status", "group", "anchor_km", "pattern", "spacing_m", "columns", "radius_m", "count", "angle_deg", "places"}
GROUP_SHAPE = ("pattern", "spacing_m", "columns", "radius_m", "count", "angle_deg")
TOP_KEY = re.compile(r"^[A-Za-z_]+:")
BARE = re.compile(r"^[A-Za-z0-9_.-]+$")


def scalar(v) -> str:
    """A value in the world files' one-line form."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return f"{v:g}" if isinstance(v, float) else str(v)
    if isinstance(v, str) and BARE.match(v) and v not in ("true", "false", "null", "auto"):
        return v
    return json.dumps(v, ensure_ascii=False)


def item_lines(item: dict, indent: int) -> list[str]:
    """A list item's lines at `indent` spaces, its first key on the dash."""
    pad = " " * indent
    return [(pad + "- " if k == 0 else pad + "  ") + f"{key}: {scalar(v)}" for k, (key, v) in enumerate(item.items())]


def section_end(lines: list[str], key: str) -> int | None:
    """The line after the last content line of top-level section `key`, or None without the section."""
    start = next((i for i, ln in enumerate(lines) if re.match(rf"^{key}:\s*(#.*)?$", ln)), None)
    if start is None:
        return None
    end = next((i for i in range(start + 1, len(lines)) if TOP_KEY.match(lines[i])), len(lines))
    while end > start + 1 and (not lines[end - 1].strip() or lines[end - 1].startswith("#")):
        end -= 1
    return end


def append_places(lines: list[str], items: list[dict]) -> None:
    end = section_end(lines, "places")
    if end is None:
        lines[:] = lines + ["places:"]
        end = len(lines)
    lines[end:end] = [ln for it in items for ln in item_lines(it, 2)]


def append_group(lines: list[str], group: dict) -> None:
    """A new group at the end of the file's groups (members last, one per item)."""
    end = section_end(lines, "groups")
    if end is None:
        while lines and not lines[-1].strip():
            lines.pop()
        lines += ["", "# Building groups: members stand on fixed slots from the anchor (DECISIONS.md, \"Building types and groups\").", "groups:"]
        end = len(lines)
    head = {k: v for k, v in group.items() if k != "members"}
    lines[end:end] = ["", *item_lines(head, 2), "    members:", *[ln for m in group["members"] for ln in item_lines(m, 6)]]


def append_members(lines: list[str], name: str, members: list[dict]) -> None:
    """New members at the end of group `name`'s block."""
    append_block(lines, name, [ln for m in members for ln in item_lines(m, 6)])


def append_block(lines: list[str], name: str, block: list[str]) -> None:
    """Member lines at the end of group `name`'s block."""
    start = next((i for i, ln in enumerate(lines) if re.match(rf"^  - group: {re.escape(name)}\s*$", ln)), None)
    if start is None:
        raise SystemExit(f"group {name}: its entry must start with '  - group: {name}'")
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("  - ") or TOP_KEY.match(lines[i])), len(lines))
    while end > start + 1 and (not lines[end - 1].strip() or lines[end - 1].lstrip().startswith("#")):
        end -= 1
    lines[end:end] = block


def raw_groups() -> dict[str, tuple[Path, dict]]:
    out = {}
    for path in sorted((WORLD_DIR / "places").glob("*.yaml")):
        for g in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("groups") or []:
            out[g.get("group")] = (path, g)
    return out


def free_slots(group: dict, taken: set[int], n: int) -> list[int]:
    limit = group["count"] if group["pattern"] == "ring" else 10**6
    out = [k for k in range(limit) if k not in taken][:n]
    if len(out) < n:
        raise SystemExit(f"group {group['group']}: the ring has {limit} slots and {len(taken)} are taken")
    return out


def checked_write(edits: dict[Path, list[str]], world: World, new_ids: list[str], write: bool) -> World:
    """Write `edits` (file: lines) into a copy of the world; validate it, make sure no other place changed and
    lay the touched districts out against the last build. Copies the files back when all is clean and `write`."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp_world = Path(tmp) / "world"
        shutil.copytree(WORLD_DIR, tmp_world)
        for path, lines in edits.items():
            (tmp_world / path.relative_to(WORLD_DIR)).write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        try:
            new = World(tmp_world)
            errors = new.validate()
        except Exception as exc:  # noqa: BLE001
            sys.exit(f"not written: {exc}")
        if errors:
            sys.exit("not written, the data does not validate:\n" + "\n".join("  · " + e for e in errors))
        strip = lambda p: {k: v for k, v in p.items() if k != "_source"}
        changed = [pid for pid, p in world.places.items() if strip(new.places.get(pid, {})) != strip(p)]
        if changed or set(new.places) - set(world.places) != set(new_ids):
            sys.exit(f"not written: the edit would also change {', '.join(changed) or 'the set of places'}")
        districts = sorted({new.places[i]["in"] for i in new_ids})
        found, missing = placecheck.check(new, districts)
        if missing:
            print("  note: the last build has no layout for " + ", ".join(missing) + "; these places are unchecked until the next build")
        if found:
            sys.exit("not written, the build would warn:\n" + "\n".join(f"  · {w}" for ws in found.values() for w in ws))
        if write:
            for path in edits:
                shutil.copyfile(tmp_world / path.relative_to(WORLD_DIR), path)
        return new


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("batch", type=Path)
    ap.add_argument("--check", action="store_true", help="check only, write nothing")
    args = ap.parse_args()
    b = yaml.safe_load(args.batch.read_text(encoding="utf-8")) or {}
    if set(b) - BATCH_KEYS:
        sys.exit(f"unknown keys: {', '.join(sorted(set(b) - BATCH_KEYS))}")
    items = b.get("places") or []
    if not items or not all(isinstance(m, dict) and isinstance(m.get("names"), dict) and m["names"].get("zh") and m["names"].get("en") for m in items):
        sys.exit("places lists the new places, each with names (zh, en)")
    world = World()
    groups = raw_groups()
    if "in" not in b and b.get("group") not in groups:
        sys.exit("in names the district (id or Chinese name)")
    did = placecheck.district_id(world, str(b.get("in") or groups[b["group"]][1]["in"]))
    types = world.building_types
    for m in [b, *items]:
        if "type" in m and m["type"] not in types:
            sys.exit(f"unknown building type {m['type']}; see world/registry/building_types.yaml")
    if b.get("group") in groups:  # members of an existing group take its type and status
        b = {**{k: groups[b["group"]][1][k] for k in ("type", "status") if k in groups[b["group"]][1]}, **b}
    if not all("type" in m or "type" in b or "subtype" in m and "site" in m for m in items):
        sys.exit("every place needs a type (its own or the batch's), or a subtype and a site")
    # a bld_ id (a building in town) if most places of the subtype have one, else poi_
    votes: dict[str, int] = {}
    for pid, p in world.places.items():
        votes[p.get("subtype")] = votes.get(p.get("subtype"), 0) + (1 if pid.startswith("bld_") else -1)
    taken = set(world.entities)
    status = b.get("status", "draft")
    placement = placecheck.Placement(world)
    plain = lambda m: placeforms.expand_type({"type": b.get("type"), **m} if "type" in b and "subtype" not in m else dict(m), types)
    ids = []
    for m in items:
        m["id"] = mint("bld" if votes.get(plain(m).get("subtype"), 0) > 0 else "poi", taken)
        ids.append(m["id"])
    body = lambda m: {k: v for k, v in m.items() if k not in ("id", "slot", "offset_km", "type", "status")}

    if name := b.get("group"):
        existing = groups.get(name)
        if existing:
            path, group = existing
            if "into" in b and (ROOT / b["into"]).resolve() != path or did != placecheck.district_id(world, group["in"]) \
                    or any(k in b and b[k] != group.get(k) for k in (*GROUP_SHAPE, "anchor_km", "type", "status")):
                sys.exit(f"group {name} exists in {path.relative_to(ROOT)}; leave its file, district, type, anchor and pattern out or give them as they are")
            used = {m["slot"] for m in group["members"]}
        else:
            if "into" not in b:
                sys.exit("into names the places file the new group goes into")
            path, used = (ROOT / b["into"]).resolve(), set()
            group = {"group": name, "in": did, **{k: b[k] for k in ("type", "status") if k in b}, "anchor_km": b.get("anchor_km", "auto"),
                     **{k: b[k] for k in GROUP_SHAPE if k in b}, "members": []}
            group.setdefault("status", status)
        wanted = [m["slot"] for m in items if "slot" in m]
        slots = iter(free_slots(group, used | set(wanted), len(items) - len(wanted)))
        members = [{"id": m["id"], "slot": m["slot"] if "slot" in m else next(slots),
                    **{k: m[k] for k in ("type", "status") if k in m and m[k] != group.get(k)}, **body(m)} for m in items]
        if not existing and group["anchor_km"] == "auto":
            probe = dict(group, anchor_km=[0, 0], members=members)
            sized = placeforms.expand_group(probe, types)  # also checks the pattern and the spacing
            size = [max(p["site"]["size_m"][0] for p in sized), max(p["site"]["size_m"][1] for p in sized)]
            spots = placecheck.free_spots(world, did, size, all(p["site"].get("rural") for p in sized), [p["slot_km"] for p in sized], 1,
                                          group.get("angle_deg"), placement)
            if not spots:
                sys.exit(f"no free spot in {world.divisions[did]['names']['zh']} for this group; give anchor_km, or try a smaller spacing")
            group["anchor_km"] = list(spots[0])
        lines = path.read_text(encoding="utf-8").splitlines()
        if existing:
            append_members(lines, name, members)
        else:
            append_group(lines, dict(group, members=members))
        where = f"group {name}, anchor {group['anchor_km']}"
    else:
        if "into" not in b:
            sys.exit("into names the places file the new places go into")
        path = (ROOT / b["into"]).resolve()
        out = []
        for m in items:
            off = m.get("offset_km", "auto")
            p = plain(m)
            if off == "auto":
                spots = placecheck.free_spots(world, did, p["site"]["size_m"], bool(p["site"].get("rural")), count=1, placement=placement)
                if not spots:
                    sys.exit(f"no free spot in {world.divisions[did]['names']['zh']} for {m['names']['zh']}; give its offset_km")
                off = list(spots[0])
            entry = {"id": m["id"], **({"type": m.get("type", b["type"])} if "subtype" not in m else {}), "status": m.get("status", status),
                     **{k: v for k, v in body(m).items() if k != "site"}, "in": did, "offset_km": off, **({"site": m["site"]} if "site" in m else {})}
            out.append(entry)
            # later places of the batch keep clear of this one
            world.places[m["id"]] = {**placeforms.expand_type(dict(entry), types), "_source": ""}
        for m in items:
            world.places.pop(m["id"], None)
        lines = path.read_text(encoding="utf-8").splitlines()
        append_places(lines, out)
        where = "offsets " + ", ".join(str(e["offset_km"]) for e in out)
    if not path.is_relative_to(WORLD_DIR / "places"):
        sys.exit("into must be a file of world/places/")
    checked_write({path: lines}, world, ids, not args.check)
    print(f"{'checked' if args.check else 'added'} {len(items)} place(s) in {world.divisions[did]['names']['zh']} ({where}):")
    for m in items:
        print(f"  + {m['id']} {m['names']['zh']}")
    print("(--check: nothing written)" if args.check else f"written to {path.relative_to(ROOT).as_posix()}; run npm run data to draw them.")


if __name__ == "__main__":
    main()
