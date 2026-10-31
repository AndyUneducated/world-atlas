import type { Feature, FeatureCollection } from "geojson";
import { EMPTY_FC } from "./style";
import type { AtlasData, LayerFile } from "./types";

/** route-shared holds the stretches a route runs along lines drawn under another route's id, so a route lights up end to end. */
const FOCUSABLE: LayerFile[] = ["divisions", "water", "coast", "glaciers", "roads", "route-shared", "streets-named", "landmarks", "rail", "rivers-named", "ridges"];

/** Every feature drawn for an id: a route's own lines, its shared stretches and any undersea tunnel. */
export function indexFeatures(data: AtlasData): Map<string, Feature[]> {
  const out = new Map<string, Feature[]>();
  for (const layer of FOCUSABLE) {
    for (const f of data.layers[layer].features) {
      const id = (f.properties as { id?: string } | null)?.id;
      if (!id) continue;
      const list = out.get(id);
      if (list) list.push(f);
      else out.set(id, [f]);
    }
  }
  return out;
}

/** The focused features, drawn as an outline with a glow. */
export function buildFocus(features: Feature[] | undefined): FeatureCollection {
  return features?.length ? { type: "FeatureCollection", features } : EMPTY_FC;
}
