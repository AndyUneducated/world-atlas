import type { FeatureCollection } from "geojson";
import { LAYER_FILES, type AtlasData, type Entity, type LayerFile, type Manifest } from "./types";

/** Absolute base URL of the app; MapLibre needs absolute URLs for tiles and glyphs. */
export const BASE_URL = new URL(import.meta.env.BASE_URL, window.location.href).href;

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}data/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function loadAtlas(): Promise<AtlasData> {
  const [manifest, entities, ...layerData] = await Promise.all([
    getJSON<Manifest>("manifest.json"),
    getJSON<Record<string, Entity>>("entities.json"),
    ...LAYER_FILES.map((name) => getJSON<FeatureCollection>(`${name}.geojson`)),
  ]);
  const layers = Object.fromEntries(LAYER_FILES.map((name, i) => [name, layerData[i]])) as Record<LayerFile, FeatureCollection>;

  // Palette slot per division: each locality gets its own hue, boroughs inherit it.
  const palette: Record<string, number> = {};
  for (const f of layers.divisions.features) {
    const p = f.properties as { id: string; palette: number };
    palette[p.id] = p.palette;
  }
  return { manifest, entities, layers, palette };
}
