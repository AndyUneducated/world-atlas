"""Rerun the elections on the last build with the current world sources and print the results, to tune party
targets and leanings without building (build --text then writes them into the map data).

    python pipeline/tools/elections.py div_raat4g               # one territory: parliament, cabinet, every council
    python pipeline/tools/elections.py div_raat4g --districts   # and the top four parties in each district
    python pipeline/tools/elections.py                          # every territory, parliaments and mayors only
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from atlas import politics  # noqa: E402
from atlas.world import World  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("territory", nargs="?", help="territory id (default: all, in brief)")
    ap.add_argument("--districts", action="store_true", help="also the vote in each district")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    world = World()
    ents = json.load(open(ROOT / "public" / "data" / "entities.json", encoding="utf-8"))
    politics.annotate(world, ents)
    name = lambda pid: ents[pid]["short_names"]["zh"] if pid in ents and "short_names" in ents[pid] else pid  # noqa: E731

    def chamber(c: dict) -> str:
        rows = sorted(c.get("parties", []), key=lambda r: -r.get("seats", 0))
        gov = c.get("government", [])
        return f"[{c.get('seats')}] " + "  ".join(f"{name(r['id'])} {r.get('seats', 0)}({r.get('vote', '')}%)" + ("*" if r["id"] in gov else "")
                                                  for r in rows if r.get("seats") or r.get("vote", 0) >= 2)

    for tid in [args.territory] if args.territory else list(world.politics["legislatures"]):
        leg = ents[tid]["legislature"]
        print(f"{ents[tid]['names']['zh']} {tid}  turnout {leg['turnout']}%   (* in government)")
        print("  ", chamber(leg))
        print("   head", name(leg["head"]["party"]), "| speaker", name(leg["speaker"]["party"]),
              "| opposition", name(leg.get("opposition", {}).get("party", "")), "| cabinet", [(name(c["id"]), c["seats"]) for c in leg["cabinet"]])
        cities = [c for c in ents.values() if c.get("subtype") == "locality" and tid in (c.get("ancestors") or []) and "council" in c]
        print("   mayors", dict(Counter(name(c["council"]["head"]["party"]) for c in cities).most_common()))
        if args.territory:
            for c in cities:
                print(f"   {c['names']['zh']} {c['id']}: mayor {name(c['council']['head']['party'])}  {chamber(c['council'])}")
        if args.districts:
            for d in ents.values():
                if tid in (d.get("ancestors") or []) and "election" in d:
                    print("     ", d["names"]["zh"], [(name(v["id"]), v["vote"]) for v in d["election"]["vote"][:4]])


if __name__ == "__main__":
    main()
