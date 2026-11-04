"""Check card text in the world sources (no build needed): length of the Chinese and English notes, and what to
look at again by hand: years and dates, superlatives (keep only verified ones), and a missing or unusually short
English text.

    python pipeline/tools/cards.py world/places/us-ca-quarters.yaml   # every entity in a source file
    python pipeline/tools/cards.py bld_7cyhme pty_z573k7 --min 500    # some entities; flag notes under 500 characters
    python pipeline/tools/cards.py world/politics.yaml --flags         # only the entities with something to check
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from atlas.world import TEXT_KEYS, World  # noqa: E402

YEAR = re.compile(r"\d{3,4}\s*年|(?<!\d)(1[5-9]\d\d|20\d\d)(?!\d)|[一二三四五六七八九〇零]{4}年|\d+\s*世纪|上世纪")
SUPERLATIVE = re.compile(r"世界最|全球最|全世界|史上|最[大高长深快早古老多]|第一[座个家条所]|唯一|largest|tallest|longest|deepest|fastest|"
                         r"oldest|biggest|the first|the only|world's", re.I)
CJK = re.compile(r"[\u3400-\u9fff]")


def flatten(v) -> str:
    if isinstance(v, dict):
        return " ".join(flatten(x) for x in v.values())
    if isinstance(v, list):
        return " ".join(flatten(x) for x in v)
    return str(v) if v is not None else ""


def text(e: dict, lang: str) -> str:
    """All of one language's card text of an entity: its TEXT_KEYS fields and nested notes."""
    parts = []
    for k in (*TEXT_KEYS, "factions"):
        v = e.get(k)
        if isinstance(v, dict) and lang in v:
            parts.append(flatten(v[lang]))
        elif isinstance(v, list):
            parts += [flatten(x.get("notes", {}).get(lang, "")) for x in v if isinstance(x, dict)]
    return "\n".join(p for p in parts if p)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="+", help="entity ids or source files under world/")
    ap.add_argument("--min", type=int, default=0, help="flag Chinese notes shorter than this many characters")
    ap.add_argument("--flags", action="store_true", help="list only entities with something to check")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    world = World()
    pool = {**world.entities, **{p["id"]: p for p in (world.politics or {}).get("parties", [])}}
    ids = []
    for t in args.targets:
        path = ROOT / t
        if path.suffix in (".yaml", ".yml") and path.exists():
            ids += re.findall(r"^\s*-?\s*id:\s*([a-z]{3}_[0-9a-z]{6})\s*$", path.read_text(encoding="utf-8"), re.M)
        elif t in pool:
            ids.append(t)
        else:
            sys.exit(f"{t}: neither an entity id nor a source file")
    for eid in ids:
        e = pool.get(eid)
        if e is None:
            continue
        zh, en = text(e, "zh"), text(e, "en")
        notes_zh = len(CJK.findall(flatten((e.get("notes") or {}).get("zh", ""))))
        flags = []
        if args.min and notes_zh < args.min:
            flags.append(f"notes {notes_zh} < {args.min}")
        if zh and not en:
            flags.append("no English")
        elif zh and len(en) < 1.2 * len(CJK.findall(zh)):
            flags.append(f"English short ({len(en)} chars for {len(CJK.findall(zh))} Chinese)")
        years = sorted({m.group(0) for m in YEAR.finditer(zh + "\n" + en)})
        if years:
            flags.append("years: " + ", ".join(years[:6]))
        sup = sorted({m.group(0) for m in SUPERLATIVE.finditer(zh + "\n" + en)})
        if sup:
            flags.append("superlatives: " + ", ".join(sup[:8]))
        if args.flags and not flags:
            continue
        name = (e.get("names") or {}).get("zh", "")
        print(f"{eid} {name}: notes {notes_zh} zh chars, {len(en)} en chars" + ("".join(f"\n    {f}" for f in flags)))


if __name__ == "__main__":
    main()
