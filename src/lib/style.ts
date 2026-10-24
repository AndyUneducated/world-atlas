import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { FeatureCollection } from "geojson";
import type { LayerToggles } from "../store";
import { BASE_URL } from "./data";
import { PALETTE, type Theme } from "./themes";
import type { AtlasData, Lang } from "./types";

export interface FocusData {
  mask: FeatureCollection;
  outline: FeatureCollection;
}

export const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Population density class breaks, people per km². */
export const DENSITY_BREAKS = [50, 150, 400, 1200, 3000];

/** Invisible layers used for hit-testing clicks and hovers. */
export const HIT_LAYERS = {
  division: "hit-division",
  road: "hit-road",
  river: "hit-river",
  ridge: "hit-ridge",
  lake: "water",
  city: "city-dot",
} as const;

const FONT = {
  regular: ["Noto Sans Regular"],
  medium: ["Noto Sans Medium"],
  italic: ["Noto Sans Italic"],
};

const name = (lang: Lang): ExpressionSpecification => ["coalesce", ["get", `name_${lang}`], ["get", "name_zh"]];

const paletteColor = (fallback: string): ExpressionSpecification => [
  "match",
  ["get", "palette"],
  ...PALETTE.flatMap((c, i) => [i, c]),
  fallback,
] as unknown as ExpressionSpecification;

const visible = (on: boolean) => (on ? "visible" : "none") as "visible" | "none";

export function shieldImageId(fill: string, stroke: string) {
  return `shield|${fill}|${stroke}`;
}

export function buildStyle(opts: {
  theme: Theme;
  lang: Lang;
  data: AtlasData;
  layers: LayerToggles;
  focus: FocusData;
}): StyleSpecification {
  const { theme, lang, data, layers, focus } = opts;
  const m = theme.map;
  const dem = data.manifest.dem;
  const other: Lang = lang === "zh" ? "en" : "zh";

  const sources: Record<string, SourceSpecification> = {
    divisions: { type: "geojson", data: data.layers.divisions, promoteId: "id" },
    labels: { type: "geojson", data: data.layers.labels },
    water: { type: "geojson", data: data.layers.water, promoteId: "id" },
    rivers: { type: "geojson", data: data.layers.rivers },
    "rivers-named": { type: "geojson", data: data.layers["rivers-named"], promoteId: "id" },
    ridges: { type: "geojson", data: data.layers.ridges, promoteId: "id" },
    roads: { type: "geojson", data: data.layers.roads, promoteId: "id" },
    bathymetry: { type: "geojson", data: data.layers.bathymetry },
    context: { type: "geojson", data: data.layers.context },
    "focus-mask": { type: "geojson", data: focus.mask },
    "focus-outline": { type: "geojson", data: focus.outline },
    dem: {
      type: "raster-dem",
      tiles: [`${BASE_URL}data/${dem.tiles}`],
      encoding: dem.encoding,
      tileSize: dem.tileSize,
      minzoom: dem.minzoom,
      maxzoom: dem.maxzoom,
      bounds: dem.bounds,
    },
  };

  const isSubtype = (s: string): ExpressionSpecification => ["==", ["get", "subtype"], s];
  const isKind = (k: string): ExpressionSpecification => ["==", ["get", "kind"], k];
  const isClass = (c: string): ExpressionSpecification => ["==", ["get", "class"], c];

  const style: LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": m.background } },
    {
      id: "bathymetry",
      type: "fill",
      source: "bathymetry",
      paint: { "fill-color": ["match", ["get", "band"], 0, m.bathymetry[0], 1, m.bathymetry[1], m.bathymetry[2]], "fill-antialias": false },
    },
    { id: "context-fill", type: "fill", source: "context", paint: { "fill-color": m.context.fill } },
    {
      id: "context-line",
      type: "line",
      source: "context",
      paint: { "line-color": m.context.line, "line-width": 1, "line-dasharray": [3, 2] },
    },
    { id: "land", type: "fill", source: "divisions", filter: isSubtype("dependency"), paint: { "fill-color": m.land } },
  ];

  if (m.colorRelief) {
    style.push({
      id: "color-relief",
      type: "color-relief",
      source: "dem",
      paint: {
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          -40,
          "rgba(0,0,0,0)",
          -1,
          "rgba(0,0,0,0)",
          ...m.colorRelief.flat(),
        ] as unknown as ExpressionSpecification,
        "color-relief-opacity": 0.92,
      },
    } as LayerSpecification);
  }
  if (m.tintOpacity > 0) {
    style.push({
      id: "city-tint",
      type: "fill",
      source: "divisions",
      filter: isSubtype("locality"),
      paint: { "fill-color": paletteColor(m.land), "fill-opacity": m.tintOpacity },
    });
  }

  const [c0, c1, c2, c3, c4, c5] = m.choropleth;
  style.push(
    {
      id: "choropleth",
      type: "fill",
      source: "divisions",
      filter: isSubtype("borough"),
      layout: { visibility: visible(layers.choropleth) },
      paint: {
        "fill-color": ["step", ["coalesce", ["get", "density"], 0], c0, ...DENSITY_BREAKS.flatMap((b, i) => [b, [c1, c2, c3, c4, c5][i]])] as ExpressionSpecification,
        "fill-opacity": 0.82,
      },
    },
    {
      id: "hillshade",
      type: "hillshade",
      source: "dem",
      layout: { visibility: visible(layers.hillshade) },
      paint: {
        "hillshade-shadow-color": m.hillshade.shadow,
        "hillshade-highlight-color": m.hillshade.highlight,
        "hillshade-accent-color": m.hillshade.accent,
        "hillshade-exaggeration": m.hillshade.exaggeration,
        "hillshade-illumination-direction": 315,
      },
    },
    { id: "water", type: "fill", source: "water", paint: { "fill-color": m.water } },
    {
      id: "rivers",
      type: "line",
      source: "rivers",
      minzoom: 6,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": m.river,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 9, 1],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6,
          ["interpolate", ["linear"], ["get", "magnitude"], 25, 0.25, 1500, 1.4],
          12,
          ["interpolate", ["linear"], ["get", "magnitude"], 25, 1, 1500, 5],
        ],
      },
    },
    {
      id: "district-line",
      type: "line",
      source: "divisions",
      minzoom: 7.4,
      filter: isSubtype("borough"),
      layout: { visibility: visible(layers.boundaries), "line-join": "round" },
      paint: {
        "line-color": m.districtLine.color,
        "line-width": ["interpolate", ["linear"], ["zoom"], 7.4, 0.4, 12, m.districtLine.width * 1.6],
        "line-dasharray": [3, 2],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 7.4, 0, 8, 1],
      },
    },
  );

  if (m.cityLine.glow) {
    style.push({
      id: "city-line-glow",
      type: "line",
      source: "divisions",
      filter: isSubtype("locality"),
      layout: { visibility: visible(layers.boundaries), "line-join": "round" },
      paint: { "line-color": m.cityLine.glow, "line-width": 5, "line-blur": 4 },
    });
  }
  style.push({
    id: "city-line",
    type: "line",
    source: "divisions",
    filter: isSubtype("locality"),
    layout: { visibility: visible(layers.boundaries), "line-join": "round" },
    paint: {
      "line-color": m.cityLine.color,
      "line-width": ["interpolate", ["linear"], ["zoom"], 5, m.cityLine.width * 0.6, 10, m.cityLine.width * 1.8],
    },
  });
  if (m.coast.glow) {
    style.push({
      id: "coast-glow",
      type: "line",
      source: "divisions",
      filter: isSubtype("dependency"),
      paint: { "line-color": m.coast.glow, "line-width": 7, "line-blur": 6 },
    });
  }
  style.push({
    id: "coast",
    type: "line",
    source: "divisions",
    filter: isSubtype("dependency"),
    layout: { "line-join": "round" },
    paint: { "line-color": m.coast.color, "line-width": ["interpolate", ["linear"], ["zoom"], 4, m.coast.width * 0.6, 10, m.coast.width * 1.6] },
  });

  const roadWidth = (base: number): ExpressionSpecification => [
    "interpolate",
    ["exponential", 1.6],
    ["zoom"],
    5,
    base * 0.5,
    8,
    base * 1.4,
    11,
    base * 3.2,
    15,
    base * 10,
  ];
  const roadLayout = { visibility: visible(layers.roads), "line-cap": "round", "line-join": "round" } as const;
  style.push(
    {
      id: "secondary-casing",
      type: "line",
      source: "roads",
      minzoom: 7.6,
      filter: isClass("secondary"),
      layout: roadLayout,
      paint: { "line-color": m.secondary.casing, "line-width": roadWidth(1.2), "line-gap-width": 0 },
    },
    {
      id: "secondary",
      type: "line",
      source: "roads",
      minzoom: 7.6,
      filter: isClass("secondary"),
      layout: roadLayout,
      paint: { "line-color": m.secondary.fill, "line-width": roadWidth(0.7) },
    },
  );
  if (m.motorway.glow) {
    style.push({
      id: "motorway-glow",
      type: "line",
      source: "roads",
      filter: isClass("motorway"),
      layout: roadLayout,
      paint: { "line-color": m.motorway.glow, "line-width": roadWidth(3), "line-blur": 3 },
    });
  }
  style.push(
    {
      id: "motorway-casing",
      type: "line",
      source: "roads",
      filter: isClass("motorway"),
      layout: roadLayout,
      paint: { "line-color": m.motorway.casing, "line-width": roadWidth(1.7) },
    },
    {
      id: "motorway",
      type: "line",
      source: "roads",
      filter: isClass("motorway"),
      layout: roadLayout,
      paint: { "line-color": m.motorway.fill, "line-width": roadWidth(1.1) },
    },
    {
      id: "hover-line",
      type: "line",
      source: "divisions",
      layout: { "line-join": "round" },
      paint: {
        "line-color": m.hover,
        "line-width": 2,
        "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0],
      },
    },
    {
      id: "focus-mask",
      type: "fill",
      source: "focus-mask",
      paint: { "fill-color": m.focus.mask, "fill-opacity": m.focus.maskOpacity, "fill-antialias": false },
    },
    {
      id: "focus-glow",
      type: "line",
      source: "focus-outline",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": m.focus.glow, "line-width": 9, "line-blur": 6 },
    },
    {
      id: "focus-line",
      type: "line",
      source: "focus-outline",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": m.focus.line, "line-width": 2.2 },
    },
  );

  // Invisible hit targets.
  style.push(
    { id: HIT_LAYERS.division, type: "fill", source: "divisions", filter: isSubtype("borough"), paint: { "fill-opacity": 0 } },
    {
      id: HIT_LAYERS.road,
      type: "line",
      source: "roads",
      layout: { visibility: visible(layers.roads) },
      paint: { "line-width": 12, "line-opacity": 0 },
    },
    { id: HIT_LAYERS.river, type: "line", source: "rivers-named", minzoom: 7, paint: { "line-width": 10, "line-opacity": 0 } },
    { id: HIT_LAYERS.ridge, type: "line", source: "ridges", minzoom: 6.5, paint: { "line-width": 14, "line-opacity": 0 } },
  );

  const halo = { "text-halo-color": m.label.halo, "text-halo-width": 1.4, "text-halo-blur": 0.4 };
  style.push(
    {
      id: "context-label",
      type: "symbol",
      source: "context",
      layout: {
        "text-field": ["format", name(lang), {}, "\n", {}, lang === "zh" ? "轮廓示意" : "outline sketch", { "font-scale": 0.75 }],
        "text-font": FONT.italic,
        "text-size": 12,
      },
      paint: { "text-color": m.context.label, ...halo },
    },
    {
      id: "ridge-label",
      type: "symbol",
      source: "ridges",
      minzoom: 6.8,
      layout: {
        "symbol-placement": "line",
        "text-field": name(lang),
        "text-font": FONT.italic,
        "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 11, 15],
        "text-letter-spacing": 0.35,
        "symbol-spacing": 400,
        "text-max-angle": 30,
      },
      paint: { "text-color": m.label.terrain, ...halo },
    },
    {
      id: "river-label",
      type: "symbol",
      source: "rivers-named",
      minzoom: 8,
      layout: {
        "symbol-placement": "line",
        "text-field": name(lang),
        "text-font": FONT.italic,
        "text-size": 11.5,
        "text-letter-spacing": 0.15,
        "symbol-spacing": 320,
        "text-max-angle": 35,
      },
      paint: { "text-color": m.label.water, ...halo },
    },
    {
      id: "lake-label",
      type: "symbol",
      source: "labels",
      minzoom: 8.5,
      filter: isKind("lake"),
      layout: { "text-field": name(lang), "text-font": FONT.italic, "text-size": 12 },
      paint: { "text-color": m.label.water, ...halo },
    },
    {
      id: "road-shield",
      type: "symbol",
      source: "roads",
      minzoom: 6.6,
      filter: isClass("motorway"),
      layout: {
        visibility: visible(layers.roads),
        "symbol-placement": "line",
        "symbol-spacing": 280,
        "text-field": ["get", "ref"],
        "text-font": FONT.medium,
        "text-size": 10,
        "text-rotation-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "icon-image": shieldImageId(m.shield.fill, m.shield.stroke),
        "icon-text-fit": "both",
        "icon-text-fit-padding": [2, 5, 2, 5],
      },
      paint: { "text-color": m.shield.text },
    },
    {
      id: "district-label",
      type: "symbol",
      source: "labels",
      minzoom: 8.3,
      filter: isKind("borough"),
      layout: {
        "text-field": name(lang),
        "text-font": FONT.regular,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8.3, 10.5, 12, 14],
        "text-max-width": 7,
        "text-letter-spacing": lang === "en" ? 0.04 : 0.1,
      },
      paint: {
        "text-color": m.label.minor,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 8.3, 0, 8.8, 1],
        ...halo,
      },
    },
    {
      id: HIT_LAYERS.city,
      type: "circle",
      source: "labels",
      minzoom: 5,
      filter: isKind("locality"),
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["get", "capital"], 3.6, 2.4], 10, ["case", ["get", "capital"], 6.5, 4.6]],
        "circle-color": ["case", ["get", "capital"], m.cityDot.capital, m.cityDot.fill],
        "circle-stroke-color": ["case", ["get", "capital"], m.cityDot.fill, m.cityDot.stroke],
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 10, 2],
      },
    },
  );

  const cityLabel = (id: string, filter: ExpressionSpecification, minzoom: number): LayerSpecification => ({
    id,
    type: "symbol",
    source: "labels",
    minzoom,
    filter,
    layout: {
      "text-field": ["format", name(lang), {}, "\n", {}, ["get", `name_${other}`], { "font-scale": 0.68, "text-font": ["literal", FONT.regular] }],
      "text-font": FONT.medium,
      "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11.5, 8, 14.5, 11, 17],
      "text-variable-anchor": ["top", "bottom", "left", "right"],
      "text-radial-offset": 0.75,
      "text-justify": "auto",
      "symbol-sort-key": ["get", "rank"],
      "text-letter-spacing": lang === "zh" ? 0.06 : 0.01,
    },
    paint: { "text-color": m.label.text, ...halo, "text-halo-width": 1.6 },
  });
  style.push(
    cityLabel("city-label-major", ["all", isKind("locality"), ["<=", ["get", "rank"], 2]], 5),
    cityLabel("city-label-minor", ["all", isKind("locality"), [">", ["get", "rank"], 2]], 6.2),
    {
      id: "territory-label",
      type: "symbol",
      source: "labels",
      maxzoom: 6.4,
      filter: isKind("dependency"),
      layout: {
        "text-field": name(lang),
        "text-font": FONT.medium,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 6, 20],
        "text-letter-spacing": 0.3,
        "text-transform": "uppercase",
      },
      paint: { "text-color": m.label.territory, ...halo },
    },
  );

  return {
    version: 8,
    name: `world-atlas-${theme.id}`,
    glyphs: `${BASE_URL}fonts/{fontstack}/{range}.pbf`,
    projection: { type: "globe" },
    sky: {
      "sky-color": m.sky.sky,
      "horizon-color": m.sky.horizon,
      "fog-color": m.sky.fog,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.5,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.8, 7, 0],
    },
    sources,
    layers: style,
  };
}
