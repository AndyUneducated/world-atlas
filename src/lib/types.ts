import type { FeatureCollection } from "geojson";

export type Lang = "zh" | "en";
export type ThemeId = "light" | "dark";
export type Appearance = "auto" | ThemeId;
export type BBox = [number, number, number, number];
export type LngLat = [number, number];

export const NAME_LANGS = ["zh", "en", "art-x-viking", "art-x-buckham", "art-x-tavrunaq", "art-x-ivuran"] as const;
export type NameLang = (typeof NAME_LANGS)[number];
export type Names = Partial<Record<NameLang, string>> & { zh: string; en: string };
export type Localized = { zh: string; en: string };

/** A city flag: a layout from lib/cityFlags.tsx, its tinctures in the layout's order and an optional charge. */
export interface CityFlagSpec {
  layout: string;
  colors: string[];
  charge?: string;
  charge_color?: string;
  /** A tincture round the charge's silhouette, where it would otherwise lose itself in the field. */
  outline?: string;
  /** banner: how the field is parted; hoist: wedge for a narrow wedge instead of the full triangle. */
  division?: "pile" | "wavy" | "bordure" | "wedge";
  /** bands: stripes run up and down; their relative widths; the stripe the charge sits in. */
  vertical?: boolean;
  ratio?: number[];
  charge_band?: number;
  /** horizon: the skyline, a river in the foreground, and where the charge stands; diagonal: curve for a curved shore. */
  edge?: "straight" | "waves" | "peaks" | "fjord" | "ridge" | "curve";
  river?: boolean;
  charge_in?: "sky" | "horizon" | "ground";
  /** seal: the language of the legend, besides English. */
  legend?: NameLang;
  /** Further charges, placed on the 60×40 box. */
  extra?: { charge: string; color: string; x: number; y: number; size: number }[];
}

export type EntityKind = "division" | "natural" | "route" | "place" | "party";
export type StructureKind = "bridge" | "tunnel" | "snow_shed";
export type EntityStatus = "canon" | "draft" | "generated";

export interface EntityStats {
  area_km2_mapped?: number;
  elev_max_m?: number;
  elev_mean_m?: number;
  density_per_km2?: number;
  length_km?: number;
  width_km?: number;
  drainage_km2?: number;
  /** Archipelagos: number of named islands in the group. */
  islands?: number;
  elevation_m?: number;
  prominence_m?: number;
  /** Length of the sea bridge joining an offshore port to the shore. */
  bridge_km?: number;
  /** Routes between territories: length of the undersea tunnel. */
  undersea_tunnel_km?: number;
  /** Districts: length of the skyway network. */
  skyways_km?: number;
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
  /** An intercity railway built as a maglev line. */
  maglev?: boolean;
  class?: string;
  via?: string[];
  ring?: boolean;
  ends_at_network?: boolean;
  segments?: RouteSegment[];
  /** #RRGGBB; set on cities, used for map tint and card accents. */
  color?: string;
  /** Territories: a design in lib/flags.tsx; cities: a layout from lib/cityFlags.tsx and its tinctures. */
  flag?: string | CityFlagSpec;
  /** What the flag's colours and charges stand for. */
  flag_notes?: { zh: string; en: string };
  /** Places: the division the place stands in, and whose flag heads its card. */
  in?: string;
  emblem_of?: string;
  /** Stations: the railway and metro lines that stop there. */
  lines?: string[];
  source?: string;
  /** Territorial routes: the symbol on the route shield (see glyphs.ts). */
  shield?: string;
  /** Territorial routes: the shield design of their territory (route_shield in its division record); default crest. */
  shield_style?: "crest" | "maritime" | "polar" | "tropic";
  /** The route runs in a straight line end to end. */
  straight?: boolean;
  /** Routes between territories: the two territories they join (their ancestors stop at the country). */
  territories?: string[];
  engineering?: Engineering;
  /** Expressways, territorial highways and railways: why and how the line was built. */
  background?: Record<Lang, string>;
  /** The longest bridge, tunnel and snow shed built under the line. */
  structures?: Partial<Record<StructureKind, { names: Record<Lang, string>; km: number }>>;
  /** One of its territory's wonders, and why; on a line the wonder is one of its structures. */
  wonder?: Localized & { structure?: StructureKind };
  /** Limits along the route, km/h, highest first; null means no limit. */
  speed?: { limits: (number | null)[] };
  tech?: RailTech;
  road?: RoadFacts;
  service?: RailService;
  military?: MilitaryFacts;
  economy?: Economy;
  demographics?: Demographics;
  climate?: Climate;
  /** Territories: an overview of the climate across their land. */
  climate_notes?: { zh: string; en: string };
  /** Territories: the parliament and the government it formed. */
  legislature?: Legislature;
  /** Cities: the council and the mayor, or the body that decides in their place. */
  council?: Council;
  /** Districts: how the district voted in the territorial election. */
  election?: { turnout: number; vote: { id: string; vote: number }[] };
  /** Parties (world/politics.yaml). */
  spectrum?: number;
  family?: Localized;
  leader?: Localized;
  leader_title?: Localized;
  members?: number;
  youth_wing?: Localized;
  slogan?: Localized;
  policies?: Localized[];
  allies?: string[];
  history?: Localized;
  /** Seats held in each territorial parliament and city council. */
  seats?: { at: string; seats: number; of: number }[];
}

export type ElectoralSystem = "mmp" | "fptp" | "pr_reserved" | "pr_regional";

/** A parliament or council from the politics model: seats by party, the government (largest party first). */
export interface Chamber {
  seats: number;
  parties: { id: string; seats: number; vote: number }[];
  government: string[];
  /** mmp: seats won in constituencies, by party. */
  constituency?: Record<string, number>;
  overhang?: number;
  /** pr_reserved: seats elected by the reserved-language roll, and who won them. */
  reserved?: number;
  reserved_won?: Record<string, number>;
  turnout: number;
  head: { title: Localized; name: Localized; party: string };
}

export interface Legislature extends Chamber {
  names: Localized;
  system: ElectoralSystem;
  threshold?: number;
}

export type Council = Chamber | { assembly: Localized };

/** Districts and cities, from the climate model (world/climate.yaml): monthly normals, January first. */
export interface Climate {
  /** Climate type code, e.g. "Cfb" (see lib/climate.ts). */
  type: string;
  months: {
    /** Mean daily high and low, °C. */
    hi: number[];
    lo: number[];
    /** mm */
    precip: number[];
    /** Hours of bright sunshine. */
    sun: number[];
    /** Mean length of the day, hours. */
    daylight: number[];
  };
  mean_c: number;
  precip_mm: number;
  sun_h: number;
  record: { hi: number; lo: number };
  polar_night_days: number;
  midnight_sun_days: number;
  elevation_m: number;
  coast_km: number;
  /** Cities: the district whose climate this is (the most populous one). */
  at?: string;
}

/** Cities, districts and territories, from the economy model (world/economy.yaml; 2026 USD). */
export interface Economy {
  gdp_usd: number;
  gdp_per_capita_usd: number;
  /** % of GDP, summing to 100. */
  sectors: { primary: number; secondary: number; tertiary: number };
  /** Leading industries, most important first. */
  industries: Localized[];
}

export interface Demographics {
  /** % under 15, 15–64, 65 and over. */
  age: [number, number, number];
  /** % of residents by first language. */
  languages: Partial<Record<NameLang, number>>;
}

/** Military and space facilities: the unit stationed there and what the public may see of it. */
export interface MilitaryFacts {
  unit: Record<Lang, string>;
  branch: Record<Lang, string>;
  equipment: Record<Lang, string>;
  personnel: number;
  access: Record<Lang, string>;
}

/** Structure profile and cost estimate of the stretches built under a route (2026 USD). */
export interface Engineering {
  length_km: number;
  bridge_km: number;
  tunnel_km: number;
  /** At-grade stretches roofed against drifting snow (territories whose generator sets snow_sheds). */
  snow_shed_km?: number;
  river_bridges: number;
  stations?: number;
  construction_usd: number;
  upkeep_usd_per_year: number;
  /** ‰, steepest stretch of the grade line. */
  max_grade_permille?: number;
}

/** Expressways and territorial highways: lanes and traffic from the traffic model, [least, most] along the route. */
export interface RoadFacts {
  /** Lanes in each direction. */
  lanes: [number, number];
  cross_section: { lane_m: number; shoulder_m: number; median_m: number };
  width_m: [number, number];
  /** Vehicles per day, both directions. */
  aadt: [number, number];
  /** End to end at the limits, cruise_kmh where there is none. */
  drive_min: number;
  cruise_kmh: number;
  operator?: Record<Lang, string> | null;
}

export interface RailService {
  fastest_min: number;
  /** Passenger lines. */
  peak_headway_min?: number;
  trains_per_peak_hour?: number;
  ridership_per_year?: number;
  /** Heavy-haul lines: loaded trains a day and net tonnes a year. */
  loaded_trains_per_day?: number;
  freight_t_per_year?: number;
  operator?: Record<Lang, string> | null;
}

export interface RailTech {
  operating_speed_kmh?: number;
  design_speed_kmh?: number;
  gauge_mm?: number;
  electrification?: string;
  /** Maglev lines: how the train floats and what drives it, instead of gauge and power supply. */
  levitation?: Record<Lang, string>;
  propulsion?: Record<Lang, string>;
  signalling?: string;
  formation?: { cars: number; coupled?: number; type?: string };
  power?: { voltage: string; supply: "overhead" | "third_rail" };
  tracks?: number;
  min_curve_radius_m?: number;
  axle_load_t?: number;
  loaded_trains_per_day?: number;
  /** Passenger trains: seats per formation of `formation.cars` cars. Freight trains: wagons and net tonnes a train. */
  train?: { names: Record<Lang, string>; seats?: number; wagons?: number; net_t?: number };
}

/** One stretch of a route inside a single district, in travel order. */
export interface RouteSegment {
  division: string | null;
  from_km: number;
  km: number;
  bbox: BBox;
  /** The stretch as drawn on the map (cut from the road lines, which may run under other routes' ids). */
  lines: LngLat[][];
  /** km/h; null means no limit. */
  speed_kmh?: number | null;
  /** Expressways and territorial highways: lanes each way and vehicles per day. */
  lanes?: number;
  aadt?: number;
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
  "route-shared",
  "streets",
  "streets-named",
  "buildings",
  "parks",
  "skyways",
  "landmarks",
  "rail",
  "stations",
  "bathymetry",
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
