import type { Lang, ThemeId } from "./types";

export const LANDCOVER_CLASSES = ["forest", "tundra", "rock", "farmland", "wetland", "urban"] as const;
export type LandcoverClass = (typeof LANDCOVER_CLASSES)[number];

interface RoadStyle {
  fill: string;
  casing: string;
  glow?: string;
}

export interface MapTheme {
  background: string;
  bathymetry: [string, string, string];
  context: { fill: string; line: string; label: string };
  land: string;
  tintOpacity: number;
  hillshade: { shadow: string; highlight: string; accent: string; exaggeration: number };
  /** Terrain layer: hypsometric tint plus stronger relief shading. */
  terrain: {
    relief: [number, string][];
    opacity: number;
    exaggeration: number;
    tintOpacity: number;
    shadow: string;
    highlight: string;
  };
  water: string;
  river: string;
  /** Land cover fills by class (see pipeline/atlas/landcover.py), drawn under the relief shading. */
  landcover: { opacity: number; colors: Record<LandcoverClass, string> };
  glacier: { fill: string; line: string };
  peak: string;
  coast: { color: string; width: number; glow?: string };
  cityLine: { color: string; width: number; glow?: string };
  districtLine: { color: string; width: number };
  nationalExpressway: RoadStyle;
  territorialExpressway: RoadStyle;
  cityRoad: RoadStyle;
  /** City streets: arterials (主干道), collectors (次干道), local streets (支路). */
  street: { arterial: RoadStyle; collector: RoadStyle; local: RoadStyle; label: string };
  shield: { national: { fill: string; text: string; stroke: string }; territorial: { fill: string; text: string; stroke: string } };
  label: { text: string; halo: string; minor: string; water: string; terrain: string; territory: string };
  cityDot: { fill: string; stroke: string; capital: string };
  focus: { mask: string; maskOpacity: number; line: string; glow: string };
  hover: string;
  choropleth: [string, string, string, string, string, string];
  sky: { sky: string; horizon: string; fog: string };
}

export interface Theme {
  id: ThemeId;
  label: Record<Lang, string>;
  dark: boolean;
  map: MapTheme;
}

export const THEMES: Record<ThemeId, Theme> = {
  light: {
    id: "light",
    label: { zh: "浅色", en: "Light" },
    dark: false,
    map: {
      background: "#c4dceb",
      bathymetry: ["#dcecf4", "#d2e6f0", "#cae0ec"],
      context: { fill: "#eef1f3", line: "#9fb3c2", label: "#7b8fa0" },
      land: "#f6f5f1",
      tintOpacity: 0.12,
      hillshade: { shadow: "#4b5d70", highlight: "#ffffff", accent: "#6b7f92", exaggeration: 0.32 },
      terrain: {
        relief: [
          [0, "#cfe3c4"],
          [150, "#d7e6bf"],
          [400, "#e6e4bf"],
          [700, "#e6d5ac"],
          [1100, "#d9bf9c"],
          [1500, "#c9b29c"],
          [1900, "#e2ddd7"],
          [2300, "#fbfbfa"],
        ],
        opacity: 0.85,
        exaggeration: 0.6,
        tintOpacity: 0.05,
        shadow: "#3d4b5a",
        highlight: "#ffffff",
      },
      water: "#bcd9e9",
      river: "#8fbfdc",
      landcover: {
        opacity: 0.55,
        colors: { forest: "#b9d4ad", tundra: "#d9dcc0", rock: "#d2cbc2", farmland: "#ecebc4", wetland: "#bcd8cf", urban: "#e3dcd5" },
      },
      glacier: { fill: "#f4f9fd", line: "#b9d3e6" },
      peak: "#6b5a48",
      coast: { color: "#9bb7c9", width: 1 },
      cityLine: { color: "#8c9aab", width: 1.2 },
      districtLine: { color: "#b7c2ce", width: 0.8 },
      nationalExpressway: { fill: "#ffb84d", casing: "#dc8f2a" },
      territorialExpressway: { fill: "#ffe08a", casing: "#d9b04a" },
      cityRoad: { fill: "#ffffff", casing: "#d3d8de" },
      street: {
        arterial: { fill: "#fdf3cf", casing: "#dcc993" },
        collector: { fill: "#ffffff", casing: "#cdd4dc" },
        local: { fill: "#ffffff", casing: "#dde2e8" },
        label: "#4b5563",
      },
      shield: {
        national: { fill: "#1f7a4d", text: "#ffffff", stroke: "#c8312b" },
        territorial: { fill: "#ffffff", text: "#8a5a00", stroke: "#d9b04a" },
      },
      label: { text: "#1c2533", halo: "rgba(255,255,255,0.92)", minor: "#5d6b7c", water: "#4a83a8", terrain: "#7a6a58", territory: "#45566b" },
      cityDot: { fill: "#ffffff", stroke: "#1c2533", capital: "#e5484d" },
      focus: { mask: "#0f1b2a", maskOpacity: 0.22, line: "#2563eb", glow: "rgba(37,99,235,0.35)" },
      hover: "#2563eb",
      choropleth: ["#f1f5f9", "#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#172554"],
      sky: { sky: "#9fc6e0", horizon: "#e8f2f8", fog: "#ffffff" },
    },
  },
  dark: {
    id: "dark",
    label: { zh: "深色", en: "Dark" },
    dark: true,
    map: {
      background: "#05080f",
      bathymetry: ["#0d1626", "#0a121f", "#080e19"],
      context: { fill: "#0d1422", line: "#1f3a4d", label: "#3e6075" },
      land: "#0f1624",
      tintOpacity: 0.1,
      hillshade: { shadow: "#000000", highlight: "#3a4d6b", accent: "#1c2a40", exaggeration: 0.55 },
      terrain: {
        relief: [
          [0, "#173528"],
          [150, "#1d3c2a"],
          [400, "#2c412b"],
          [700, "#41432e"],
          [1100, "#4d4236"],
          [1500, "#564c48"],
          [1900, "#737b88"],
          [2300, "#c3ccd9"],
        ],
        opacity: 0.92,
        exaggeration: 0.8,
        tintOpacity: 0.04,
        shadow: "#000000",
        highlight: "#7f95b5",
      },
      water: "#0b2236",
      river: "#1d5c85",
      landcover: {
        opacity: 0.6,
        colors: { forest: "#12291f", tundra: "#22291f", rock: "#262a30", farmland: "#24261a", wetland: "#0f2a2c", urban: "#2a2433" },
      },
      glacier: { fill: "#8aa5c2", line: "#5d7fa3" },
      peak: "#a8b6c9",
      coast: { color: "#22d3ee", width: 1, glow: "rgba(34,211,238,0.35)" },
      cityLine: { color: "#2dd4bf", width: 1, glow: "rgba(45,212,191,0.28)" },
      districtLine: { color: "#25384d", width: 0.8 },
      nationalExpressway: { fill: "#fbbf24", casing: "#0f1624", glow: "rgba(251,191,36,0.35)" },
      territorialExpressway: { fill: "#fde68a", casing: "#0f1624", glow: "rgba(253,230,138,0.2)" },
      cityRoad: { fill: "#475569", casing: "#0f1624" },
      street: {
        arterial: { fill: "#3d4b63", casing: "#0a101b" },
        collector: { fill: "#2e3b50", casing: "#0a101b" },
        local: { fill: "#243044", casing: "#0a101b" },
        label: "#94a3b8",
      },
      shield: {
        national: { fill: "#0f3b2a", text: "#e6fff2", stroke: "#f87171" },
        territorial: { fill: "#111a2b", text: "#fde68a", stroke: "#fde68a" },
      },
      label: { text: "#e6edf7", halo: "rgba(5,8,15,0.9)", minor: "#8394ab", water: "#4fa6d6", terrain: "#8b9bb3", territory: "#6b7d96" },
      cityDot: { fill: "#0f1624", stroke: "#e6edf7", capital: "#f472b6" },
      focus: { mask: "#000000", maskOpacity: 0.5, line: "#5eead4", glow: "rgba(94,234,212,0.45)" },
      hover: "#5eead4",
      choropleth: ["#0f1624", "#123046", "#155e75", "#0e7490", "#14b8a6", "#99f6e4"],
      sky: { sky: "#020409", horizon: "#0b1a2e", fog: "#05080f" },
    },
  },
};
