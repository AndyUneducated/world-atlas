import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { FeatureCollection } from "geojson";
import type { LayerToggles } from "../store";
import { BASE_URL } from "./data";
import { shieldImageId } from "./shields";
import { BUILDING_CLASSES, LANDCOVER_CLASSES, type Theme } from "./themes";
import type { AtlasData, Lang, LayerFile } from "./types";

export interface FocusData {
  mask: FeatureCollection;
  outline: FeatureCollection;
}

export const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Road network values (GB/T 917 administrative grades) behind each road layer toggle. */
export const ROAD_NETWORKS = {
  nationalExpressway: ["national_expressway", "national_highway"],
  territorialExpressway: ["territorial_expressway"],
  territorialHighway: ["territorial_highway"],
  cityRoads: ["municipal_road", "township_road"],
};

/** Population density class breaks, people per km². */
export const DENSITY_BREAKS = [50, 150, 400, 1200, 3000];

/** Invisible layers used for hit-testing clicks and hovers. */
export const HIT_LAYERS = {
  road: "hit-road",
  street: "hit-street",
  landmark: "hit-landmark",
  rail: "hit-rail",
  station: "hit-station",
  metroStation: "hit-metro-station",
  river: "hit-river",
  ridge: "hit-ridge",
  lake: "water",
  city: "city-dot",
} as const;

/** Division names give way to the finer names below them: the territory to its cities, cities once
 * the streets fill in, districts once landmark names appear. */
const TERRITORY_LABEL_MAX = 7;
const CITY_LABEL_MAX = 12.2;
const DISTRICT_LABEL_MIN = 7.4;
const DISTRICT_LABEL_MAX = 15;
const fadeOut = (z: number): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], z - 0.6, 1, z, 0];

/** Road sign layers, which double as hit targets for their road. */
export const SHIELD_LAYERS = ["road-shield", "road-shield-primary"];
/** Name labels of the territory, cities and districts: the only way to pick a division on the map. */
export const DIVISION_LABEL_LAYERS = ["district-label", "city-label-major", "city-label-minor", "territory-label"];

/** Coastal landform kinds (label `kind`), split by whether they are water or land. */
export const LANDFORM_KINDS = { water: ["bay", "fjord", "strait", "estuary"], land: ["island", "cape"] } as const;
/** Landform label layers, which double as their hit targets. */
export const LANDFORM_LABEL_LAYERS = [
  "peak-label-major",
  "peak-label",
  "pass-label",
  "glacier-label",
  "water-label-major",
  "water-label",
  "land-label-major",
  "land-label",
];

const FONT = {
  regular: ["Noto Sans Regular"],
  medium: ["Noto Sans Medium"],
  italic: ["Noto Sans Italic"],
};

const name = (lang: Lang): ExpressionSpecification => ["coalesce", ["get", `name_${lang}`], ["get", "name_zh"]];

const visible = (on: boolean) => (on ? "visible" : "none") as "visible" | "none";

/** Map symbol drawn on demand by the map view: a summit triangle or a pass mark. */
export function symbolImageId(kind: "peak" | "pass", color: string) {
  return `${kind}|${color}`;
}

export function buildStyle(opts: {
  theme: Theme;
  lang: Lang;
  data: AtlasData;
  layers: LayerToggles;
  focus: FocusData;
  route: FeatureCollection;
  measure: FeatureCollection;
  highlight: FeatureCollection;
}): StyleSpecification {
  const { theme, lang, data, layers, focus, route, measure, highlight } = opts;
  const m = theme.map;
  const dem = data.manifest.dem;
  const other: Lang = lang === "zh" ? "en" : "zh";

  const tiles = data.manifest.tiles;
  const tiled = new Set<LayerFile>(tiles?.layers ?? []);
  /** Where a layer's features come from: the tile archive, or the layer's own GeoJSON source. */
  const from = (name: LayerFile) => (tiled.has(name) ? { source: "tiles", "source-layer": name } : { source: name });

  const sources: Record<string, SourceSpecification> = {
    divisions: { type: "geojson", data: data.layers.divisions, promoteId: "id" },
    labels: { type: "geojson", data: data.layers.labels },
    water: { type: "geojson", data: data.layers.water, promoteId: "id" },
    "rivers-named": { type: "geojson", data: data.layers["rivers-named"], promoteId: "id" },
    ridges: { type: "geojson", data: data.layers.ridges, promoteId: "id" },
    roads: { type: "geojson", data: data.layers.roads, promoteId: "id" },
    context: { type: "geojson", data: data.layers.context },
    "focus-mask": { type: "geojson", data: focus.mask },
    "focus-outline": { type: "geojson", data: focus.outline },
    route: { type: "geojson", data: route },
    measure: { type: "geojson", data: measure },
    highlight: { type: "geojson", data: highlight },
    places: { type: "geojson", data: data.layers.places },
    coast: { type: "geojson", data: data.layers.coast, promoteId: "id" },
    glaciers: { type: "geojson", data: data.layers.glaciers },
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
  for (const name of ["bathymetry", "landcover", "rivers", "streets", "buildings", "parks"] as const) {
    if (!tiled.has(name)) sources[name] = { type: "geojson", data: data.layers[name] };
  }
  sources["streets-named"] = { type: "geojson", data: data.layers["streets-named"], promoteId: "id" };
  sources.landmarks = { type: "geojson", data: data.layers.landmarks, promoteId: "id" };
  sources.rail = { type: "geojson", data: data.layers.rail };
  sources.stations = { type: "geojson", data: data.layers.stations };
  if (tiles) sources.tiles = { type: "vector", url: `pmtiles://${BASE_URL}data/${tiles.url}` };

  const isSubtype = (s: string): ExpressionSpecification => ["==", ["get", "subtype"], s];
  const isKind = (k: string): ExpressionSpecification => ["==", ["get", "kind"], k];
  const isClass = (c: string): ExpressionSpecification => ["==", ["get", "class"], c];

  const style: LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": m.background } },
    {
      id: "bathymetry",
      type: "fill",
      ...from("bathymetry"),
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

  style.push({
      id: "color-relief",
      type: "color-relief",
      source: "dem",
      layout: { visibility: visible(layers.terrain) },
      paint: {
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          -40,
          "rgba(0,0,0,0)",
          -1,
          "rgba(0,0,0,0)",
          ...m.terrain.relief.flat(),
        ] as unknown as ExpressionSpecification,
        "color-relief-opacity": m.terrain.opacity,
      },
    } as LayerSpecification);
  style.push({
    id: "city-tint",
    type: "fill",
    source: "divisions",
    filter: isSubtype("locality"),
    paint: { "fill-color": ["coalesce", ["get", "color"], m.land], "fill-opacity": layers.terrain ? m.terrain.tintOpacity : m.tintOpacity },
  });

  style.push({
    id: "landcover",
    type: "fill",
    ...from("landcover"),
    layout: { visibility: visible(layers.landcover) },
    paint: {
      "fill-color": ["match", ["get", "class"], ...LANDCOVER_CLASSES.flatMap((c) => [c, m.landcover.colors[c]]), m.land] as unknown as ExpressionSpecification,
      "fill-opacity": layers.terrain ? m.landcover.opacity * 0.5 : m.landcover.opacity,
      "fill-antialias": false,
    },
  });

  const buildingsLayout = { visibility: visible(layers.buildings) };
  const fadeIn = (z: number, to = 1): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], z, 0, z + 0.8, to];
  const isFacility: ExpressionSpecification = ["==", ["get", "facility"], true];

  /** Facility grounds and their parts, above the coast line since harbours and offshore ports are reclaimed from the sea. */
  function facilityLayers(): LayerSpecification[] {
    const b = m.building;
    const f = b.facility;
    const layout = buildingsLayout;
    const isPart = (kind: string): ExpressionSpecification => ["all", isFacility, ["==", ["get", "part"], kind]];
    return [
      { id: "facility-grounds", type: "fill", source: "landmarks", minzoom: 9.4, filter: ["all", ["has", "id"], isFacility], layout, paint: { "fill-color": f.grounds, "fill-opacity": fadeIn(9.4, 0.9) } },
      { id: "facility-basin", type: "fill", source: "landmarks", minzoom: 9.4, filter: isPart("basin"), layout, paint: { "fill-color": m.water, "fill-opacity": fadeIn(9.4) } },
      { id: "facility-breakwater", type: "fill", source: "landmarks", minzoom: 9.4, filter: isPart("breakwater"), layout, paint: { "fill-color": f.breakwater, "fill-opacity": fadeIn(9.4) } },
      { id: "facility-paved", type: "fill", source: "landmarks", minzoom: 10.2, filter: isPart("paved"), layout, paint: { "fill-color": f.paved, "fill-opacity": fadeIn(10.2) } },
      { id: "facility-lot", type: "fill", source: "landmarks", minzoom: 11.5, filter: isPart("lot"), layout, paint: { "fill-color": f.lot, "fill-opacity": fadeIn(11.5), "fill-outline-color": f.paved } },
      { id: "facility-bulk", type: "fill", source: "landmarks", minzoom: 11, filter: isPart("bulk"), layout, paint: { "fill-color": f.bulk, "fill-opacity": fadeIn(11) } },
      { id: "facility-stack", type: "fill", source: "landmarks", minzoom: 11.5, filter: isPart("stack"), layout, paint: { "fill-color": f.stack, "fill-opacity": fadeIn(11.5) } },
      { id: "facility-rail", type: "fill", source: "landmarks", minzoom: 12, filter: isPart("rail"), layout, paint: { "fill-color": f.rail, "fill-opacity": fadeIn(12) } },
      { id: "facility-tank", type: "fill", source: "landmarks", minzoom: 11.5, filter: isPart("tank"), layout, paint: { "fill-color": f.tank, "fill-opacity": fadeIn(11.5), "fill-outline-color": f.tankLine } },
      { id: "facility-bridge", type: "fill", source: "landmarks", minzoom: 12, filter: isPart("bridge"), layout, paint: { "fill-color": f.paved, "fill-opacity": fadeIn(12) } },
      {
        id: "facility-bridge-line",
        type: "line",
        source: "landmarks",
        minzoom: 8,
        filter: isPart("bridge"),
        layout,
        paint: { "line-color": f.bridge, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 12, 1.4, 15, 2], "line-opacity": fadeIn(8) },
      },
      { id: "facility-runway", type: "fill", source: "landmarks", minzoom: 9.4, filter: isPart("runway"), layout, paint: { "fill-color": f.runway, "fill-opacity": fadeIn(9.4) } },
      { id: "facility-pad", type: "fill", source: "landmarks", minzoom: 10.5, filter: isPart("pad"), layout, paint: { "fill-color": f.pad, "fill-opacity": fadeIn(10.5), "fill-outline-color": f.runway } },
      { id: "facility-building", type: "fill", source: "landmarks", minzoom: 11.5, filter: isPart("building"), layout, paint: { "fill-color": b.landmark.fill, "fill-opacity": fadeIn(11.5), "fill-outline-color": b.landmark.outline } },
    ] as LayerSpecification[];
  }

  /** Parks, landmark grounds and building footprints, fading in as the city streets fill in. */
  function buildingLayers(): LayerSpecification[] {
    const b = m.building;
    const layout = buildingsLayout;
    const isSite: ExpressionSpecification = ["all", ["has", "id"], ["!", isFacility]];
    return [
      { id: "park", type: "fill", ...from("parks"), minzoom: 12, layout, paint: { "fill-color": b.park, "fill-opacity": fadeIn(12) } },
      {
        id: "landmark-grounds",
        type: "fill",
        source: "landmarks",
        minzoom: 12,
        filter: isSite,
        layout,
        paint: {
          "fill-color": ["match", ["get", "layout"], "park", b.landmark.park, "plaza", b.landmark.plaza, "campus", b.landmark.park, b.landmark.grounds],
          "fill-opacity": fadeIn(12),
        },
      },
      {
        id: "building",
        type: "fill",
        ...from("buildings"),
        minzoom: 13,
        layout,
        paint: {
          "fill-color": ["match", ["get", "class"], ...BUILDING_CLASSES.flatMap((c) => [c, b.fill[c]]), b.fill.residential] as unknown as ExpressionSpecification,
          "fill-opacity": fadeIn(13),
          "fill-outline-color": b.outline,
        },
      },
      {
        id: "landmark-building",
        type: "fill",
        source: "landmarks",
        minzoom: 12.5,
        filter: ["all", ["!", ["has", "id"]], ["!", isFacility]],
        layout,
        paint: { "fill-color": b.landmark.fill, "fill-opacity": fadeIn(12.5) },
      },
      {
        id: "landmark-site-line",
        type: "line",
        source: "landmarks",
        minzoom: 12.5,
        filter: isSite,
        layout,
        paint: { "line-color": b.landmark.outline, "line-width": 0.8, "line-opacity": fadeIn(12.5, 0.8), "line-dasharray": [2, 1.5] },
      },
      {
        id: "landmark-building-line",
        type: "line",
        source: "landmarks",
        minzoom: 12.5,
        filter: ["all", ["!", ["has", "id"]], ["!", isFacility]],
        layout,
        paint: { "line-color": b.landmark.outline, "line-width": 1.1, "line-opacity": fadeIn(12.5, 0.9) },
      },
    ] as LayerSpecification[];
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
    // Ice under the hillshade, so the relief of the ice fields stays visible
    { id: "glacier", type: "fill", source: "glaciers", paint: { "fill-color": m.glacier.fill, "fill-opacity": 0.9 } },
    {
      id: "hillshade",
      type: "hillshade",
      source: "dem",
      paint: {
        "hillshade-shadow-color": layers.terrain ? m.terrain.shadow : m.hillshade.shadow,
        "hillshade-highlight-color": layers.terrain ? m.terrain.highlight : m.hillshade.highlight,
        "hillshade-accent-color": m.hillshade.accent,
        "hillshade-exaggeration": layers.terrain ? m.terrain.exaggeration : m.hillshade.exaggeration,
        "hillshade-illumination-direction": 315,
      },
    },
    {
      id: "glacier-line",
      type: "line",
      source: "glaciers",
      minzoom: 7,
      paint: { "line-color": m.glacier.line, "line-width": 0.8, "line-dasharray": [2, 1.5] },
    },
    { id: "water", type: "fill", source: "water", paint: { "fill-color": m.water } },
    {
      id: "rivers",
      type: "line",
      ...from("rivers"),
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
    ...buildingLayers(),
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
  style.push(...facilityLayers());

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
  const roadLayout = (on: boolean) => ({ visibility: visible(on), "line-cap": "round", "line-join": "round" }) as const;

  // City streets sit under the numbered roads and show with the city road layer.
  const streetWidth = (base: number): ExpressionSpecification => ["interpolate", ["exponential", 1.8], ["zoom"], 10, base * 0.35, 13, base * 1.6, 15, base * 5];
  const streetTiers = [
    { cls: "local", s: m.street.local, minzoom: 12, w: 1 },
    { cls: "collector", s: m.street.collector, minzoom: 11, w: 1.5 },
    { cls: "arterial", s: m.street.arterial, minzoom: 10, w: 2.2 },
  ];
  for (const part of ["casing", "fill"] as const) {
    for (const t of streetTiers) {
      style.push({
        id: `street-${t.cls}${part === "casing" ? "-casing" : ""}`,
        type: "line",
        ...from("streets"),
        minzoom: t.minzoom,
        filter: isClass(t.cls),
        layout: roadLayout(layers.cityRoads),
        paint: {
          "line-color": t.s[part],
          "line-width": streetWidth(part === "casing" ? t.w + 0.9 : t.w),
          "line-opacity": ["interpolate", ["linear"], ["zoom"], t.minzoom, 0, t.minzoom + 0.6, 1],
        },
      } as LayerSpecification);
    }
  }
  const roadTiers = [
    { id: "city-road", network: ROAD_NETWORKS.cityRoads, s: m.cityRoad, on: layers.cityRoads, casing: 1.2, fill: 0.7, minzoom: 7.6 },
    { id: "territorial-highway", network: ROAD_NETWORKS.territorialHighway, s: m.territorialExpressway, on: layers.territorialHighway, casing: 1.3, fill: 0.75, minzoom: 0 },
    { id: "territorial-expressway", network: ROAD_NETWORKS.territorialExpressway, s: m.territorialExpressway, on: layers.territorialExpressway, casing: 1.6, fill: 1, minzoom: 0 },
    { id: "national-expressway", network: ROAD_NETWORKS.nationalExpressway, s: m.nationalExpressway, on: layers.nationalExpressway, casing: 1.8, fill: 1.2, minzoom: 0 },
  ];
  for (const r of roadTiers) {
    const filter: ExpressionSpecification = ["in", ["get", "network"], ["literal", r.network]];
    if (r.s.glow) {
      style.push({ id: `${r.id}-glow`, type: "line", source: "roads", minzoom: r.minzoom, filter, layout: roadLayout(r.on), paint: { "line-color": r.s.glow, "line-width": roadWidth(r.casing * 1.8), "line-blur": 3 } });
    }
    style.push(
      { id: `${r.id}-casing`, type: "line", source: "roads", minzoom: r.minzoom, filter, layout: roadLayout(r.on), paint: { "line-color": r.s.casing, "line-width": roadWidth(r.casing) } },
      { id: r.id, type: "line", source: "roads", minzoom: r.minzoom, filter, layout: roadLayout(r.on), paint: { "line-color": r.s.fill, "line-width": roadWidth(r.fill) } },
    );
  }

  // Metro lines run in their own colours under the intercity rail, which is a dark line with light ticks.
  const rs = m.rail;
  const railWidth = (base: number): ExpressionSpecification => ["interpolate", ["exponential", 1.5], ["zoom"], 6, base * 0.45, 10, base, 14, base * 2.2];
  const metroLine: ExpressionSpecification = ["all", ["==", ["get", "network"], "metro"], ["==", ["get", "role"], "line"]];
  const railTrack: ExpressionSpecification = ["==", ["get", "role"], "track"];
  const metroFade: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 9.6, 0, 10.4, 1];
  style.push(
    { id: "metro-casing", type: "line", source: "rail", minzoom: 9.6, filter: metroLine, layout: roadLayout(layers.metro), paint: { "line-color": rs.metroCasing, "line-width": railWidth(4.6), "line-opacity": metroFade } },
    { id: "metro-line", type: "line", source: "rail", minzoom: 9.6, filter: metroLine, layout: roadLayout(layers.metro), paint: { "line-color": ["get", "color"], "line-width": railWidth(2.8), "line-opacity": metroFade } },
    { id: "rail-casing", type: "line", source: "rail", filter: railTrack, layout: { ...roadLayout(layers.railways), "line-cap": "butt" }, paint: { "line-color": rs.casing, "line-width": railWidth(3.4) } },
    { id: "rail-ticks", type: "line", source: "rail", minzoom: 8, filter: railTrack, layout: { ...roadLayout(layers.railways), "line-cap": "butt" }, paint: { "line-color": rs.fill, "line-width": railWidth(1.6), "line-dasharray": [3, 3] } },
  );

  const shownNetworks = [
    ...(layers.nationalExpressway ? ROAD_NETWORKS.nationalExpressway : []),
    ...(layers.territorialExpressway ? ROAD_NETWORKS.territorialExpressway : []),
    ...(layers.territorialHighway ? ROAD_NETWORKS.territorialHighway : []),
    ...(layers.cityRoads ? ROAD_NETWORKS.cityRoads : []),
  ];
  const roadShown: ExpressionSpecification = ["in", ["get", "network"], ["literal", shownNetworks]];
  style.push(
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
    {
      id: "route-casing",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": m.focus.glow, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 9, 12, 16], "line-blur": 2 },
    },
    {
      id: "route-line",
      type: "line",
      source: "route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": m.focus.line, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 4, 12, 8] },
    },
    {
      id: "highlight-glow",
      type: "line",
      source: "highlight",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": m.focus.glow, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 12, 12, 22], "line-blur": 5 },
    },
    {
      id: "highlight-line",
      type: "line",
      source: "highlight",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": m.focus.line, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 12, 7] },
    },
  );

  // Invisible hit targets.
  style.push(
    {
      id: HIT_LAYERS.road,
      type: "line",
      source: "roads",
      filter: roadShown,
      paint: { "line-width": 12, "line-opacity": 0 },
    },
    {
      id: HIT_LAYERS.landmark,
      type: "fill",
      source: "landmarks",
      minzoom: 9.4,
      filter: ["has", "id"],
      layout: { visibility: visible(layers.buildings) },
      paint: { "fill-opacity": 0 },
    },
    {
      id: HIT_LAYERS.rail,
      type: "line",
      source: "rail",
      filter: ["all", ["==", ["get", "role"], "line"], ["in", ["get", "network"], ["literal", [...(layers.railways ? ["intercity_rail"] : []), ...(layers.metro ? ["metro"] : [])]]]],
      paint: { "line-width": 10, "line-opacity": 0 },
    },
    { id: HIT_LAYERS.street, type: "line", source: "streets-named", minzoom: 11, layout: { visibility: visible(layers.cityRoads) }, paint: { "line-width": 10, "line-opacity": 0 } },
    { id: HIT_LAYERS.river, type: "line", source: "rivers-named", minzoom: 7, paint: { "line-width": 10, "line-opacity": 0 } },
    { id: HIT_LAYERS.ridge, type: "line", source: "ridges", minzoom: 6.5, paint: { "line-width": 14, "line-opacity": 0 } },
  );

  const halo = { "text-halo-color": m.label.halo, "text-halo-width": 1.4, "text-halo-blur": 0.4 };

  /** Railway stations from zoom 7.5, metro stations once the city streets show; interchanges are larger. */
  function stationLayers(): LayerSpecification[] {
    const tiers = [
      { id: "rail-station", kind: "rail", on: layers.railways, minzoom: 7.5, label: 9.4, r: [7.5, 2.6, 12, 5, 16, 8] },
      { id: "metro-station", kind: "metro", on: layers.metro, minzoom: 11.4, label: 12.8, r: [11.4, 2.2, 14, 4.4, 16, 6.5] },
    ];
    const out: LayerSpecification[] = [];
    for (const t of tiers) {
      const filter: ExpressionSpecification = ["==", ["get", "kind"], t.kind];
      const [z0, r0, z1, r1, z2, r2] = t.r;
      const grow = (r: number): ExpressionSpecification => ["case", ["get", "transfer"], r * 1.3, r];
      out.push(
        {
          id: t.id,
          type: "circle",
          source: "stations",
          minzoom: t.minzoom,
          filter,
          layout: { visibility: visible(t.on) },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], z0, grow(r0), z1, grow(r1), z2, grow(r2)],
            "circle-color": m.rail.station,
            "circle-stroke-color": t.kind === "metro" ? ["case", ["get", "transfer"], m.rail.stationStroke, ["coalesce", ["get", "color"], m.rail.stationStroke]] : m.rail.stationStroke,
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], z0, 1.2, z1, 2],
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z0 + 0.4, 1],
            "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z0 + 0.4, 1],
          },
        },
        {
          id: `${t.id}-label`,
          type: "symbol",
          source: "stations",
          minzoom: t.label,
          filter,
          layout: {
            visibility: visible(t.on),
            "text-field": name(lang),
            "text-font": t.kind === "rail" ? FONT.medium : FONT.regular,
            "text-size": t.kind === "rail" ? ["interpolate", ["linear"], ["zoom"], t.label, 10.5, 13, 12.5] : 10.5,
            "text-variable-anchor": ["left", "right", "top", "bottom"],
            "text-radial-offset": 0.9,
            "text-justify": "auto",
            "text-max-width": 7,
            "symbol-sort-key": ["case", ["get", "transfer"], 0, 1],
          },
          paint: { "text-color": m.rail.label, ...halo },
        },
        {
          id: t.kind === "rail" ? HIT_LAYERS.station : HIT_LAYERS.metroStation,
          type: "circle",
          source: "stations",
          minzoom: t.minzoom,
          filter,
          layout: { visibility: visible(t.on) },
          paint: { "circle-radius": 9, "circle-opacity": 0 },
        },
      );
    }
    return out;
  }
  style.push(
    {
      id: "context-label",
      type: "symbol",
      source: "context",
      layout: {
        "text-field": name(lang),
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
    ...[
      { id: "street-label-major", filter: ["!=", ["get", "class"], "local"] as ExpressionSpecification, minzoom: 11.6, size: 11.5 },
      { id: "street-label", filter: isClass("local"), minzoom: 13.6, size: 10.5 },
    ].map(
      (l) =>
        ({
          id: l.id,
          type: "symbol",
          ...from("streets"),
          minzoom: l.minzoom,
          filter: l.filter,
          layout: {
            visibility: visible(layers.cityRoads),
            "symbol-placement": "line",
            "text-field": name(lang),
            "text-font": FONT.regular,
            "text-size": l.size,
            "symbol-spacing": 260,
            "text-max-angle": 30,
            "text-padding": 4,
          },
          paint: { "text-color": m.street.label, ...halo },
        }) as LayerSpecification,
    ),
    {
      id: "lake-label",
      type: "symbol",
      source: "labels",
      minzoom: 8.5,
      filter: isKind("lake"),
      layout: { "text-field": name(lang), "text-font": FONT.italic, "text-size": 12 },
      paint: { "text-color": m.label.water, ...halo },
    },
  );

  const landformLabel = (id: string, kinds: readonly string[], major: boolean, minzoom: number, water: boolean): LayerSpecification => ({
    id,
    type: "symbol",
    source: "labels",
    minzoom,
    filter: ["all", ["in", ["get", "kind"], ["literal", kinds]], ["==", ["coalesce", ["get", "major"], false], major]],
    layout: {
      "text-field": name(lang),
      "text-font": water ? FONT.italic : FONT.regular,
      "text-size": major
        ? ["interpolate", ["linear"], ["zoom"], minzoom, 11.5, 11, 15]
        : ["interpolate", ["linear"], ["zoom"], minzoom, 10.5, 12, 13],
      "text-letter-spacing": water ? 0.18 : 0.06,
      "text-max-width": 6,
      ...(water ? {} : { "text-variable-anchor": ["center", "top", "bottom"], "text-radial-offset": 0.3 }),
    },
    paint: { "text-color": water ? m.label.water : m.label.terrain, ...halo },
  });
  const summitLabel = (id: string, kind: "peak" | "pass", major: boolean, minzoom: number): LayerSpecification => ({
    id,
    type: "symbol",
    source: "labels",
    minzoom,
    filter: ["all", isKind(kind), ["==", ["coalesce", ["get", "major"], false], major]],
    layout: {
      "icon-image": symbolImageId(kind, m.peak),
      "icon-size": major ? 1 : 0.85,
      "text-field": [
        "format",
        name(lang),
        {},
        "\n",
        {},
        ["concat", ["number-format", ["get", "elev"], { locale: "en-US" }], " m"],
        { "font-scale": 0.78, "text-font": ["literal", FONT.regular] },
      ] as ExpressionSpecification,
      "text-font": FONT.medium,
      "text-size": major ? ["interpolate", ["linear"], ["zoom"], minzoom, 11, 11, 13.5] : 11,
      "text-anchor": "top",
      "text-offset": [0, 0.75],
      "text-optional": true,
      "symbol-sort-key": ["-", 0, ["get", "elev"]],
    },
    paint: { "text-color": m.label.terrain, ...halo },
  });
  style.push(
    landformLabel("water-label-major", LANDFORM_KINDS.water, true, 6.6, true),
    landformLabel("water-label", LANDFORM_KINDS.water, false, 8.4, true),
    landformLabel("land-label-major", LANDFORM_KINDS.land, true, 7.4, false),
    landformLabel("land-label", LANDFORM_KINDS.land, false, 8.8, false),
    {
      id: "glacier-label",
      type: "symbol",
      source: "labels",
      minzoom: 8,
      filter: isKind("glacier"),
      layout: { "text-field": name(lang), "text-font": FONT.italic, "text-size": 11, "text-letter-spacing": 0.12, "text-max-width": 6 },
      paint: { "text-color": m.label.water, ...halo },
    },
    summitLabel("peak-label-major", "peak", true, 6.8),
    summitLabel("peak-label", "peak", false, 8.2),
    summitLabel("pass-label", "pass", false, 8.6),
  );

  const shieldLayer = (id: string, cls: string, minzoom: number, spacing: number): LayerSpecification => ({
    id,
    type: "symbol",
    source: "roads",
    minzoom,
    filter: ["all", isClass(cls), roadShown, ["has", "ref"]],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": spacing,
      "icon-image": ["concat", shieldImageId(""), ["get", "ref"]],
      "icon-rotation-alignment": "viewport",
      "icon-size": ["interpolate", ["linear"], ["zoom"], minzoom, 0.85, 10, 1],
    },
  });
  style.push(
    shieldLayer("road-shield", "motorway", 6.6, 300),
    shieldLayer("road-shield-primary", "primary", 7.8, 340),
    {
      id: "district-label",
      type: "symbol",
      source: "labels",
      minzoom: DISTRICT_LABEL_MIN,
      maxzoom: DISTRICT_LABEL_MAX,
      filter: isKind("borough"),
      layout: {
        "text-field": name(lang),
        "text-font": FONT.medium,
        "text-size": ["interpolate", ["linear"], ["zoom"], DISTRICT_LABEL_MIN, 13, 10, 15.5, 13, 18],
        "text-max-width": 7,
        "text-letter-spacing": lang === "en" ? 0.04 : 0.1,
      },
      paint: {
        "text-color": m.label.minor,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], DISTRICT_LABEL_MIN, 0, DISTRICT_LABEL_MIN + 0.4, 1, DISTRICT_LABEL_MAX - 0.6, 1, DISTRICT_LABEL_MAX, 0],
        ...halo,
      },
    },
    {
      id: HIT_LAYERS.city,
      type: "circle",
      source: "labels",
      minzoom: 5,
      maxzoom: CITY_LABEL_MAX,
      filter: isKind("locality"),
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, ["case", ["get", "capital"], 3.6, 2.4], 10, ["case", ["get", "capital"], 6.5, 4.6]],
        "circle-color": ["case", ["get", "capital"], m.cityDot.capital, m.cityDot.fill],
        "circle-stroke-color": ["case", ["get", "capital"], m.cityDot.fill, m.cityDot.stroke],
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 1.2, 10, 2],
        "circle-opacity": fadeOut(CITY_LABEL_MAX),
        "circle-stroke-opacity": fadeOut(CITY_LABEL_MAX),
      },
    },
  );

  const cityLabel = (id: string, filter: ExpressionSpecification, minzoom: number): LayerSpecification => ({
    id,
    type: "symbol",
    source: "labels",
    minzoom,
    maxzoom: CITY_LABEL_MAX,
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
    paint: { "text-color": m.label.text, ...halo, "text-halo-width": 1.6, "text-opacity": fadeOut(CITY_LABEL_MAX) },
  });
  style.push(
    {
      id: "landmark-label",
      type: "symbol",
      source: "landmarks",
      minzoom: 13.4,
      filter: ["all", ["has", "label_of"], ["!", isFacility]],
      layout: {
        visibility: visible(layers.buildings),
        "text-field": name(lang),
        "text-font": FONT.medium,
        "text-size": ["interpolate", ["linear"], ["zoom"], 13.4, 10.5, 16, 13],
        "text-max-width": 7,
        "symbol-sort-key": ["match", ["get", "layout"], "complex", 0, "plaza", 1, 2],
      },
      paint: { "text-color": m.building.landmark.label, ...halo, "text-opacity": ["interpolate", ["linear"], ["zoom"], 13.4, 0, 13.9, 1] },
    },
    {
      id: "facility-label",
      type: "symbol",
      source: "landmarks",
      minzoom: 10,
      filter: ["all", ["has", "label_of"], isFacility],
      layout: {
        visibility: visible(layers.buildings),
        "text-field": name(lang),
        "text-font": FONT.medium,
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10.5, 14, 13],
        "text-max-width": 8,
      },
      paint: { "text-color": m.building.facility.label, ...halo, "text-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0, 10.5, 1] },
    },
    ...stationLayers(),
    {
      id: "place-label",
      type: "symbol",
      source: "places",
      minzoom: 9,
      filter: ["!=", ["get", "site"], true],
      layout: {
        "text-field": name(lang),
        "text-font": FONT.medium,
        "text-size": 11.5,
        "text-anchor": "top",
        "text-offset": [0, 1.9],
      },
      paint: { "text-color": m.label.text, ...halo },
    },
    cityLabel("city-label-major", ["all", isKind("locality"), ["<=", ["get", "rank"], 2]], 5),
    cityLabel("city-label-minor", ["all", isKind("locality"), [">", ["get", "rank"], 2]], 6.2),
    {
      id: "territory-label",
      type: "symbol",
      source: "labels",
      maxzoom: TERRITORY_LABEL_MAX,
      filter: isKind("dependency"),
      layout: {
        "text-field": name(lang),
        "text-font": FONT.medium,
        "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 6, 20],
        "text-letter-spacing": 0.3,
        "text-transform": "uppercase",
      },
      paint: { "text-color": m.label.territory, ...halo, "text-opacity": fadeOut(TERRITORY_LABEL_MAX) },
    },
  );

  const isMeasure = (k: string): ExpressionSpecification => ["==", ["get", "kind"], k];
  style.push(
    {
      id: "measure-casing",
      type: "line",
      source: "measure",
      filter: ["!=", ["get", "kind"], "vertex"],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": m.label.halo, "line-width": 5 },
    },
    {
      id: "measure-line",
      type: "line",
      source: "measure",
      filter: isMeasure("line"),
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": m.focus.line, "line-width": 2.5 },
    },
    {
      id: "measure-preview",
      type: "line",
      source: "measure",
      filter: isMeasure("preview"),
      paint: { "line-color": m.focus.line, "line-width": 2, "line-dasharray": [1.5, 1.5] },
    },
    {
      id: "measure-vertex",
      type: "circle",
      source: "measure",
      filter: isMeasure("vertex"),
      paint: { "circle-radius": 4.5, "circle-color": m.label.halo, "circle-stroke-color": m.focus.line, "circle-stroke-width": 2.2 },
    },
    {
      id: "measure-label",
      type: "symbol",
      source: "measure",
      filter: ["all", isMeasure("vertex"), ["!=", ["get", "label"], ""]],
      layout: {
        "text-field": ["get", "label"],
        "text-font": FONT.medium,
        "text-size": 11.5,
        "text-anchor": "left",
        "text-offset": [0.8, 0],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": m.label.text, ...halo, "text-halo-width": 2 },
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
