"""Apply a batch of exact text replacements described in a YAML file, all or nothing: every edit must match the
expected number of times, or no file is written.

    python pipeline/tools/replace.py edits.yaml           # apply
    python pipeline/tools/replace.py edits.yaml --dry     # only report the matches

edits.yaml is a list; paths are relative to the repository root and files stay utf-8 with LF line ends:

    - file: world/politics.yaml
      old: "在上一次选举中，蓝桨拿到百分之三十一点一的选票"
      new: "在上一次选举中，蓝桨拿到百分之三十一点九的选票"
    - file: world/politics.yaml
      line: '      zh: "红帆社会民主党（简称'     # the one line starting with this is replaced whole
      new: '      zh: "…"'
    - file: [world/politics.yaml, world/divisions/cn-vk.yaml]
      old: 红帆
      new: 第一群岛
      count: any                                   # any number of matches, at least one (default: exactly 1)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("edits")
    ap.add_argument("--dry", action="store_true", help="report matches without writing")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    edits = yaml.safe_load(open(args.edits, encoding="utf-8"))
    texts: dict[Path, str] = {}
    bad = 0
    for i, e in enumerate(edits, 1):
        files = [ROOT / f for f in ([e["file"]] if isinstance(e["file"], str) else e["file"])]
        for f in files:
            if f not in texts:
                texts[f] = f.read_text(encoding="utf-8")
        if "line" in e:
            hits = [(f, n) for f in files for n, ln in enumerate(texts[f].split("\n")) if ln.startswith(e["line"])]
            found = len(hits)
            if found == 1:
                f, n = hits[0]
                lines = texts[f].split("\n")
                lines[n] = e["new"]
                texts[f] = "\n".join(lines)
            ok = found == 1
            what = e["line"]
        else:
            found = sum(texts[f].count(e["old"]) for f in files)
            ok = found >= 1 if e.get("count") == "any" else found == int(e.get("count", 1))
            if ok:
                for f in files:
                    texts[f] = texts[f].replace(e["old"], e["new"])
            what = e["old"]
        bad += not ok
        print(f"{'ok ' if ok else 'BAD'} #{i} {found} match{'es' if found != 1 else ''}: {what[:60]}")
    if bad:
        sys.exit(f"{bad} edit(s) did not match as expected; nothing written")
    if args.dry:
        return
    for f, t in texts.items():
        with open(f, "w", encoding="utf-8", newline="\n") as out:
            out.write(t)
    print(f"written: {len(texts)} file(s)")


if __name__ == "__main__":
    main()
