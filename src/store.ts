import type { Map as MaplibreMap } from "maplibre-gl";
import { create } from "zustand";
import { readUrl } from "./lib/url";
import type { AtlasData, Lang, ThemeId } from "./lib/types";

export interface LayerToggles {
  choropleth: boolean;
  hillshade: boolean;
  boundaries: boolean;
  roads: boolean;
}

interface AtlasState {
  data: AtlasData | null;
  map: MaplibreMap | null;
  theme: ThemeId;
  lang: Lang;
  selectedId: string | null;
  /** Bumped on every selection so the map re-focuses even when re-selecting the same id. */
  selectionNonce: number;
  layers: LayerToggles;
  route: { from: string | null; to: string | null };
  setRoute: (patch: Partial<{ from: string | null; to: string | null }>) => void;
  setData: (data: AtlasData) => void;
  setMap: (map: MaplibreMap | null) => void;
  setTheme: (theme: ThemeId) => void;
  setLang: (lang: Lang) => void;
  select: (id: string | null) => void;
  toggleLayer: (key: keyof LayerToggles) => void;
}

const initial = readUrl();

export const useAtlas = create<AtlasState>((set) => ({
  data: null,
  map: null,
  theme: initial.theme ?? "glacier",
  lang: initial.lang ?? "zh",
  selectedId: initial.sel ?? null,
  selectionNonce: 0,
  layers: { choropleth: false, hillshade: true, boundaries: true, roads: true },
  route: { from: null, to: null },
  setRoute: (patch) => set((s) => ({ route: { ...s.route, ...patch } })),
  setData: (data) => set({ data }),
  setMap: (map) => set({ map }),
  setTheme: (theme) => set({ theme }),
  setLang: (lang) => set({ lang }),
  select: (id) => set((s) => ({ selectedId: id, selectionNonce: s.selectionNonce + 1 })),
  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
}));

interface CursorState {
  lngLat: [number, number] | null;
  zoom: number;
  bearing: number;
  metersPerPixel: number;
  set: (patch: Partial<Omit<CursorState, "set">>) => void;
}

/** High-frequency map readouts, kept separate so they don't re-render the app shell. */
export const useCursor = create<CursorState>((set) => ({
  lngLat: null,
  zoom: 0,
  bearing: 0,
  metersPerPixel: 0,
  set: (patch) => set(patch),
}));

export const initialView = initial.view;

if (import.meta.env.DEV) Object.assign(window, { __atlas: useAtlas });
