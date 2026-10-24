import type { FeatureCollection } from "geojson";
import { LAYER_FILES, type AtlasData, type Entity, type LayerFile, type Manifest, type RoadGraph } from "./types";

/** Absolute base URL of the app; MapLibre needs absolute URLs for tiles and glyphs. */
export const BASE_URL = new URL(import.meta.env.BASE_URL, window.location.href).href;

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export async function loadAtlas(): Promise<AtlasData> {
  const manifestReq = getJSON<Manifest>("manifest.json");
  // Layers in the tile archive are drawn from tiles; their GeoJSON is only fetched without one.
  const layer = async (name: LayerFile) =>
    (await manifestReq).tiles?.layers.includes(name) ? EMPTY : getJSON<FeatureCollection>(`${name}.geojson`);
  const [manifest, entities, graph, ...layerData] = await Promise.all([
    manifestReq,
    getJSON<Record<string, Entity>>("entities.json"),
    getJSON<RoadGraph>("graph.json"),
    ...LAYER_FILES.map(layer),
  ]);
  const layers = Object.fromEntries(LAYER_FILES.map((name, i) => [name, layerData[i]])) as Record<LayerFile, FeatureCollection>;

  const colors: Record<string, string> = {};
  for (const f of layers.divisions.features) {
    const p = f.properties as { id: string; color?: string };
    if (p.color) colors[p.id] = p.color;
  }
  return { manifest, entities, layers, colors, graph };
}
