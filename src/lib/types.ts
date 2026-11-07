import type { FeatureCollection } from "geojson";

export type Lang = "zh" | "en";
export type ThemeId = "light" | "dark";
export type Appearance = "auto" | ThemeId;
export type BBox = [number, number, number, number];
export type LngLat = [number, number];

export const NAME_LANGS = ["zh", "en", "art-x-viking", "art-x-buckham", "art-x-tavrunaq", "art-x-ivuran", "es", "art-x-ranova", "art-x-kasiri"] as const;
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

export type EntityKind = "division" | "natural" | "route" | "place" | "party" | "bloc";
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
  /** A city's id; for China and the United States, whose cities are not on the map, the capital's names. */
  capital?: string | Localized | null;
  /** Fields that do not apply to the entity (a government in exile's population, economy, elections), and why. */
  na?: { fields: string[]; note: Localized };
  /** States: what they claim but do not control (the government in exile's capital and land). */
  uncontrolled?: ("capital" | "area")[];
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
  shield_style?: "crest" | "maritime" | "polar" | "tropic" | "spade";
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
  /** Territories: the parliament, the government it formed and the territory's officeholders. */
  legislature?: Legislature;
  /** Cities: the council, its speaker and the mayor; in a nation without elections, the body it appoints. */
  council?: Council | AppointedCouncil;
  /** Districts: how the district voted in the territorial election. */
  election?: { turnout: number; vote: { id: string; vote: number }[] };
  /** Parties (world/politics.yaml). */
  spectrum?: number;
  /** The party family, as comparative politics groups parties. */
  family?: Localized;
  ideology?: Localized[];
  /** Expert-survey scales, 0 to 10: economic left–right, GAL–TAN, territorial self-rule–central rule, ecology–growth. */
  axes?: Record<PartyAxis, number>;
  leader?: Localized;
  leader_title?: Localized;
  secretary?: Localized;
  /** Who leads the party in each territory it stands in. */
  branches?: { at: string; name: Localized }[];
  members?: number;
  youth_wing?: Localized;
  slogan?: Localized;
  policies?: Localized[];
  allies?: string[];
  factions?: { names: Localized; notes: Localized }[];
  organisation?: Partial<Record<"newspaper" | "think_tank" | "unions" | "women", Localized>>;
  /** Where its vote is strongest and weakest, from the model's leanings. */
  base?: { strong: Localized[]; weak: Localized[] };
  history?: Localized;
  /** Parties of a nation's fixed chamber: that nation; they stand in no election. */
  seated?: string;
  /** Parties of a fixed-chamber state that hold no seat there: the state. */
  based?: string;
  /** Where the party is strongest (or sits), its standing there and its headquarters city. */
  home?: string;
  standing?: "lead" | "coalition" | "allied" | "majority" | "opposition" | "extra" | "illegal";
  hq?: string;
  legal_status?: Localized;
  reunification?: Localized;
  /** States that back the party from outside. */
  backers?: string[];
  /** Its vote at home over the last elections, oldest first, percent. */
  trend?: number[];
  /** Seats held in each territorial parliament and city council. */
  seats?: { at: string; seats: number; of: number; upper?: boolean }[];
  /** Nations: the card's facts. */
  nation?: NationFacts;
  /** Nations without an elected parliament: their executive and judiciary, named by the politics model. */
  government?: NationGovernment;
  /** Territories and cities: their emblems (a territory's anthem, flower, tree, animal or bird; a city's flower and tree). */
  symbols?: Partial<Record<"anthem" | "flower" | "tree" | "animal" | "bird", Localized>>;
  /** Territories: the calling code, time zone and side of the road. */
  facts?: { calling_code?: string; time_zone?: string; driving?: "left" | "right" };
  /** Territories: % of residents by faith. */
  religion?: Faith[];
  /** A nation's key offices outside the cabinet (armed forces, central bank, prosecutors), each with its holder. */
  offices?: (Officeholder & { names: Localized })[];
  /** Blocs: their member nations; countries: the nations they back. */
  member_nations?: string[];
  /** Blocs: the leading nation. */
  leader_nation?: string;
  doctrine?: Localized;
}

export type WarStatus = "active" | "ceasefire" | "frozen" | "ended";

/** A branch of government a state does without, and what stands in its place. */
export type NoBranch = { none: Localized };

export type FixedChamber = { names: Localized; seats: number; groups: { names: Localized; seats: number; color: string; party?: string }[]; notes?: Localized };

export interface NationGovernment {
  executive: NoBranch | { names: Localized; notes?: Localized; head?: Officeholder; deputy?: Officeholder; ministers: { ministry: Localized; name: Localized }[] };
  /** The presiding judge, the bench's other judges and the law it applies. */
  judiciary: NoBranch | (Officeholder & { names: Localized; law: Localized; notes?: Localized; judges: Localized[] });
}

export type Faith = { names: Localized; share: number; color?: string };

/** A nation's card block (nation: in world/divisions). */
export interface NationFacts {
  ideology: Localized[];
  government: Localized;
  head: Officeholder;
  /** The heir to a hereditary head of state, or the open question of the succession. */
  heir?: Officeholder;
  /** Earlier holders of the head's office, oldest first. */
  predecessors?: (Officeholder & { note?: Localized })[];
  /** Who really holds power. */
  power: Localized;
  bloc?: string | null;
  bloc_role?: Localized;
  /** How many of the region's other states recognise it (for a country, of every region's states). */
  recognition: number;
  /** A legislature with fixed seats, where there is no election to model. */
  legislature?: FixedChamber | NoBranch;
  military: { active: number; reserve: number; strength: 1 | 2 | 3 | 4 | 5; branches: Localized[]; equipment: Localized; budget_gdp?: number };
  wars?: { names: Localized; role: Localized; status: WarStatus }[];
  allies?: string[];
  rivals?: string[];
  /** Outside powers behind it, openly or not. */
  backers?: string[];
  religion: Faith[];
  /** 0 (none) to 100 (full). */
  freedom?: { political: number; civil: number; press: number; economic: number };
  refugees: { hosted: number; abroad: number };
  symbols: { anthem: Localized; flower: Localized; animal: Localized };
  culture?: { holiday?: Localized; dish?: Localized; sport?: Localized };
  /** Travel advice: 1 normal precautions, 2 increased caution, 3 reconsider travel, 4 do not travel. */
  travel?: { level: 1 | 2 | 3 | 4; note: Localized };
  facts: { currency: Localized; currency_code: string; time_zone: string; calling_code: string; tld: string; driving: "left" | "right" };
}

export type ElectoralSystem = "mmp" | "fptp" | "pr_reserved" | "pr_regional" | "top_two";

/** The seats of a chamber by party, and the government (largest party first); under an elected
 * executive, the chamber's majority. */
export interface Seating {
  seats: number;
  parties: { id: string; seats: number; vote: number }[];
  government: string[];
  /** mmp: seats won in constituencies, by party. */
  constituency?: Record<string, number>;
  overhang?: number;
  /** pr_reserved: seats elected by the reserved-language roll, and who won them. */
  reserved?: number;
  reserved_won?: Record<string, number>;
  /** top_two: general elections between two candidates of one party. */
  same_party?: number;
  names: Localized;
  speaker: Officeholder & { party: string };
}

/** A parliament or council from the politics model. */
export interface Chamber extends Seating {
  turnout: number;
  /** The head of the executive: a territory's premier or governor, or a city's mayor; when elected by
   * the voters, their share of the general election and who came second. */
  head: Officeholder & { party: string; vote?: number; runner_up?: { name?: Localized; party: string; vote: number } };
  /** The head is elected by the voters, not by the chamber. */
  elected?: boolean;
}

export interface Officeholder {
  title: Localized;
  name: Localized;
}

export type PartyAxis = "econ" | "galtan" | "autonomy" | "green";

export interface Legislature extends Chamber {
  system: ElectoralSystem;
  threshold?: number;
  /** Appointed by the central government; no party. Absent where the governor is elected (the head). A
   * nation's head of state stands here, with a note on how they came to office. */
  governor?: Officeholder & { note?: Localized };
  /** How the chamber is elected, where the system's usual sentence does not fit. */
  system_notes?: Localized;
  opposition?: { name: Localized; party: string; title?: Localized };
  /** Ministries held by each party in government. */
  cabinet: { id: string; seats: number }[];
  /** Every ministry in order, with its minister; a minister without a party is a non-partisan expert. */
  ministers: { id?: string; ministry: Localized; name: Localized; party?: string }[];
  /** How the state's politics work, beyond the electoral system. */
  notes?: Localized;
  /** The second chamber, elected the same way. */
  upper?: Seating;
  /** The chief justice, the court's other judges and the law it applies. */
  court: Officeholder & { names: Localized; judges: Localized[]; law?: Localized };
  /** The head's deputy, of a governing party. */
  deputy?: Officeholder & { party: string };
  /** Bodies outside the ministries (audit, anti-corruption, the central bank), each with its head. */
  agencies?: (Officeholder & { names: Localized })[];
  /** The speaker's deputies: one from the government side, and in larger chambers one from the opposition. */
  deputy_speakers?: (Officeholder & { party: string })[];
}

export interface Council extends Chamber {
  /** What the body is and how it works, where it is not an ordinary council. */
  notes?: Localized;
  /** The deputy mayor, of the mayor's party. */
  deputy?: Officeholder & { party: string };
}

/** A city whose nation holds no elections: the body the nation appoints to run it, and its head. */
export interface AppointedCouncil {
  appointed: true;
  names: Localized;
  notes?: Localized;
  head: Officeholder;
}

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
  /** Median income per earner, in territories that model it. */
  median_income_usd?: number;
  /** % of GDP, summing to 100. */
  sectors: { primary: number; secondary: number; tertiary: number };
  /** Leading industries, most important first. */
  industries: Localized[];
  /** A nation's own figures: the Gini index, and unemployment and inflation in %. */
  gini?: number;
  unemployment?: number;
  inflation?: number;
}

export interface Demographics {
  /** % under 15, 15–64, 65 and over. */
  age: [number, number, number];
  /** % of residents by first language. */
  languages: Partial<Record<NameLang, number>>;
  /** % of residents by ethnic origin, in territories that record it. */
  ethnicity?: Partial<Record<EthnicGroup, number>>;
  /** Years at birth, adult literacy (%) and the human development index (0–1), from the model. */
  life_expectancy?: number;
  literacy?: number;
  hdi?: number;
}

export const ETHNIC_GROUPS = ["european", "latino", "african", "asian", "other"] as const;
export type EthnicGroup = (typeof ETHNIC_GROUPS)[number];

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
  /** A fixed timetable instead of a headway: trains a day, both directions. */
  trains_per_day?: number;
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
  /** Lines in a vacuum tube: the tube; then how the train floats and what drives it, instead of gauge and power supply. */
  tube?: Record<Lang, string>;
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
  dem: { url: string; encoding: "terrarium"; tileSize: number; minzoom: number; maxzoom: number; bounds: BBox };
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
