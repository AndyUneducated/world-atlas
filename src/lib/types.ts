import type { FeatureCollection } from "geojson";

export type Lang = "zh" | "en";
export type ThemeId = "light" | "dark";
export type Appearance = "auto" | ThemeId;
export type BBox = [number, number, number, number];
export type LngLat = [number, number];

export const NAME_LANGS = ["zh", "en", "art-x-viking", "art-x-buckham"] as const;
export type NameLang = (typeof NAME_LANGS)[number];
export type Names = Partial<Record<NameLang, string>> & { zh: string; en: string };
export type Localized = { zh: string; en: string };

export type EntityKind = "division" | "natural" | "route" | "place";
export type EntityStatus = "canon" | "draft" | "generated";

export interface EntityStats {
  area_km2_mapped?: number;
  elev_max_m?: number;
  elev_mean_m?: number;
  density_per_km2?: number;
  length_km?: number;
  width_km?: number;
  drainage_km2?: number;
  elevation_m?: number;
  prominence_m?: number;
  /** Length of the sea bridge joining an offshore port to the shore. */
  bridge_km?: number;
}

export interface Entity {
  id: string;
  kind: EntityKind;
  subtype: string;
  status: EntityStatus;
  names: Names;
  short_names?: Localized;
  codes?: {
    admin?: string;
    iso3166_2?: string;
    unlocode?: string;
    iso3166_1?: { alpha2: string; alpha3: string; numeric: string };
  };
  population?: number;
  area_km2?: number;
  notes?: Localized;
  motto?: Localized;
  parent?: string;
  ancestors?: string[];
  children?: string[];
  capital?: string | null;
  special_status?: string;
  bbox?: BBox;
  center?: LngLat;
  stats?: EntityStats;
  ref?: string;
  network?: string;
  class?: string;
  via?: string[];
  ring?: boolean;
  ends_at_network?: boolean;
  segments?: RouteSegment[];
  /** #RRGGBB; set on cities, used for map tint and emblem. */
  color?: string;
  emblem?: { motif: string; pattern: string };
  /** Places: the division the place stands in, and whose emblem marks it on the map. */
  in?: string;
  marker?: string;
  emblem_of?: string;
  /** Stations: the railway and metro lines that stop there. */
  lines?: string[];
  source?: string;
  /** Territorial routes: the symbol on the route shield (see glyphs.ts). */
  shield?: string;
  /** The route runs in a straight line end to end. */
  straight?: boolean;
  engineering?: Engineering;
  /** Limits along the route, km/h, highest first; null means no limit. */
  speed?: { limits: (number | null)[] };
  tech?: RailTech;
}

/** Structure profile and cost estimate of the stretches built under a route (2026 USD). */
export interface Engineering {
  length_km: number;
  bridge_km: number;
  tunnel_km: number;
  river_bridges: number;
  stations?: number;
  construction_usd: number;
  upkeep_usd_per_year: number;
}

export interface RailTech {
  operating_speed_kmh?: number;
  design_speed_kmh?: number;
  gauge_mm?: number;
  electrification?: string;
  signalling?: string;
  formation?: { cars: number; coupled?: number; type?: string };
  power?: { voltage: string; supply: "overhead" | "third_rail" };
}

/** One stretch of a route inside a single district, in travel order. */
export interface RouteSegment {
  division: string | null;
  from_km: number;
  km: number;
  bbox: BBox;
  line: LngLat[];
  /** km/h; null means no limit. */
  speed_kmh?: number | null;
}

export interface Region {
  id: string;
  bounds: BBox;
  frame_bounds: BBox;
  center: LngLat;
}

export interface Manifest {
  generated_at: string;
  planet: { id: string; names: { en: string; zh?: string } };
  home: string;
  regions: Region[];
  dem: { tiles: string; encoding: "terrarium"; tileSize: number; minzoom: number; maxzoom: number; bounds: BBox };
  /** Vector tile archive (PMTiles) holding some layers; absent when the build had no tippecanoe. */
  tiles?: { url: string; layers: LayerFile[]; maxzoom: number };
}

export const LAYER_FILES = [
  "divisions",
  "labels",
  "places",
  "landcover",
  "water",
  "coast",
  "glaciers",
  "rivers",
  "rivers-named",
  "ridges",
  "roads",
  "streets",
  "streets-named",
  "buildings",
  "parks",
  "landmarks",
  "rail",
  "stations",
  "bathymetry",
  "context",
] as const;
export type LayerFile = (typeof LAYER_FILES)[number];

/** Edge: [from node, to node, length km, minutes, road index, geometry]. */
export type GraphEdge = [number, number, number, number, number, LngLat[]];

export interface RoadGraph {
  nodes: LngLat[];
  edges: GraphEdge[];
  /** Road entity ids, indexed by GraphEdge[4]. */
  roads: string[];
  /** Division id -> node index. */
  places: Record<string, number>;
}

export interface AtlasData {
  manifest: Manifest;
  entities: Record<string, Entity>;
  layers: Record<LayerFile, FeatureCollection>;
  /** Map colour per division: each city's own, inherited by its districts. */
  colors: Record<string, string>;
  graph: RoadGraph;
}
