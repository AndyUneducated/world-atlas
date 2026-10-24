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

export interface MapTheme {
  background: string;
  bathymetry: [string, string, string];
  context: { fill: string; line: string; label: string };
  land: string;
  tintOpacity: number;
  colorRelief?: [number, string][];
  hillshade: { shadow: string; highlight: string; accent: string; exaggeration: number };
  water: string;
  river: string;
  coast: { color: string; width: number; glow?: string };
  cityLine: { color: string; width: number; glow?: string };
  districtLine: { color: string; width: number };
  motorway: { fill: string; casing: string; glow?: string };
  secondary: { fill: string; casing: string };
  shield: { fill: string; text: string; stroke: string };
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
  tagline: Record<Lang, string>;
  dark: boolean;
  swatch: [string, string, string];
  map: MapTheme;
}

export const THEMES: Record<ThemeId, Theme> = {
  glacier: {
    id: "glacier",
    label: { zh: "冰川", en: "Glacier" },
    tagline: { zh: "浅色极简", en: "Light minimal" },
    dark: false,
    swatch: ["#f8fafc", "#cfe3ee", "#4C8BF5"],
    map: {
      background: "#c4dceb",
      bathymetry: ["#dcecf4", "#d2e6f0", "#cae0ec"],
      context: { fill: "#eef1f3", line: "#9fb3c2", label: "#7b8fa0" },
      land: "#f6f5f1",
      tintOpacity: 0.12,
      hillshade: { shadow: "#4b5d70", highlight: "#ffffff", accent: "#6b7f92", exaggeration: 0.32 },
      water: "#bcd9e9",
      river: "#8fbfdc",
      coast: { color: "#9bb7c9", width: 1 },
      cityLine: { color: "#8c9aab", width: 1.2 },
      districtLine: { color: "#b7c2ce", width: 0.8 },
      motorway: { fill: "#ffc861", casing: "#e2a23f" },
      secondary: { fill: "#ffffff", casing: "#d3d8de" },
      shield: { fill: "#ffffff", text: "#9a5b00", stroke: "#e2a23f" },
      label: { text: "#1c2533", halo: "rgba(255,255,255,0.92)", minor: "#5d6b7c", water: "#4a83a8", terrain: "#7a6a58", territory: "#45566b" },
      cityDot: { fill: "#ffffff", stroke: "#1c2533", capital: "#e5484d" },
      focus: { mask: "#0f1b2a", maskOpacity: 0.22, line: "#2563eb", glow: "rgba(37,99,235,0.35)" },
      hover: "#2563eb",
      choropleth: ["#f1f5f9", "#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#172554"],
      sky: { sky: "#9fc6e0", horizon: "#e8f2f8", fog: "#ffffff" },
    },
  },
  aurora: {
    id: "aurora",
    label: { zh: "极光", en: "Aurora" },
    tagline: { zh: "深色科技", en: "Dark tech" },
    dark: true,
    swatch: ["#070b14", "#111827", "#2dd4bf"],
    map: {
      background: "#05080f",
      bathymetry: ["#0d1626", "#0a121f", "#080e19"],
      context: { fill: "#0d1422", line: "#1f3a4d", label: "#3e6075" },
      land: "#0f1624",
      tintOpacity: 0.1,
      hillshade: { shadow: "#000000", highlight: "#3a4d6b", accent: "#1c2a40", exaggeration: 0.55 },
      water: "#0b2236",
      river: "#1d5c85",
      coast: { color: "#22d3ee", width: 1, glow: "rgba(34,211,238,0.35)" },
      cityLine: { color: "#2dd4bf", width: 1, glow: "rgba(45,212,191,0.28)" },
      districtLine: { color: "#25384d", width: 0.8 },
      motorway: { fill: "#fbbf24", casing: "#0f1624", glow: "rgba(251,191,36,0.35)" },
      secondary: { fill: "#475569", casing: "#0f1624" },
      shield: { fill: "#111a2b", text: "#fbbf24", stroke: "#fbbf24" },
      label: { text: "#e6edf7", halo: "rgba(5,8,15,0.9)", minor: "#8394ab", water: "#4fa6d6", terrain: "#8b9bb3", territory: "#6b7d96" },
      cityDot: { fill: "#0f1624", stroke: "#e6edf7", capital: "#f472b6" },
      focus: { mask: "#000000", maskOpacity: 0.5, line: "#5eead4", glow: "rgba(94,234,212,0.45)" },
      hover: "#5eead4",
      choropleth: ["#0f1624", "#123046", "#155e75", "#0e7490", "#14b8a6", "#99f6e4"],
      sky: { sky: "#020409", horizon: "#0b1a2e", fog: "#05080f" },
    },
  },
  atlas: {
    id: "atlas",
    label: { zh: "地形", en: "Atlas" },
    tagline: { zh: "写实地形", en: "Terrain relief" },
    dark: false,
    swatch: ["#efe9d8", "#8fb996", "#7a5c3e"],
    map: {
      background: "#8fb8c9",
      bathymetry: ["#b9d6df", "#a9cbd7", "#9cc1cf"],
      context: { fill: "#e3decb", line: "#8d8573", label: "#6f6757" },
      land: "#e9e2c9",
      tintOpacity: 0,
      colorRelief: [
        [0, "#a9c99a"],
        [150, "#b8d29b"],
        [400, "#d6d6a2"],
        [700, "#d9c38f"],
        [1100, "#c7a57d"],
        [1500, "#a88c74"],
        [1900, "#cfc8c1"],
        [2300, "#f7f7f5"],
      ],
      hillshade: { shadow: "#3d2f22", highlight: "#fff8e8", accent: "#5c4a37", exaggeration: 0.6 },
      water: "#9cc6d6",
      river: "#5f9fbf",
      coast: { color: "#5f7f8c", width: 0.9 },
      cityLine: { color: "#6b4f3a", width: 1.3 },
      districtLine: { color: "#9b8670", width: 0.8 },
      motorway: { fill: "#e4572e", casing: "#ffffff" },
      secondary: { fill: "#f6d488", casing: "#a8875a" },
      shield: { fill: "#ffffff", text: "#b33a1a", stroke: "#e4572e" },
      label: { text: "#2b2118", halo: "rgba(250,246,235,0.9)", minor: "#5e4d3c", water: "#2f6a8a", terrain: "#6b4a2b", territory: "#4d3d2e" },
      cityDot: { fill: "#ffffff", stroke: "#2b2118", capital: "#c0392b" },
      focus: { mask: "#2b2118", maskOpacity: 0.28, line: "#c0392b", glow: "rgba(192,57,43,0.3)" },
      hover: "#c0392b",
      choropleth: ["#f7f2e4", "#f2dfb0", "#e8b66f", "#d4823e", "#a94e22", "#6e2a10"],
      sky: { sky: "#a9cbd8", horizon: "#f1ead6", fog: "#f6f1e3" },
    },
  },
};

export const THEME_ORDER: ThemeId[] = ["glacier", "aurora", "atlas"];
