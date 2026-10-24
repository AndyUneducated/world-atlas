"""Mint entity ids that are not in use.

    python pipeline/new_id.py rte        # one id
    python pipeline/new_id.py poi 5      # five ids
"""
from __future__ import annotations

import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas.world import ID_PATTERN, World  # noqa: E402

B32 = "0123456789abcdefghjkmnpqrstvwxyz"


def mint(prefix: str, taken: set[str]) -> str:
    while True:
        eid = f"{prefix}_" + "".join(secrets.choice(B32) for _ in range(6))
        if eid not in taken:
            taken.add(eid)
            return eid


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    prefix, count = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1
    if not ID_PATTERN.match(f"{prefix}_000000"):
        sys.exit(f"unknown prefix '{prefix}'")
    world = World()
    taken = set(world.entities)
    for _ in range(count):
        print(mint(prefix, taken))


if __name__ == "__main__":
    main()
