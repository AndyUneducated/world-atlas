import type { Entity, Lang, NameLang } from "./types";

const STRINGS = {
  searchPlaceholder: { zh: "搜索地点、道路、车站、山川", en: "Search places, roads, stations, landforms" },
  noResults: { zh: "没有找到匹配的结果", en: "No matching results" },
  explore: { zh: "探索", en: "Explore" },
  exploreCities: { zh: "城市", en: "Cities" },
  exploreNational: { zh: "国道", en: "National highways" },
  exploreTerritorial: { zh: "省道", en: "Territorial highways" },
  locatedIn: { zh: "所属", en: "Part of" },
  menu: { zh: "图层、工具与设置", en: "Layers, tools & settings" },
  tools: { zh: "工具", en: "Tools" },
  population: { zh: "人口", en: "Population" },
  area: { zh: "面积", en: "Area" },
  density: { zh: "人口密度", en: "Density" },
  maxElevation: { zh: "最高海拔", en: "Highest point" },
  length: { zh: "长度", en: "Length" },
  width: { zh: "最窄处", en: "Narrowest" },
  drainage: { zh: "流域面积", en: "Drainage basin" },
  names: { zh: "名称", en: "Names" },
  codes: { zh: "编码", en: "Codes" },
  about: { zh: "概况", en: "Overview" },
  motto: { zh: "格言", en: "Motto" },
  subdivisions: { zh: "下辖", en: "Subdivisions" },
  passesThrough: { zh: "途经", en: "Passes through" },
  route_segments: { zh: "途经路段", en: "Route sections" },
  route_cities: { zh: "市", en: "cities" },
  route_districts: { zh: "区", en: "districts" },
  route_loop: { zh: "环线", en: "Loop" },
  route_spur: { zh: "支线", en: "Spur" },
  route_water: { zh: "跨水段", en: "Water crossing" },
  capitalOf: { zh: "领地首府", en: "Territorial capital" },
  expand: { zh: "展开", en: "Expand" },
  collapse: { zh: "收起", en: "Collapse" },
  share: { zh: "复制链接", en: "Copy link" },
  copied: { zh: "已复制", en: "Copied" },
  zoomTo: { zh: "定位", en: "Zoom to" },
  close: { zh: "关闭", en: "Close" },
  adminCode: { zh: "行政区划代码", en: "Division code" },
  layers: { zh: "图层", en: "Layers" },
  choropleth: { zh: "人口密度", en: "Population density" },
  terrain: { zh: "地形", en: "Terrain" },
  boundaries: { zh: "行政区界", en: "Boundaries" },
  roads: { zh: "道路", en: "Roads" },
  mapDetails: { zh: "地图细节", en: "Map details" },
  nationalExpressway: { zh: "国家高速", en: "National expressways" },
  territorialExpressway: { zh: "领地高速", en: "Territorial expressways" },
  cityRoads: { zh: "城市道路", en: "City roads" },
  transit: { zh: "轨道交通", en: "Rail transit" },
  railways: { zh: "城际铁路", en: "Intercity rail" },
  metro: { zh: "地铁", en: "Metro" },
  railStation: { zh: "铁路车站", en: "Railway station" },
  metroStation: { zh: "地铁站", en: "Metro station" },
  transferStation: { zh: "换乘站", en: "Interchange" },
  stations: { zh: "车站", en: "Stations" },
  servedBy: { zh: "停靠线路", en: "Lines" },
  facilities: { zh: "交通设施", en: "Transport facilities" },
  fc_runway: { zh: "跑道", en: "Runway" },
  fc_paved: { zh: "停机坪、码头", en: "Apron, quay" },
  fc_pad: { zh: "发射台", en: "Launch pad" },
  buildings: { zh: "建筑与地标", en: "Buildings & landmarks" },
  bc_residential: { zh: "住宅", en: "Residential" },
  bc_commercial: { zh: "商业", en: "Commercial" },
  bc_industrial: { zh: "工业", en: "Industrial" },
  bc_civic: { zh: "公共建筑", en: "Public" },
  bc_landmark: { zh: "地标", en: "Landmark" },
  bc_park: { zh: "公园绿地", en: "Park" },
  appearance: { zh: "外观", en: "Appearance" },
  appearanceAuto: { zh: "跟随系统", en: "Match system" },
  appearanceLight: { zh: "浅色", en: "Light" },
  appearanceDark: { zh: "深色", en: "Dark" },
  settings: { zh: "设置", en: "Settings" },
  measure: { zh: "测量距离", en: "Measure distance" },
  measureStart: { zh: "点击地图放置起点", en: "Click the map to place a start point" },
  measureNext: { zh: "继续点击添加测量点", en: "Keep clicking to add points" },
  totalDistance: { zh: "总距离", en: "Total distance" },
  undo: { zh: "撤销", en: "Undo" },
  clear: { zh: "清除", en: "Clear" },
  done: { zh: "完成", en: "Done" },
  language: { zh: "语言", en: "Language" },
  onScreen: { zh: "地图显示", en: "On the map" },
  legend: { zh: "图例", en: "Legend" },
  scaleBar: { zh: "比例尺", en: "Scale bar" },
  coordinates: { zh: "经纬度", en: "Coordinates" },
  zoomLevel: { zh: "缩放级别", en: "Zoom level" },
  zoomButtons: { zh: "缩放按钮", en: "Zoom buttons" },
  places: { zh: "城市与边界", en: "Places & boundaries" },
  boundaryCity: { zh: "市界", en: "City boundary" },
  boundaryDistrict: { zh: "区界", en: "District boundary" },
  capital: { zh: "首府", en: "Capital" },
  city: { zh: "城市", en: "City" },
  elevation: { zh: "海拔", en: "Elevation" },
  prominence: { zh: "相对高度", en: "Prominence" },
  landcover: { zh: "地表覆盖", en: "Land cover" },
  lc_forest: { zh: "针叶林", en: "Conifer forest" },
  lc_tundra: { zh: "苔原", en: "Tundra" },
  lc_rock: { zh: "裸岩", en: "Bare rock" },
  lc_farmland: { zh: "农田", en: "Farmland" },
  lc_wetland: { zh: "湿地", en: "Wetland" },
  lc_urban: { zh: "城镇", en: "Built-up area" },
  lc_glacier: { zh: "冰川", en: "Glacier" },
  relief: { zh: "山地", en: "Mountains" },
  peak: { zh: "山峰", en: "Peak" },
  pass: { zh: "山口", en: "Pass" },
  license: { zh: "代码 MIT · 内容 CC BY-NC-SA 4.0", en: "Code MIT · Content CC BY-NC-SA 4.0" },
  zoomIn: { zh: "放大", en: "Zoom in" },
  zoomOut: { zh: "缩小", en: "Zoom out" },
  resetNorth: { zh: "指北", en: "Reset north" },
  home: { zh: "全岛视图", en: "Whole island" },
  perKm2: { zh: "人/km²", en: "/km²" },
  loading: { zh: "正在载入地图", en: "Loading map" },
  routeFrom: { zh: "从这里出发", en: "Directions from" },
  routeTo: { zh: "到这里去", en: "Directions to" },
  directions: { zh: "路线", en: "Directions" },
  origin: { zh: "起点", en: "Start" },
  destination: { zh: "终点", en: "Destination" },
  pickOnCard: { zh: "在地图上选择一个市或区，点击卡片上的按钮", en: "Pick a city or district and use the button on its card" },
  noRoute: { zh: "两地之间没有道路连通", en: "No road connects these places" },
  swap: { zh: "交换起终点", en: "Swap" },
  fastest: { zh: "最快路线", en: "Fastest route" },
  hour: { zh: "小时", en: "h" },
  minute: { zh: "分钟", en: "min" },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;
export const t = (key: StringKey, lang: Lang) => STRINGS[key][lang];

export const NAME_LANG_LABELS: Record<NameLang, Record<Lang, string>> = {
  zh: { zh: "中文", en: "Chinese" },
  en: { zh: "英语", en: "English" },
  "art-x-viking": { zh: "维京语", en: "Viking" },
  "art-x-buckham": { zh: "巴克汉姆语", en: "Buckham" },
};

const SUBTYPE_LABELS: Record<string, Record<Lang, string>> = {
  country: { zh: "国家", en: "Country" },
  dependency: { zh: "领地", en: "Territory" },
  region: { zh: "省", en: "Province" },
  locality: { zh: "市", en: "City" },
  borough: { zh: "区", en: "District" },
  mountain_range: { zh: "山脉", en: "Mountain range" },
  ridge: { zh: "山岭", en: "Ridge" },
  river: { zh: "河流", en: "River" },
  lake: { zh: "湖泊", en: "Lake" },
  bay: { zh: "海湾", en: "Bay" },
  fjord: { zh: "峡湾", en: "Fjord" },
  cape: { zh: "岬角", en: "Cape" },
  strait: { zh: "海峡", en: "Strait" },
  island: { zh: "岛屿", en: "Island" },
  estuary: { zh: "河口", en: "River mouth" },
  peak: { zh: "山峰", en: "Peak" },
  pass: { zh: "山口", en: "Mountain pass" },
  glacier: { zh: "冰川", en: "Glacier" },
  government: { zh: "政府机关", en: "Government" },
  plaza: { zh: "广场", en: "Square" },
  museum: { zh: "博物馆", en: "Museum" },
  theatre: { zh: "剧院", en: "Theatre" },
  library: { zh: "图书馆", en: "Library" },
  townhall: { zh: "市政厅", en: "City hall" },
  tower: { zh: "塔", en: "Tower" },
  university: { zh: "大学", en: "University" },
  college: { zh: "学院", en: "College" },
  research_institute: { zh: "科研机构", en: "Research institute" },
  observatory: { zh: "天文台", en: "Observatory" },
  office: { zh: "办公楼", en: "Office building" },
  castle: { zh: "城堡遗址", en: "Fort" },
  hospital: { zh: "医院", en: "Hospital" },
  stadium: { zh: "体育场馆", en: "Stadium" },
  marketplace: { zh: "市场", en: "Market" },
  park: { zh: "公园", en: "Park" },
  station: { zh: "车站", en: "Station" },
  airport: { zh: "机场", en: "Airport" },
  port: { zh: "港口", en: "Port" },
  ferry_terminal: { zh: "客运码头", en: "Ferry terminal" },
  spaceport: { zh: "航天发射场", en: "Spaceport" },
};

const NETWORK_LABELS: Record<string, Record<Lang, string>> = {
  national_expressway: { zh: "国家高速", en: "National expressway" },
  national_highway: { zh: "国道", en: "National highway" },
  territorial_expressway: { zh: "领地高速", en: "Territorial expressway" },
  territorial_highway: { zh: "领地道", en: "Territorial highway" },
  municipal_road: { zh: "市道", en: "Municipal road" },
  township_road: { zh: "乡道", en: "Township road" },
  arterial_street: { zh: "城市主干道", en: "Arterial street" },
  collector_street: { zh: "城市次干道", en: "Collector street" },
  intercity_rail: { zh: "城际铁路", en: "Intercity railway" },
  metro: { zh: "地铁线路", en: "Metro line" },
};

export function kindLabel(e: Entity, lang: Lang): string {
  if (e.kind === "route") return NETWORK_LABELS[e.network ?? ""]?.[lang] ?? e.class ?? "";
  if (e.subtype === "station" && e.source === "generated:metro") return STRINGS.metroStation[lang];
  if (e.subtype === "station") return STRINGS.railStation[lang];
  if (e.special_status === "free_trade_zone") return lang === "zh" ? "自由贸易区" : "Free trade zone";
  return SUBTYPE_LABELS[e.subtype]?.[lang] ?? e.subtype;
}

export function displayName(e: Entity, lang: Lang): string {
  return e.names[lang] ?? e.names.zh;
}

export function otherName(e: Entity, lang: Lang): string {
  return lang === "zh" ? e.names.en : e.names.zh;
}

export function formatNumber(n: number, lang: Lang, digits = 0): string {
  return n.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: digits });
}

export function formatPopulation(n: number, lang: Lang): string {
  if (lang === "zh") return n >= 10000 ? `${formatNumber(n / 10000, lang, 1)} 万` : formatNumber(n, lang);
  if (n >= 1_000_000) return `${formatNumber(n / 1_000_000, lang, 2)} M`;
  if (n >= 1000) return `${formatNumber(n / 1000, lang, 1)} k`;
  return formatNumber(n, lang);
}
