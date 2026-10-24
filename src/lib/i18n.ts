import type { Entity, Lang, NameLang } from "./types";

const STRINGS = {
  searchPlaceholder: { zh: "搜索地点、道路、山川", en: "Search places, roads, landforms" },
  noResults: { zh: "没有找到匹配的结果", en: "No matching results" },
  explore: { zh: "探索城市", en: "Explore cities" },
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
  coordinates: { zh: "经纬度与缩放级别", en: "Coordinates & zoom" },
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
};

const NETWORK_LABELS: Record<string, Record<Lang, string>> = {
  national_expressway: { zh: "国家高速", en: "National expressway" },
  national_highway: { zh: "国道", en: "National highway" },
  territorial_expressway: { zh: "领地高速", en: "Territorial expressway" },
  territorial_highway: { zh: "领地道", en: "Territorial highway" },
  municipal_road: { zh: "市道", en: "Municipal road" },
  township_road: { zh: "乡道", en: "Township road" },
};

export function kindLabel(e: Entity, lang: Lang): string {
  if (e.kind === "route") return NETWORK_LABELS[e.network ?? ""]?.[lang] ?? e.class ?? "";
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
