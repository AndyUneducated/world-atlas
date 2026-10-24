import type { Map as MaplibreMap } from "maplibre-gl";
import { create } from "zustand";
import { readUrl } from "./lib/url";
import type { Appearance, AtlasData, Lang, LngLat, ThemeId } from "./lib/types";

export interface LayerToggles {
  terrain: boolean;
  landcover: boolean;
  choropleth: boolean;
  boundaries: boolean;
  nationalExpressway: boolean;
  territorialExpressway: boolean;
  cityRoads: boolean;
  buildings: boolean;
}

/** On-screen map furniture the user can hide from the settings panel. */
export interface DisplayToggles {
  legend: boolean;
  scale: boolean;
  coordinates: boolean;
}

interface AtlasState {
  data: AtlasData | null;
  map: MaplibreMap | null;
  appearance: Appearance;
  /** Resolved from appearance and the system colour scheme. */
  theme: ThemeId;
  lang: Lang;
  selectedId: string | null;
  /** Bumped on every selection so the map re-focuses even when re-selecting the same id. */
  selectionNonce: number;
  layers: LayerToggles;
  display: DisplayToggles;
  route: { from: string | null; to: string | null };
  /** Measuring-tool vertices; null when the tool is off. */
  measure: [number, number][] | null;
  setMeasure: (points: [number, number][] | null) => void;
  /** Lines drawn on top of the map, e.g. the route stretch picked in a card timeline. */
  highlight: { key: string; lines: LngLat[][] } | null;
  setHighlight: (highlight: { key: string; lines: LngLat[][] } | null) => void;
  setRoute: (patch: Partial<{ from: string | null; to: string | null }>) => void;
  setData: (data: AtlasData) => void;
  setMap: (map: MaplibreMap | null) => void;
  setAppearance: (appearance: Appearance) => void;
  setLang: (lang: Lang) => void;
  select: (id: string | null) => void;
  toggleLayer: (key: keyof LayerToggles) => void;
  toggleDisplay: (key: keyof DisplayToggles) => void;
}

const initial = readUrl();
const STORAGE = { appearance: "atlas.appearance", layers: "atlas.layers", display: "atlas.display" };
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

const resolveTheme = (a: Appearance): ThemeId => (a === "auto" ? (darkQuery.matches ? "dark" : "light") : a);
const storedAppearance = (localStorage.getItem(STORAGE.appearance) as Appearance | null) ?? "auto";
const appearance: Appearance = ["auto", "light", "dark"].includes(storedAppearance) ? storedAppearance : "auto";

const DEFAULT_LAYERS: LayerToggles = {
  terrain: false,
  landcover: true,
  choropleth: false,
  boundaries: true,
  nationalExpressway: true,
  territorialExpressway: true,
  cityRoads: true,
  buildings: true,
};
const DEFAULT_DISPLAY: DisplayToggles = { legend: true, scale: true, coordinates: true };

export const useAtlas = create<AtlasState>((set) => ({
  data: null,
  map: null,
  appearance,
  theme: resolveTheme(appearance),
  lang: initial.lang ?? "zh",
  selectedId: initial.sel ?? null,
  selectionNonce: 0,
  layers: readStored(STORAGE.layers, DEFAULT_LAYERS),
  display: readStored(STORAGE.display, DEFAULT_DISPLAY),
  route: { from: null, to: null },
  measure: null,
  setMeasure: (measure) => set({ measure }),
  highlight: null,
  setHighlight: (highlight) => set({ highlight }),
  setRoute: (patch) => set((s) => ({ route: { ...s.route, ...patch } })),
  setData: (data) => set({ data }),
  setMap: (map) => set({ map }),
  setAppearance: (a) => {
    localStorage.setItem(STORAGE.appearance, a);
    set({ appearance: a, theme: resolveTheme(a) });
  },
  setLang: (lang) => set({ lang }),
  select: (id) => set((s) => ({ selectedId: id, selectionNonce: s.selectionNonce + 1, highlight: null })),
  toggleLayer: (key) =>
    set((s) => {
      const layers = { ...s.layers, [key]: !s.layers[key] };
      localStorage.setItem(STORAGE.layers, JSON.stringify(layers));
      return { layers };
    }),
  toggleDisplay: (key) =>
    set((s) => {
      const display = { ...s.display, [key]: !s.display[key] };
      localStorage.setItem(STORAGE.display, JSON.stringify(display));
      return { display };
    }),
}));

darkQuery.addEventListener("change", () => {
  const s = useAtlas.getState();
  if (s.appearance === "auto") useAtlas.setState({ theme: resolveTheme("auto") });
});

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
