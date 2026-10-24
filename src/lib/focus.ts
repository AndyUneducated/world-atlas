import type { Feature, Polygon, Position } from "geojson";
import { EMPTY_FC, type FocusData } from "./style";
import type { AtlasData, BBox, LayerFile } from "./types";

const FOCUSABLE: LayerFile[] = ["divisions", "water", "coast", "glaciers", "roads", "rivers-named", "ridges"];

export function indexFeatures(data: AtlasData): Map<string, Feature> {
  const out = new Map<string, Feature>();
  for (const layer of FOCUSABLE) {
    for (const f of data.layers[layer].features) {
      const id = (f.properties as { id?: string } | null)?.id;
      if (id) out.set(id, f);
    }
  }
  return out;
}

function ringArea(ring: Position[]) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a;
}

function maskRect(b: BBox): Position[] {
  const [w, s, e, n] = [b[0] - 25, Math.max(b[1] - 12, -85), b[2] + 25, Math.min(b[3] + 12, 85)];
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

/** Dim everything except the focused feature: a large rectangle with the feature cut out. */
export function buildFocus(feature: Feature | undefined, region: BBox): FocusData {
  if (!feature) return { mask: EMPTY_FC, outline: EMPTY_FC };
  const outer = maskRect(region);
  const holes: Position[][] = [];
  const g = feature.geometry;
  if (g.type === "Polygon") holes.push(g.coordinates[0]);
  if (g.type === "MultiPolygon") for (const p of g.coordinates) holes.push(p[0]);
  const outerSign = Math.sign(ringArea(outer));
  const rings = [outer, ...holes.map((h) => (Math.sign(ringArea(h)) === outerSign ? [...h].reverse() : h))];
  const mask: Feature<Polygon> = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rings } };
  return {
    mask: { type: "FeatureCollection", features: [mask] },
    outline: { type: "FeatureCollection", features: [feature] },
  };
}
