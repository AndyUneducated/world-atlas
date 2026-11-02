import type { Map as MaplibreMap } from "maplibre-gl";
import { create } from "zustand";
import type { GraticuleStep } from "./lib/graticule";
import { readUrl } from "./lib/url";
import type { Appearance, AtlasData, Lang, LngLat, ThemeId } from "./lib/types";

export interface LayerToggles {
  terrain: boolean;
  landcover: boolean;
  choropleth: boolean;
  boundaries: boolean;
  nationalExpressway: boolean;
  territorialExpressway: boolean;
  territorialHighway: boolean;
  cityRoads: boolean;
  railways: boolean;
  metro: boolean;
  buildings: boolean;
  skyways: boolean;
}

/** On-screen map furniture the user can hide from the settings panel. */
export interface DisplayToggles {
  legend: boolean;
  /** Scale bar and cursor coordinates. */
  scalePosition: boolean;
  zoomButtons: boolean;
}

/** The search box as it was when a card was opened from it, so going back can reopen it where it was. */
export interface ListView {
  query: string;
  scope: string | null;
  expanded: Record<string, boolean>;
  scroll: number;
}

/** A card's own view: which of its parts are opened, and how far it is scrolled when it is shown again on going back. */
export interface CardView {
  open: Record<string, boolean>;
  scroll: number;
}

const FRESH_CARD: CardView = { open: {}, scroll: 0 };

/** Where a card was opened from: the card shown before it as it was left, and the list it was picked from, if any. */
interface BackEntry {
  id: string | null;
  card: CardView;
  list?: ListView;
}

let scroller: { id: string; el: HTMLElement } | null = null;

/** The shown card's scrolling element, read when another card is opened from it. */
export function registerCardScroller(id: string, el: HTMLElement | null) {
  if (el) scroller = { id, el };
  else if (scroller?.id === id) scroller = null;
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
  /** Whether the map zooms to fit the selection: picks from search and cards do, clicks on the map do not. */
  fitSelection: boolean;
  layers: LayerToggles;
  display: DisplayToggles;
  route: { from: string | null; to: string | null };
  /** Measuring-tool vertices; null when the tool is off. */
  measure: [number, number][] | null;
  setMeasure: (points: [number, number][] | null) => void;
  /** The latitude–longitude grid: null when hidden, otherwise its spacing. */
  graticule: GraticuleStep | null;
  setGraticule: (step: GraticuleStep | null) => void;
  /** Lines drawn on top of the map, e.g. the route stretch picked in a card timeline. */
  highlight: { key: string; lines: LngLat[][] } | null;
  setHighlight: (highlight: { key: string; lines: LngLat[][] } | null) => void;
  setRoute: (patch: Partial<{ from: string | null; to: string | null }>) => void;
  setData: (data: AtlasData) => void;
  setMap: (map: MaplibreMap | null) => void;
  setAppearance: (appearance: Appearance) => void;
  setLang: (lang: Lang) => void;
  /**
   * Show a card. Picks from a card, the search box or the explore list can be stepped back through;
   * a click on the map, or closing the card, starts over.
   */
  select: (id: string | null, opts?: { fit?: boolean; list?: ListView }) => void;
  back: BackEntry[];
  /** Step back one card; the browser's back button does the same. */
  goBack: () => void;
  /** A list to reopen after going back, picked up by the search box. */
  restoreList: ListView | null;
  setRestoreList: (list: ListView | null) => void;
  cardView: CardView;
  setCardOpen: (key: string, open: boolean) => void;
  /** Phones: whether the card sheet is pulled up to full height; every card opens as the last one was left. */
  sheetFull: boolean;
  setSheetFull: (full: boolean) => void;
  toggleLayer: (key: keyof LayerToggles) => void;
  toggleDisplay: (key: keyof DisplayToggles) => void;
}

const initial = readUrl();
/** Bump a key's version whenever its defaults change, so returning visitors pick them up. */
const STORAGE = { appearance: "atlas.appearance", layers: "atlas.layers.v2", display: "atlas.display.v3" };
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
  territorialHighway: true,
  cityRoads: true,
  railways: false,
  metro: false,
  buildings: true,
  skyways: true,
};
const DEFAULT_DISPLAY: DisplayToggles = { legend: false, scalePosition: false, zoomButtons: false };

export const useAtlas = create<AtlasState>((set) => ({
  data: null,
  map: null,
  appearance,
  theme: resolveTheme(appearance),
  lang: initial.lang ?? "zh",
  selectedId: initial.sel ?? null,
  selectionNonce: 0,
  fitSelection: true,
  layers: readStored(STORAGE.layers, DEFAULT_LAYERS),
  display: readStored(STORAGE.display, DEFAULT_DISPLAY),
  route: { from: null, to: null },
  measure: null,
  setMeasure: (measure) => set({ measure }),
  graticule: null,
  setGraticule: (graticule) => set({ graticule }),
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
  select: (id, opts) =>
    set((s) => {
      const fit = opts?.fit ?? true;
      let back = s.back;
      if (id === null || !fit) back = [];
      else if (id !== s.selectedId && (s.selectedId !== null || opts?.list)) {
        const scroll = scroller && scroller.id === s.selectedId ? scroller.el.scrollTop : 0;
        back = [...s.back, { id: s.selectedId, card: { open: s.cardView.open, scroll }, list: opts?.list }];
        window.history.pushState({ atlasBack: back.length }, "");
      }
      const cardView = id === s.selectedId ? s.cardView : FRESH_CARD;
      return { selectedId: id, selectionNonce: s.selectionNonce + 1, fitSelection: fit, highlight: null, back, cardView };
    }),
  back: [],
  goBack: () => window.history.back(),
  restoreList: null,
  setRestoreList: (restoreList) => set({ restoreList }),
  cardView: FRESH_CARD,
  setCardOpen: (key, open) => set((s) => ({ cardView: { ...s.cardView, open: { ...s.cardView.open, [key]: open } } })),
  sheetFull: true,
  setSheetFull: (sheetFull) => set({ sheetFull }),
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

window.addEventListener("popstate", () => {
  const { back } = useAtlas.getState();
  const entry = back.at(-1);
  // entries left behind after a map click started a new history have nothing to go back to
  if (!entry) return;
  useAtlas.setState((s) => ({
    back: back.slice(0, -1),
    selectedId: entry.id,
    selectionNonce: s.selectionNonce + 1,
    fitSelection: entry.id !== null,
    highlight: null,
    restoreList: entry.list ?? null,
    cardView: entry.card,
  }));
});

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
