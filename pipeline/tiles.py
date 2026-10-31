"""Pack the bulky, display-only map layers into a PMTiles vector tile archive.

Run after build.py. Needs tippecanoe (2.17 or later, for PMTiles output):

    python pipeline/tiles.py             # skip with a notice when tippecanoe is missing
    python pipeline/tiles.py --require   # fail instead (CI)

On success public/data/atlas.pmtiles holds one tile layer per entry of TILE_LAYERS and
manifest.json lists them under "tiles"; the site then reads those layers tile by tile, and
their GeoJSON is deleted (rerun build.py to get it back). Without the archive the site falls
back to GeoJSON.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from atlas.world import ROOT  # noqa: E402

OUT = ROOT / "public" / "data"
ARCHIVE = "atlas.pmtiles"
# Layers read only for drawing: no click targets, no client-side geometry work.
TILE_LAYERS = ("bathymetry", "landcover", "rivers", "streets", "buildings", "parks")
MAX_ZOOM = 12

TIPPECANOE_FLAGS = [
    "--minimum-zoom=0",
    f"--maximum-zoom={MAX_ZOOM}",
    # keep every feature at every zoom so the tiled map looks the same as the GeoJSON one
    "--drop-rate=1",
    "--no-feature-limit",
    "--no-tile-size-limit",
    "--no-tiny-polygon-reduction",
    # adjacent land cover polygons are simplified along the same edges, leaving no slivers
    "--detect-shared-borders",
    "--force",
    "--quiet",
]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--require", action="store_true", help="fail when tippecanoe is not installed")
    args = ap.parse_args()

    manifest_path = OUT / "manifest.json"
    if not manifest_path.exists():
        sys.exit("public/data/manifest.json not found; run pipeline/build.py first")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if missing := [n for n in TILE_LAYERS if not (OUT / f"{n}.geojson").exists()]:
        sys.exit(f"{', '.join(missing)}.geojson not found (already packed?); run pipeline/build.py first")
    manifest.pop("tiles", None)
    archive = OUT / ARCHIVE
    archive.unlink(missing_ok=True)

    exe = shutil.which("tippecanoe")
    if exe is None:
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        msg = "tippecanoe not found: the site will load these layers as GeoJSON"
        if args.require:
            sys.exit(msg)
        print(msg)
        return

    cmd = [exe, "-o", str(archive), *TIPPECANOE_FLAGS]
    for name in TILE_LAYERS:
        cmd += ["-L", f"{name}:{OUT / f'{name}.geojson'}"]
    subprocess.run(cmd, check=True)

    manifest["tiles"] = {"url": ARCHIVE, "layers": list(TILE_LAYERS), "maxzoom": MAX_ZOOM}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    freed = 0
    for name in TILE_LAYERS:  # the site no longer reads them, so they stay out of the deployed bundle
        path = OUT / f"{name}.geojson"
        freed += path.stat().st_size
        path.unlink()
    print(f"wrote {ARCHIVE} ({archive.stat().st_size / 1e6:.1f} MB): {', '.join(TILE_LAYERS)}; "
          f"removed their GeoJSON ({freed / 1e6:.0f} MB)")


if __name__ == "__main__":
    main()
