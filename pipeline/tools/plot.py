"""Plot the last build around an entity or a point as a PNG in km offsets, to check a layout without the browser.

    python pipeline/tools/plot.py bld_7cyhme                  # 3 km around a place, to .cache/plots/bld_7cyhme.png
    python pipeline/tools/plot.py div_zmb3gb --km 12 --refs   # wider, with road numbers
    python pipeline/tools/plot.py -121.9,37.35 --km 2 --out C:/tmp/x.png

Draws district outlines, water, streets, roads, rail, city buildings, landmark sites and their parts (labelled
with their place ids) and place points. Reads public/data, so build (or build --only <region>) first.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from shapely.geometry import box, shape  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "public" / "data"
EARTH_RADIUS_KM = 6371.0088
PART = {"building": "#555", "lot": "#d8d2c4", "paved": "#b8b8b8", "green": "#9fd18b", "basin": "#6ab0e6", "runway": "#333",
        "pad": "#e9a", "wall": "#865", "tank": "#d4a373"}
ROAD = {"motorway": ("#d62828", 2.2), "primary": ("#f77f00", 1.6), "secondary": ("#fcbf49", 1.2)}
STREET = {"arterial": ("#888", 0.9), "collector": ("#aaa", 0.6), "local": ("#ccc", 0.4)}


def layer(name: str) -> list[dict]:
    path = DATA / f"{name}.geojson"
    return json.load(open(path, encoding="utf-8"))["features"] if path.exists() else []


def centre(target: str):
    if "," in target:
        lon, lat = map(float, target.split(","))
        return lon, lat
    for name in ("landmarks", "places", "divisions", "roads", "rail", "streets-named", "coast", "water"):
        for f in layer(name):
            p = f["properties"]
            if p.get("id") == target and "part" not in p:
                c = shape(f["geometry"]).centroid
                return c.x, c.y
    sys.exit(f"{target}: not found in the built layers")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("target", help="an entity id, or lon,lat")
    ap.add_argument("--km", type=float, default=3.0, help="half the width of the view in km (default 3)")
    ap.add_argument("--refs", action="store_true", help="label roads with their numbers")
    ap.add_argument("--out", help="PNG path (default .cache/plots/<target>.png)")
    args = ap.parse_args()
    lon0, lat0 = centre(args.target)
    kx, ky = math.radians(1) * EARTH_RADIUS_KM * math.cos(math.radians(lat0)), math.radians(1) * EARTH_RADIUS_KM
    km = lambda xs, ys: ([(x - lon0) * kx for x in xs], [(y - lat0) * ky for y in ys])  # noqa: E731
    r = args.km * 1.15
    view = box(lon0 - r / kx, lat0 - r / ky, lon0 + r / kx, lat0 + r / ky)

    def shapes(feats):
        for f in feats:
            g = shape(f["geometry"])
            if g.intersects(view):
                yield f["properties"], g

    def parts(g, kind):
        return [p for p in getattr(g, "geoms", [g]) if p.geom_type == kind]

    fig, ax = plt.subplots(figsize=(14, 14))
    for _, g in shapes(layer("water")):
        for p in parts(g, "Polygon"):
            ax.fill(*km(*p.exterior.xy), color="#cfe8f7", zorder=0)
    for props, g in shapes(layer("divisions")):
        for p in parts(g, "Polygon"):
            ax.plot(*km(*p.exterior.xy), color="#334" if props["subtype"] == "locality" else "#889",
                    lw=1.6 if props["subtype"] == "locality" else 0.9, ls="-" if props["subtype"] == "locality" else "--", zorder=1)
    x0, y0, x1, y1 = view.bounds
    near = [f for f in layer("buildings") if x0 <= f["geometry"]["coordinates"][0][0][0] <= x1 and y0 <= f["geometry"]["coordinates"][0][0][1] <= y1]
    for props, g in shapes(near):  # city buildings are small polygons, so their first corner is enough to filter on
        for p in parts(g, "Polygon"):
            ax.fill(*km(*p.exterior.xy), color="#cbbfae", zorder=2)
    for props, g in shapes(layer("streets")):
        col, w = STREET.get(props.get("class"), ("#ccc", 0.4))
        for ln in parts(g, "LineString"):
            ax.plot(*km(*ln.xy), color=col, lw=w, zorder=3)
    for props, g in shapes(layer("rail")):
        for ln in parts(g, "LineString"):
            ax.plot(*km(*ln.xy), color=props.get("color") or "#7b2cbf", lw=1.4, ls="--" if props["network"] == "metro" else "-", zorder=4)
    for props, g in shapes(layer("roads")):
        col, w = ROAD.get(props.get("class"), ("#999", 1.0))
        for ln in parts(g, "LineString"):
            x, y = km(*ln.xy)
            ax.plot(x, y, color=col, lw=w, zorder=5)
            if args.refs and props.get("ref"):
                ax.text(x[len(x) // 2], y[len(y) // 2], props["ref"], fontsize=7, color="#900", zorder=9)
    for props, g in shapes(layer("landmarks")):
        kind = props.get("part")
        for p in parts(g, "Polygon"):
            x, y = km(*p.exterior.xy)
            if kind in PART:
                ax.fill(x, y, color=PART[kind], zorder=6 if kind == "building" else 5.5)
            elif kind is None and "layout" in props:
                ax.plot(x, y, color="#a33", lw=0.8, ls="--", zorder=7)
    plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "DejaVu Sans"]
    for props, g in shapes(layer("places")):
        x, y = km([g.x], [g.y])
        ax.plot(x, y, "o", color="#a33", ms=3, zorder=8)
        ax.text(x[0], y[0], f" {props['id']} {props['name_zh']}", fontsize=7, zorder=9, clip_on=True)
    ax.set_xlim(-args.km, args.km)
    ax.set_ylim(-args.km, args.km)
    ax.set_aspect("equal")
    ax.grid(True, lw=0.3)
    ax.set_title(f"{args.target}  ({lon0:.5f}, {lat0:.5f}), km")
    out = Path(args.out) if args.out else ROOT / ".cache" / "plots" / f"{args.target.replace(',', '_')}.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=80, bbox_inches="tight")
    print(out)


if __name__ == "__main__":
    main()
