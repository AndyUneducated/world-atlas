import type { Lang, ThemeId } from "./types";

/** One hue per locality, ordered by division code. Boroughs inherit their city's hue. */
export const PALETTE = [
  "#E9B949", // 自由市
  "#4C8BF5", // 维京港市
  "#36B37E", // 西北市
  "#9BC53D", // 勒克尔市
  "#E3C567", // 奥克西诺市
  "#5E9E6E", // 洛龙山市
  "#E5739D", // 新城市
  "#F29E4C", // 天城市
  "#8E7CC3", // 萨科勒市
  "#E5534B", // 贝克勒自由贸易区
  "#9A8F7E", // 马斯林山市
  "#3FB6C6", // 厄定河市
];

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
  terrain: { relief: [number, string][]; opacity: number; exaggeration: number; tintOpacity: number };
  water: string;
  river: string;
  coast: { color: string; width: number; glow?: string };
  cityLine: { color: string; width: number; glow?: string };
  districtLine: { color: string; width: number };
  nationalExpressway: RoadStyle;
  territorialExpressway: RoadStyle;
  cityRoad: RoadStyle;
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
      },
      water: "#bcd9e9",
      river: "#8fbfdc",
      coast: { color: "#9bb7c9", width: 1 },
      cityLine: { color: "#8c9aab", width: 1.2 },
      districtLine: { color: "#b7c2ce", width: 0.8 },
      nationalExpressway: { fill: "#ffb84d", casing: "#dc8f2a" },
      territorialExpressway: { fill: "#ffe08a", casing: "#d9b04a" },
      cityRoad: { fill: "#ffffff", casing: "#d3d8de" },
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
          [0, "#13251f"],
          [150, "#172b22"],
          [400, "#232d22"],
          [700, "#2e2c22"],
          [1100, "#352c25"],
          [1500, "#3a332f"],
          [1900, "#4a4d55"],
          [2300, "#7d8796"],
        ],
        opacity: 0.9,
        exaggeration: 0.75,
        tintOpacity: 0.04,
      },
      water: "#0b2236",
      river: "#1d5c85",
      coast: { color: "#22d3ee", width: 1, glow: "rgba(34,211,238,0.35)" },
      cityLine: { color: "#2dd4bf", width: 1, glow: "rgba(45,212,191,0.28)" },
      districtLine: { color: "#25384d", width: 0.8 },
      nationalExpressway: { fill: "#fbbf24", casing: "#0f1624", glow: "rgba(251,191,36,0.35)" },
      territorialExpressway: { fill: "#fde68a", casing: "#0f1624", glow: "rgba(253,230,138,0.2)" },
      cityRoad: { fill: "#475569", casing: "#0f1624" },
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
