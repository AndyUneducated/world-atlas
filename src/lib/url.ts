import type { Lang, ThemeId } from "./types";

export interface UrlState {
  sel?: string;
  theme?: ThemeId;
  lang?: Lang;
  view?: { zoom: number; lat: number; lng: number; bearing: number };
}

const THEMES: ThemeId[] = ["glacier", "aurora", "atlas"];

export function readUrl(): UrlState {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const out: UrlState = {};
  const sel = params.get("sel");
  if (sel) out.sel = sel;
  const theme = params.get("theme") as ThemeId | null;
  if (theme && THEMES.includes(theme)) out.theme = theme;
  const lang = params.get("lang");
  if (lang === "zh" || lang === "en") out.lang = lang;
  const map = params.get("map")?.split("/").map(Number);
  if (map && map.length >= 3 && map.every(Number.isFinite)) {
    out.view = { zoom: map[0], lat: map[1], lng: map[2], bearing: map[3] ?? 0 };
  }
  return out;
}

export function writeUrl(state: UrlState) {
  const params = new URLSearchParams();
  if (state.sel) params.set("sel", state.sel);
  if (state.theme) params.set("theme", state.theme);
  if (state.lang) params.set("lang", state.lang);
  if (state.view) {
    const v = state.view;
    const parts = [v.zoom.toFixed(2), v.lat.toFixed(4), v.lng.toFixed(4)];
    if (Math.abs(v.bearing) > 0.5) parts.push(v.bearing.toFixed(0));
    params.set("map", parts.join("/"));
  }
  const hash = `#${params.toString().replace(/%2F/g, "/")}`;
  if (hash !== window.location.hash) window.history.replaceState(null, "", hash);
}
