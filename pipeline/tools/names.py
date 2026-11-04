"""Snapshot the generated names of the last build (stations and generated routes) and compare two snapshots, to see
every name a naming change touched.

    python pipeline/tools/names.py save before.json    # before the change (after a build)
    python pipeline/tools/names.py save after.json     # after building the change
    python pipeline/tools/names.py diff before.json after.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def snapshot() -> dict[str, str]:
    ents = json.load(open(ROOT / "public" / "data" / "entities.json", encoding="utf-8"))
    out = {}
    for e in ents.values():
        if e.get("subtype") == "station" or (e.get("kind") == "route" and e.get("status") == "generated"):
            out[e["id"]] = f"{e['names']['zh']} | {e['names']['en']}"
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("save").add_argument("out")
    d = sub.add_parser("diff")
    d.add_argument("a")
    d.add_argument("b")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    if args.cmd == "save":
        snap = snapshot()
        json.dump(snap, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        print(len(snap), "names")
        return
    a, b = (json.load(open(p, encoding="utf-8")) for p in (args.a, args.b))
    changed = [k for k in sorted(a.keys() | b.keys()) if a.get(k) != b.get(k)]
    for k in changed:
        print(k, a.get(k), "->", b.get(k))
    print(len(changed), "changed")


if __name__ == "__main__":
    main()
