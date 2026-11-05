import clsx from "clsx";
import {
  Banknote,
  Building2,
  Car,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Droplets,
  Gauge,
  Landmark,
  LandPlot,
  Maximize2,
  Mountain,
  Ruler,
  Shell,
  Sparkles,
  Star,
  TrainFront,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { animate, AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Paragraphs, Rows, Section, Sub, useCardScroll } from "./CardParts";
import { Emblem, Flag, hasEmblem } from "./Emblem";
import { CouncilSection, ElectionSection, LegislatureSection, PartySections } from "./Politics";
import { BackedSection, CardGroups, isGroupedCard } from "./Nation";
import { RouteTimeline } from "./RouteTimeline";
import { Climograph } from "./Climograph";
import { climateName } from "../lib/climate";
import { useMobile } from "../lib/viewport";
import { accentColor, lineage, wonderName } from "../lib/entity";
import { cardName, displayName, formatNumber, formatPopulation, formatUsd, kindLabel, NAME_LANG_LABELS, t, type StringKey } from "../lib/i18n";
import { hasShield } from "../lib/shields";
import { RouteShield } from "./RouteShield";
import { formatDuration } from "./RoutePanel";
import { ETHNIC_GROUPS, NAME_LANGS, type AtlasData, type Entity, type Lang, type NameLang } from "../lib/types";

const NAME_TAGS: Record<NameLang, Record<Lang, string>> = {
  zh: { zh: "中", en: "ZH" },
  en: { zh: "英", en: "EN" },
  "art-x-viking": { zh: "维", en: "VIK" },
  "art-x-buckham": { zh: "巴", en: "BCK" },
  "art-x-tavrunaq": { zh: "塔", en: "TAV" },
  "art-x-ivuran": { zh: "伊", en: "IVR" },
  es: { zh: "西", en: "ES" },
  "art-x-ranova": { zh: "拉", en: "RNV" },
  "art-x-kasiri": { zh: "卡", en: "KSR" },
};
import { useAtlas } from "../store";
import { EntityIcon } from "./EntityIcon";

/** Emblem holder that leans towards the pointer and glows in the entity colour. */
function TiltBadge({ glow, children }: { glow: string; children: React.ReactNode }) {
  const rx = useSpring(0, { stiffness: 260, damping: 18 });
  const ry = useSpring(0, { stiffness: 260, damping: 18 });
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 26);
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 26);
  };
  return (
    <div className="relative shrink-0" onPointerMove={onMove} onPointerLeave={() => (rx.set(0), ry.set(0))}>
      <div className="absolute inset-1 rounded-full opacity-50 blur-xl" style={{ background: glow }} />
      <motion.div
        initial={{ scale: 0.6, rotate: -10, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.05 }}
        style={{ rotateX: rx, rotateY: ry, transformPerspective: 380 }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  );
}

type StatItem = { label: string; value: string; unit?: string; icon: LucideIcon };

function Stat({ label, value, unit, icon: Icon, accent }: StatItem & { accent: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border px-3 pt-2.5 pb-2"
      style={{ background: `color-mix(in srgb, ${accent} 7%, var(--ui-hover))`, borderColor: `color-mix(in srgb, ${accent} 16%, transparent)` }}
    >
      <span className="absolute inset-x-3 top-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <Icon className="size-3 shrink-0" style={{ color: accent }} />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-[18px] leading-tight font-semibold tracking-tight text-ink tabular-nums">{value}</div>
      {unit && <div className="truncate text-[10.5px] text-faint">{unit}</div>}
    </div>
  );
}

/** A range of large counts on one shared scale, "1.2–3.4" with the scale moved into the unit ("万辆/日"). */
function scaledSpan([lo, hi]: [number, number], lang: Lang, unit: string): { value: string; unit: string } {
  const [div, scale] =
    lang === "zh" ? (hi >= 1e8 ? [1e8, "亿"] : hi >= 1e4 ? [1e4, "万"] : [1, ""]) : hi >= 1e6 ? [1e6, "million "] : hi >= 1e3 ? [1e3, "thousand "] : [1, ""];
  const f = (v: number) => formatNumber(v / div, lang, div > 1 && v / div < 100 ? 1 : 0);
  return { value: lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`, unit: `${scale}${unit}` };
}

function lengthStat(e: Entity, lang: Lang): StatItem[] {
  return e.stats?.length_km ? [{ label: t("length", lang), value: formatNumber(e.stats.length_km, lang, 1), unit: "km", icon: Ruler }] : [];
}

function areaStat(e: Entity, lang: Lang): StatItem[] {
  const label = t("area", lang);
  if (e.area_km2) return [{ label, value: formatNumber(e.area_km2, lang), unit: "km²", icon: LandPlot }];
  const mapped = e.stats?.area_km2_mapped;
  if (!mapped) return [];
  if (mapped < 1) {
    const ha = mapped * 100;
    return [{ label, value: formatNumber(ha, lang, ha < 10 ? 1 : 0), unit: t("hectares", lang), icon: LandPlot }];
  }
  return [{ label, value: formatNumber(mapped, lang, 1), unit: "km²", icon: LandPlot }];
}

function gdpStat(usd: number, lang: Lang): StatItem {
  const [div, unit] =
    lang === "zh"
      ? usd >= 1e12 ? [1e12, "万亿美元"] : usd >= 1e8 ? [1e8, "亿美元"] : [1e4, "万美元"]
      : usd >= 1e12 ? [1e12, "trillion USD"] : usd >= 1e9 ? [1e9, "billion USD"] : [1e6, "million USD"];
  const v = usd / div;
  return { label: t("gdp", lang), value: formatNumber(v, lang, v >= 100 ? 0 : v >= 10 ? 1 : 2), unit, icon: Banknote };
}

/** The headline figures: roads by length, lanes and traffic; railways by length, speed and riders;
 * divisions by people, area and GDP; natural features and places by what they are measured in. */
function stats(e: Entity, lang: Lang, data: AtlasData): StatItem[] {
  if (e.kind === "party") {
    const held = e.seats ?? [];
    const sum = (sub: string) => {
      const rows = held.filter((s) => data.entities[s.at]?.subtype === sub);
      return [rows.reduce((a, s) => a + s.seats, 0), rows.length];
    };
    const nation = held.map((s) => data.entities[s.at]).find((at) => at?.role === "nation");
    if (nation?.legislature) {
      const row = nation.legislature.parties.find((p) => p.id === e.id);
      return [
        { label: t("members", lang), value: formatNumber(e.members ?? 0, lang), unit: t("membersUnit", lang), icon: Users },
        { label: t("statNational", lang), value: String(row?.seats ?? 0), unit: lang === "zh" ? `席 · 共 ${nation.legislature.seats} 席` : `of ${nation.legislature.seats} seats`, icon: Landmark },
        { label: t("statVote", lang), value: `${formatNumber(row?.vote ?? 0, lang, 1)}%`, unit: nation.short_names?.[lang] ?? displayName(nation, lang), icon: ChartNoAxesColumn },
      ];
    }
    const [terr, nTerr] = sum("dependency");
    const [city, nCity] = sum("locality");
    const across = (n: number, zh: string) => (lang === "zh" ? `席 · ${n} 个${zh}` : `seats in ${n}`);
    return [
      { label: t("members", lang), value: formatNumber(e.members ?? 0, lang), unit: t("membersUnit", lang), icon: Users },
      { label: t("statParliaments", lang), value: String(terr), unit: across(nTerr, "领地"), icon: Landmark },
      { label: t("statCouncils", lang), value: String(city), unit: across(nCity, "城市"), icon: Building2 },
    ];
  }
  if (e.road) {
    const [lo, hi] = e.road.lanes;
    return [
      ...lengthStat(e, lang),
      { label: t("lanes", lang), value: lo === hi ? String(lo * 2) : `${lo * 2}–${hi * 2}`, unit: t("bothWays", lang), icon: Columns3 },
      { label: t("dailyTraffic", lang), ...scaledSpan(e.road.aadt, lang, t("vehiclesPerDay", lang)), icon: Car },
    ];
  }
  if (e.tech || e.service) {
    const out = lengthStat(e, lang);
    if (e.tech?.operating_speed_kmh) out.push({ label: t("operatingSpeed", lang), value: String(e.tech.operating_speed_kmh), unit: "km/h", icon: Gauge });
    if (e.service?.freight_t_per_year) {
      const n = e.service.freight_t_per_year;
      out.push({ label: t("freightVolume", lang), ...scaledSpan([n, n], lang, t("tonnesPerYear", lang)), icon: TrainFront });
    } else if (e.service?.ridership_per_year) {
      const n = e.service.ridership_per_year;
      out.push({ label: t("ridership", lang), ...scaledSpan([n, n], lang, t("tripsPerYear", lang)), icon: TrainFront });
    }
    return out;
  }
  const out: StatItem[] = [];
  if (e.population) out.push({ label: t("population", lang), value: formatPopulation(e.population, lang), icon: Users });
  out.push(...areaStat(e, lang));
  if (e.stats?.islands) out.push({ label: t("islands", lang), value: formatNumber(e.stats.islands, lang), icon: Shell });
  if (e.economy) out.push(gdpStat(e.economy.gdp_usd, lang));
  if (e.kind === "division" && e.stats?.density_per_km2)
    out.push({ label: t("density", lang), value: formatNumber(e.stats.density_per_km2, lang, e.stats.density_per_km2 < 10 ? 1 : 0), unit: t("perKm2", lang), icon: ChartNoAxesColumn });
  out.push(...lengthStat(e, lang));
  if (e.stats?.skyways_km) out.push({ label: t("skyways", lang), value: formatNumber(e.stats.skyways_km, lang, 1), unit: "km", icon: Ruler });
  if (e.stats?.bridge_km) out.push({ label: t("seaBridge", lang), value: formatNumber(e.stats.bridge_km, lang, 1), unit: "km", icon: Ruler });
  if (e.stats?.undersea_tunnel_km) out.push({ label: t("underseaTunnel", lang), value: formatNumber(e.stats.undersea_tunnel_km, lang, 1), unit: "km", icon: Ruler });
  if (e.stats?.elevation_m) out.push({ label: t("elevation", lang), value: formatNumber(e.stats.elevation_m, lang), unit: "m", icon: Mountain });
  if (e.stats?.prominence_m) out.push({ label: t("prominence", lang), value: formatNumber(e.stats.prominence_m, lang), unit: "m", icon: Mountain });
  if (e.stats?.width_km) out.push({ label: t("width", lang), value: formatNumber(e.stats.width_km, lang, 1), unit: "km", icon: Ruler });
  if (e.stats?.drainage_km2) out.push({ label: t("drainage", lang), value: formatNumber(e.stats.drainage_km2, lang), unit: "km²", icon: Droplets });
  if (e.stats?.elev_max_m) out.push({ label: t("maxElevation", lang), value: formatNumber(e.stats.elev_max_m, lang), unit: "m", icon: Mountain });
  return out.slice(0, 3);
}

function speedText(speed: NonNullable<Entity["speed"]>, lang: Lang) {
  const nums = speed.limits.filter((v): v is number => v !== null);
  if (speed.limits.includes(null)) {
    if (!nums.length) return t("noLimit", lang);
    const lo = Math.min(...nums);
    return `${t("noLimit", lang)} · ${lang === "zh" ? `${t("inPlaces", lang)} ${lo} km/h` : `${lo} km/h ${t("inPlaces", lang)}`}`;
  }
  const [lo, hi] = [Math.min(...nums), Math.max(...nums)];
  return `${lo === hi ? lo : `${lo}–${hi}`} km/h`;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

function EngineeringSection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const eng = entity.engineering;
  if (!eng) return null;
  if (!eng.length_km)
    return (
      <Section title={t("engineeringTitle", lang)}>
        <p className="text-[13px] text-muted">{t("nothingBuilt", lang)}</p>
      </Section>
    );
  const total = entity.stats?.length_km ?? eng.length_km;
  const rows: [string, React.ReactNode][] = [];
  if (Math.abs(total - eng.length_km) > Math.max(1, total * 0.02)) rows.push([t("builtHere", lang), `${formatNumber(eng.length_km, lang, 1)} km`]);
  rows.push([
    t("bridges", lang),
    <>
      {formatNumber(eng.bridge_km, lang, 1)} km <span className="text-faint">· {pct(eng.bridge_km, eng.length_km)}%</span>
      {eng.river_bridges > 0 && <span className="text-faint"> · {eng.river_bridges} {t("riverBridges", lang)}</span>}
    </>,
  ]);
  rows.push([t("tunnels", lang), <>{formatNumber(eng.tunnel_km, lang, 1)} km <span className="text-faint">· {pct(eng.tunnel_km, eng.length_km)}%</span></>]);
  if (eng.snow_shed_km)
    rows.push([t("snowSheds", lang), <>{formatNumber(eng.snow_shed_km, lang, 1)} km <span className="text-faint">· {pct(eng.snow_shed_km, eng.length_km)}%</span></>]);
  rows.push([
    t("construction", lang),
    <>
      {formatUsd(eng.construction_usd, lang)}
      <span className="text-faint">
        {" "}· {t("perKmCost", lang)} {formatUsd(eng.construction_usd / Math.max(eng.length_km, 0.1), lang)}
        {eng.stations ? ` · ${t("stationsIncluded", lang)} ${eng.stations}` : ""}
      </span>
    </>,
  ]);
  rows.push([t("upkeep", lang), `${formatUsd(eng.upkeep_usd_per_year, lang)}${t("perYear", lang)}`]);
  for (const [kind, key] of [["bridge", "longestBridge"], ["tunnel", "longestTunnel"], ["snow_shed", "longestSnowShed"]] as const) {
    const s = entity.structures?.[kind];
    if (s) rows.push([t(key, lang), <>{s.names[lang]} <span className="text-faint">· {formatNumber(s.km, lang, 1)} km</span></>]);
  }
  if (entity.tech && eng.max_grade_permille) rows.push([t("maxGrade", lang), `${formatNumber(eng.max_grade_permille, lang)}‰`]);
  const structures = pct(eng.bridge_km + eng.tunnel_km, eng.length_km);
  return (
    <Section title={t("engineeringTitle", lang)}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-hover">
          <span className="h-full bg-sky-500" style={{ width: `${pct(eng.bridge_km, eng.length_km)}%` }} />
          <span className="h-full bg-stone-500" style={{ width: `${pct(eng.tunnel_km, eng.length_km)}%` }} />
          {eng.snow_shed_km ? <span className="h-full bg-stone-300" style={{ width: `${pct(eng.snow_shed_km, eng.length_km)}%` }} /> : null}
        </div>
        <span className="text-[12px] text-muted tabular-nums">
          {lang === "zh" ? "桥隧比" : "Structures"} <span className="font-semibold text-ink">{structures}%</span>
        </span>
      </div>
      {entity.straight && <p className="mb-2 text-[12.5px] font-medium text-accent">{t("straightLine", lang)}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function TechSection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const tech = entity.tech;
  if (!tech) return null;
  const rows: [string, string][] = [];
  if (tech.operating_speed_kmh) rows.push([t("operatingSpeed", lang), `${tech.operating_speed_kmh} km/h`]);
  if (tech.design_speed_kmh) rows.push([t("designSpeed", lang), `${tech.design_speed_kmh} km/h`]);
  if (tech.gauge_mm) rows.push([t("gauge", lang), `${formatNumber(tech.gauge_mm, lang)} mm${tech.gauge_mm === 1435 ? ` · ${t("standardGauge", lang)}` : ""}`]);
  if (tech.electrification) rows.push([t("power", lang), `${tech.electrification} · ${t("overhead", lang)}`]);
  if (tech.power) rows.push([t("power", lang), `${tech.power.voltage} · ${t(tech.power.supply === "overhead" ? "overhead" : "thirdRail", lang)}`]);
  if (tech.tube) rows.push([t("tube", lang), tech.tube[lang]]);
  if (tech.levitation) rows.push([t("levitation", lang), tech.levitation[lang]]);
  if (tech.propulsion) rows.push([t("propulsion", lang), tech.propulsion[lang]]);
  if (tech.formation) {
    const f = tech.formation;
    rows.push([
      t("formation", lang),
      lang === "zh"
        ? `${f.cars} 辆${f.type ? ` ${f.type} 型车` : ""}${f.coupled ? `，可重联 ${f.coupled} 辆` : ""}`
        : `${f.cars} cars${f.type ? `, Type ${f.type}` : ""}${f.coupled ? `, ${f.coupled} coupled` : ""}`,
    ]);
  }
  if (tech.signalling) rows.push([t("signalling", lang), tech.signalling]);
  if (tech.tracks) rows.push([t("tracks", lang), lang === "zh" ? (tech.tracks === 2 ? "双线" : `${tech.tracks} 线`) : tech.tracks === 2 ? "Double track" : `${tech.tracks} tracks`]);
  if (tech.min_curve_radius_m) rows.push([t("minCurve", lang), `${formatNumber(tech.min_curve_radius_m, lang)} m`]);
  if (tech.axle_load_t) rows.push([t("axleLoad", lang), `${formatNumber(tech.axle_load_t, lang, 1)} t`]);
  if (tech.train?.net_t && tech.train.wagons) {
    const { names, net_t, wagons } = tech.train;
    rows.push([
      t("trainModel", lang),
      lang === "zh"
        ? `${names.zh} · ${wagons} 节${tech.tube ? "货运舱" : "车皮"}，每列净载 ${formatNumber(net_t, lang)} 吨`
        : `${names.en} · ${wagons} ${tech.tube ? "capsules" : "wagons"}, ${formatNumber(net_t, lang)} t net a train`,
    ]);
  }
  if (tech.train?.seats && tech.formation) {
    const { names, seats } = tech.train;
    const f = tech.formation;
    const coupled = f.coupled ? Math.round((seats * f.coupled) / f.cars) : 0;
    rows.push([
      t("trainModel", lang),
      lang === "zh"
        ? `${names.zh} · ${f.cars} 辆 ${formatNumber(seats, lang)} 座${coupled ? `，重联 ${formatNumber(coupled, lang)} 座` : ""}`
        : `${names.en} · ${formatNumber(seats, lang)} seats in ${f.cars} cars${coupled ? `, ${formatNumber(coupled, lang)} coupled` : ""}`,
    ]);
  }
  return (
    <Section title={t("techTitle", lang)}>
      <Rows rows={rows} />
    </Section>
  );
}

const span = ([lo, hi]: [number, number], f: (v: number) => string) => (lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`);

function RoadSection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const road = entity.road;
  if (!road) return null;
  const [lo, hi] = road.lanes;
  const xs = road.cross_section;
  const rows: [string, React.ReactNode][] = [
    [
      t("lanes", lang),
      <>
        {lang === "zh" ? `双向 ${lo * 2} 车道 + ${t("emergencyLane", lang)}` : `${lo} each way + ${t("emergencyLane", lang)}`}
        {hi > lo && <span className="text-faint"> · {t("busiest", lang)} {lang === "zh" ? `双向 ${hi * 2} 车道` : `${hi} each way`}</span>}
      </>,
    ],
    ...(entity.speed?.limits.length ? [[t("speedLimit", lang), speedText(entity.speed, lang)] as [string, string]] : []),
    [
      t("crossSection", lang),
      `${t("laneWidth", lang)} ${xs.lane_m} m · ${t("emergencyLane", lang)} ${xs.shoulder_m} m · ${t("median", lang)} ${xs.median_m} m`,
    ],
    [t("roadbedWidth", lang), `${span(road.width_m, (v) => formatNumber(v, lang, 1))} m`],
    [t("driveTime", lang), formatDuration(road.drive_min, lang)],
    [t("dailyTraffic", lang), `${span(road.aadt, (v) => formatPopulation(v, lang))} ${t("vehiclesPerDay", lang)}`],
  ];
  if (road.operator) rows.push([t("roadOperator", lang), road.operator[lang]]);
  return (
    <Section title={t("roadTitle", lang)}>
      <Rows rows={rows} />
    </Section>
  );
}

function ServiceSection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const s = entity.service;
  if (!s) return null;
  const freight = s.freight_t_per_year != null;
  const rows: [string, React.ReactNode][] = freight
    ? [
        [t("runTime", lang), formatDuration(s.fastest_min, lang)],
        [t("loadedTrains", lang), lang === "zh" ? `每天 ${s.loaded_trains_per_day} 列` : `${s.loaded_trains_per_day} a day`],
        [t("freightVolume", lang), lang === "zh" ? `${formatPopulation(s.freight_t_per_year!, lang)}吨` : `${formatPopulation(s.freight_t_per_year!, lang)} t`],
      ]
    : [
        [t("fastestRun", lang), <>{formatDuration(s.fastest_min, lang)} <span className="text-faint">· {t("nonStop", lang)}</span></>],
        s.trains_per_day
          ? [t("timetable", lang), lang === "zh" ? `每天 ${s.trains_per_day} 班` : `${s.trains_per_day} trains a day`]
          : [t("peakHeadway", lang), lang === "zh" ? `每 ${s.peak_headway_min} 分钟一班` : `every ${s.peak_headway_min} min`],
        [t("ridership", lang), lang === "zh" ? `${formatPopulation(s.ridership_per_year ?? 0, lang)}人次` : formatPopulation(s.ridership_per_year ?? 0, lang)],
      ];
  if (s.operator) rows.push([t("railOperator", lang), s.operator[lang]]);
  return (
    <Section title={t("serviceTitle", lang)}>
      <Rows rows={rows} />
    </Section>
  );
}

function MilitarySection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const m = entity.military;
  if (!m) return null;
  const rows: [string, React.ReactNode][] = [
    [t("unit", lang), m.unit[lang]],
    [t("branch", lang), m.branch[lang]],
    [t("equipment", lang), m.equipment[lang]],
    [t("personnel", lang), lang === "zh" ? `约 ${formatPopulation(m.personnel, lang)}人` : `about ${formatPopulation(m.personnel, lang)}`],
    [t("publicAccess", lang), m.access[lang]],
  ];
  return (
    <Section title={t("militaryTitle", lang)}>
      <Rows rows={rows} />
    </Section>
  );
}

const SHARE_TONES = [100, 58, 28];
const tone = (accent: string, i: number) => `color-mix(in srgb, ${accent} ${SHARE_TONES[i % SHARE_TONES.length]}%, var(--ui-hover))`;

/** Shares of a whole as one segmented bar, with the legend under it; the largest share is the strongest tone. */
function ShareBar({ parts, accent }: { parts: { label: string; value: number }[]; accent: string }) {
  const rank = parts.map((p) => parts.filter((q) => q.value > p.value).length);
  return (
    <>
      <div className="flex h-2 gap-[2px] overflow-hidden rounded-full">
        {parts.map((p, i) => (
          <motion.span
            key={p.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: tone(accent, rank[i]) }}
            initial={{ width: 0 }}
            animate={{ width: `${p.value}%` }}
            transition={{ duration: 0.6, delay: 0.05 * i, ease: "easeOut" }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {parts.map((p, i) => (
          <span key={p.label} className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-full" style={{ background: tone(accent, rank[i]) }} />
            {p.label}
            <span className="text-ink tabular-nums">{p.value}%</span>
          </span>
        ))}
      </div>
    </>
  );
}

/** One thin bar per share, largest first. */
function ShareRows({ rows, accent }: { rows: { label: string; value: number }[]; accent: string }) {
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={r.label} className="grid grid-cols-[6rem_1fr_2.25rem] items-center gap-2.5 text-[12px]">
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-hover">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: accent }}
              initial={{ width: 0 }}
              animate={{ width: `${r.value}%` }}
              transition={{ duration: 0.6, delay: 0.05 * i, ease: "easeOut" }}
            />
          </span>
          <span className="text-right text-ink tabular-nums">{r.value}%</span>
        </div>
      ))}
    </div>
  );
}

function EconomySection({ entity, lang, accent }: { entity: Entity; lang: Lang; accent: string }) {
  const ec = entity.economy;
  if (!ec) return null;
  const s = ec.sectors;
  return (
    <Section title={t("economyTitle", lang)}>
      <Rows
        rows={[
          [t("gdp", lang), formatUsd(ec.gdp_usd, lang)],
          [t("gdpPerCapita", lang), formatUsd(ec.gdp_per_capita_usd, lang)],
          ...(ec.median_income_usd ? [[t("medianIncome", lang), formatUsd(ec.median_income_usd, lang)] as [string, string]] : []),
          ...(ec.gini !== undefined ? [[t("gini", lang), formatNumber(ec.gini, lang)] as [string, string]] : []),
          ...(ec.unemployment !== undefined ? [[t("unemployment", lang), `${formatNumber(ec.unemployment, lang, 1)}%`] as [string, string]] : []),
          ...(ec.inflation !== undefined ? [[t("inflation", lang), `${formatNumber(ec.inflation, lang, 1)}%`] as [string, string]] : []),
        ]}
      />
      <Sub label={t("sectorMix", lang)}>
        <ShareBar
          accent={accent}
          parts={[
            { label: t("primarySector", lang), value: s.primary },
            { label: t("secondarySector", lang), value: s.secondary },
            { label: t("tertiarySector", lang), value: s.tertiary },
          ]}
        />
      </Sub>
      {ec.industries.length > 0 && (
        <Sub label={t("leadingIndustries", lang)}>
          <ul className="flex flex-wrap gap-1.5">
            {ec.industries.map((ind) => (
              <li
                key={ind.en}
                className="rounded-full border px-2.5 py-0.5 text-[12px] text-ink"
                style={{ background: `color-mix(in srgb, ${accent} 7%, transparent)`, borderColor: `color-mix(in srgb, ${accent} 22%, transparent)` }}
              >
                {ind[lang]}
              </li>
            ))}
          </ul>
        </Sub>
      )}
    </Section>
  );
}

function PeopleSection({ entity, lang, accent }: { entity: Entity; lang: Lang; accent: string }) {
  const dm = entity.demographics;
  if (!dm) return null;
  const [young, working, old] = dm.age;
  const langs = NAME_LANGS.filter((l) => dm.languages[l] !== undefined)
    .map((l) => ({ label: NAME_LANG_LABELS[l][lang], value: dm.languages[l]! }))
    .sort((a, b) => b.value - a.value);
  const eth = dm.ethnicity;
  const origins = eth
    ? ETHNIC_GROUPS.filter((g) => eth[g] !== undefined).map((g) => ({ label: t(`eth_${g}` as StringKey, lang), value: eth[g]! }))
    : [];
  const rows: [string, string][] = [
    ...(dm.life_expectancy !== undefined ? [[t("lifeExpectancy", lang), `${formatNumber(dm.life_expectancy, lang, 1)} ${lang === "zh" ? "岁" : "years"}`] as [string, string]] : []),
    ...(dm.literacy !== undefined ? [[t("literacy", lang), `${formatNumber(dm.literacy, lang, 1)}%`] as [string, string]] : []),
    ...(dm.hdi !== undefined ? [[t("hdi", lang), formatNumber(dm.hdi, lang, 3)] as [string, string]] : []),
  ];
  return (
    <Section title={t("peopleTitle", lang)}>
      {rows.length > 0 && <Rows rows={rows} />}
      <Sub label={t("ageStructure", lang)}>
        <ShareBar
          accent={accent}
          parts={[
            { label: t("ageYoung", lang), value: young },
            { label: t("ageWorking", lang), value: working },
            { label: t("ageOld", lang), value: old },
          ]}
        />
      </Sub>
      <Sub label={t("firstLanguage", lang)}>
        <ShareRows rows={langs} accent={accent} />
      </Sub>
      {origins.length > 0 && (
        <Sub label={t("ethnicOrigin", lang)}>
          <ShareRows rows={origins} accent={accent} />
        </Sub>
      )}
    </Section>
  );
}

/** A territory's climate overview, or a district's or city's monthly normals as a climograph. */
function ClimateSection({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const c = entity.climate;
  if (!c) {
    if (!entity.climate_notes) return null;
    return (
      <Section title={t("climateTitle", lang)}>
        <Paragraphs text={entity.climate_notes[lang]} className="text-[13px] leading-relaxed text-ink" />
      </Section>
    );
  }
  const deg = (v: number) => `${formatNumber(v, lang, 1)} °C`;
  const days = (n: number) => (lang === "zh" ? `${n} 天` : `${n} days`);
  const hours = (v: number) => formatNumber(v, lang, 1);
  const at = c.at ? data.entities[c.at] : undefined;
  const rows: [string, ReactNode][] = [
    [
      t("climateType", lang),
      <>
        <span className="font-mono text-[12.5px] font-semibold">{c.type}</span> <span className="text-muted">· {climateName(c.type, lang)}</span>
      </>,
    ],
    [t("meanTemp", lang), deg(c.mean_c)],
    [t("annualPrecip", lang), `${formatNumber(c.precip_mm, lang)} ${lang === "zh" ? "毫米" : "mm"}`],
    [t("annualSun", lang), `${formatNumber(c.sun_h, lang)} ${lang === "zh" ? "小时" : "hours"}`],
    [
      t("recordTemps", lang),
      <>
        <span style={{ color: "#f97316" }}>{deg(c.record.hi)}</span> <span className="text-faint">/</span> <span style={{ color: "#0ea5e9" }}>{deg(c.record.lo)}</span>
      </>,
    ],
    c.polar_night_days || c.midnight_sun_days
      ? [t("polarDays", lang), `${days(c.polar_night_days)} / ${days(c.midnight_sun_days)}`]
      : [
          t("dayRange", lang),
          `${hours(Math.min(...c.months.daylight))}–${hours(Math.max(...c.months.daylight))} ${lang === "zh" ? "小时（月平均）" : "hours (monthly mean)"}`,
        ],
  ];
  return (
    <Section title={t("climateTitle", lang)}>
      <Climograph climate={c} lang={lang} />
      <div className="mt-3">
        <Rows rows={rows} />
      </div>
      {at && (
        <p className="mt-2.5 text-[12px] text-muted">
          {t("climateAt", lang)}{" "}
          <button onClick={() => select(at.id)} className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-current">
            {displayName(at, lang)}
          </button>
          {lang === "zh" ? "" : "."}
        </p>
      )}
    </Section>
  );
}

function codes(e: Entity, lang: Lang) {
  const c = e.codes ?? {};
  const out: [string, string][] = [];
  if (c.admin) out.push([t("adminCode", lang), c.admin]);
  if (c.iso3166_2) out.push(["ISO 3166-2", c.iso3166_2]);
  if (c.iso3166_1) out.push(["ISO 3166-1", `${c.iso3166_1.alpha2} · ${c.iso3166_1.alpha3} · ${c.iso3166_1.numeric}`]);
  if (c.unlocode) out.push(["UN/LOCODE", c.unlocode]);
  if (e.ref && e.kind === "route") out.push([lang === "zh" ? "路线编号" : "Route number", e.ref]);
  return out;
}

function ChildList({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const isLine = entity.network === "intercity_rail" || entity.network === "freight_rail" || entity.network === "metro";
  const isStation = entity.subtype === "station";
  const ids = entity.kind === "route" ? (entity.via ?? []) : isStation ? (entity.lines ?? []) : (entity.children ?? []);
  const kids = ids.map((id) => data.entities[id]).filter((k): k is Entity => !!k?.bbox);
  if (!kids.length) return null;
  const max = Math.max(...kids.map((k) => k.population ?? 0), 1);
  const lineColor = accentColor(data, entity) ?? "var(--ui-accent)";
  const title = isLine
    ? `${t("stations", lang)} · ${kids.length}`
    : isStation
      ? t("servedBy", lang)
      : entity.kind === "route"
        ? t("passesThrough", lang)
        : `${t(entity.nation?.exile ? "claimedTerritory" : "subdivisions", lang)} · ${kids.length}`;
  return (
    <Section title={title}>
      <ul className={clsx("-mx-2", isLine ? "relative" : "space-y-0.5")}>
        {isLine && <span className="absolute top-3 bottom-3 left-[11px] w-[3px] rounded-full opacity-70" style={{ background: lineColor }} />}
        {kids.map((k) => {
          const accent = accentColor(data, k) ?? "var(--ui-accent)";
          const others = isLine ? (k.lines ?? []).filter((l) => l !== entity.id).map((l) => data.entities[l]).filter(Boolean) : [];
          return (
            <li key={k.id} className="relative">
              <button onClick={() => select(k.id)} className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover">
                <div className="flex items-center gap-2">
                  {isLine ? (
                    <span className="relative size-[9px] shrink-0 rounded-full border-2 bg-panel-solid" style={{ borderColor: others.length ? "var(--ui-ink)" : lineColor }} />
                  ) : hasEmblem(k) ? (
                    <Emblem entity={k} size={22} className="-my-0.5 shrink-0 transition-transform group-hover:scale-110" />
                  ) : (
                    <span className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
                  )}
                  <span className="flex-1 truncate text-[13px] text-ink">{displayName(k, lang)}</span>
                  {others.map((o) => (
                    <span key={o.id} title={displayName(o, lang)} className="h-1.5 w-3 shrink-0 rounded-full" style={{ background: accentColor(data, o) }} />
                  ))}
                  {k.population ? <span className="text-[12px] text-muted tabular-nums">{formatPopulation(k.population, lang)}</span> : null}
                </div>
                {entity.kind !== "route" && k.population ? (
                  <div className={clsx("mt-1 h-1 overflow-hidden rounded-full bg-hover", hasEmblem(k) ? "ml-[30px]" : "ml-4")}>
                    <div className="h-full rounded-full opacity-80" style={{ width: `${(100 * k.population) / max}%`, background: accent }} />
                  </div>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The entity's place in the hierarchy, outermost first; each level opens its own card. */
function Lineage({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const chain = lineage(data, entity).slice(0, -1);
  if (!chain.length) return null;
  return (
    <Section title={t("locatedIn", lang)}>
      <ol className="-mx-1 flex flex-wrap items-center gap-y-1">
        {chain.map((e, i) => (
          <li key={e.id} className="flex items-center">
            {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-faint" />}
            <button
              disabled={!e.bbox}
              onClick={() => select(e.id)}
              className={clsx("flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] text-ink", e.bbox && "hover:bg-hover")}
            >
              {hasEmblem(e) && <Emblem entity={e} size={18} className="shrink-0" />}
              {e.short_names?.[lang] ?? displayName(e, lang)}
            </button>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/** The flag, its proportions and tinctures and what they stand for; the flag opens full size. */
function FlagSection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation(); // close the flag, not the card
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  if (!hasEmblem(entity)) return null;
  return (
    <Section title={t(entity.motto ? "symbols" : "flag", lang)}>
      {entity.motto && (
        <p className="mb-3 text-[13px] text-muted">
          {t("motto", lang)} · <span className="italic text-ink">{entity.motto[lang]}</span>
        </p>
      )}
      <button onClick={() => setOpen(true)} className="group relative block w-full transition-transform duration-200 hover:scale-[1.01]" aria-label={t("enlarge", lang)}>
        <Flag entity={entity} size={360} className="h-auto w-full drop-shadow-[0_6px_16px_rgba(0,0,0,0.22)]" />
        <Maximize2 className="absolute right-3 bottom-3 size-4 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-90" />
      </button>
      {entity.flag_notes && <Paragraphs text={entity.flag_notes[lang]} className="mt-3.5 text-[13px] leading-relaxed text-ink" />}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-black/55 p-6 backdrop-blur-sm"
            >
              <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 320, damping: 28 }}>
                <Flag entity={entity} size={Math.min(window.innerWidth - 48, 720)} className="drop-shadow-[0_12px_40px_rgba(0,0,0,0.45)]" />
                <p className="mt-3 text-center text-[13px] font-medium text-white/85">{displayName(entity, lang)}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </Section>
  );
}

/** A slim bar pinned to the top of the card once its header has scrolled away: the name, back and close. */
function StickyBar({ entity, lang, head }: { entity: Entity; lang: Lang; head: RefObject<HTMLDivElement | null> }) {
  const select = useAtlas((s) => s.select);
  const back = useAtlas((s) => s.back.length > 0);
  const goBack = useAtlas((s) => s.goBack);
  const bar = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const scroller = bar.current?.parentElement;
    if (!scroller) return;
    const update = () => setShown(scroller.scrollTop > (head.current?.offsetHeight ?? 120) - 12);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [head]);
  const mobile = useMobile();
  const button = "grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-hover hover:text-ink";
  return (
    <div ref={bar} className="sticky top-0 z-20 h-0">
      <div
        aria-hidden={!shown}
        className={clsx(
          "absolute inset-x-0 top-0 flex items-center gap-1 border-b border-line bg-panel-solid px-2 py-1.5 transition-[opacity,translate] duration-200",
          !mobile && "rounded-t-3xl",
          shown ? "opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        {back && (
          <button onClick={goBack} className={button} aria-label={t("back", lang)} tabIndex={shown ? 0 : -1}>
            <ChevronLeft className="size-4" />
          </button>
        )}
        <span className={clsx("min-w-0 flex-1 truncate text-[14px] font-semibold text-ink", !back && "pl-3")}>{cardName(entity, lang)}</span>
        <button onClick={() => select(null)} className={button} aria-label={t("close", lang)} tabIndex={shown ? 0 : -1}>
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

function CardBody({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const head = useRef<HTMLDivElement>(null);
  const select = useAtlas((s) => s.select);
  const setRoute = useAtlas((s) => s.setRoute);
  const routable = data.graph.places[entity.id] !== undefined;
  const accent = accentColor(data, entity) ?? "var(--ui-accent)";
  const items = stats(entity, lang, data);
  const codeRows = codes(entity, lang);
  const nameSet = entity.nation?.exile?.names ?? entity.names;
  const names = NAME_LANGS.filter((l) => nameSet[l]);
  const party = entity.kind === "party";

  const badgeOwner = entity.kind === "place" && entity.emblem_of ? data.entities[entity.emblem_of] : entity;
  const city = entity.subtype === "borough" && entity.parent ? data.entities[entity.parent] : undefined;
  const isCapital = data.entities[entity.parent ?? ""]?.capital === entity.id;
  const back = useAtlas((s) => s.back.at(-1));
  const goBack = useAtlas((s) => s.goBack);
  const backTo = back?.list ? t(back.list.query ? "backToResults" : "backToExplore", lang) : back?.id && data.entities[back.id] ? displayName(data.entities[back.id], lang) : null;

  const about = (entity.notes || entity.background) && (
    <Section title={t("about", lang)}>
      {entity.notes && <Paragraphs text={entity.notes[lang]} className="text-[13.5px] leading-relaxed text-ink" />}
      {entity.background && (
        <>
          <h4 className="mt-3 mb-1 text-[11px] font-semibold text-faint">{t("background", lang)}</h4>
          <Paragraphs text={entity.background[lang]} className="text-[13px] leading-relaxed text-muted" />
        </>
      )}
    </Section>
  );
  const codeSection = codeRows.length > 0 && (
    <Section title={t("codes", lang)}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        {codeRows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-mono text-[12.5px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );

  return (
    <>
      <StickyBar entity={entity} lang={lang} head={head} />
      <div ref={head} className={clsx("relative overflow-hidden px-5 pb-4", back ? "pt-3" : "pt-5")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.2]" style={{ background: `linear-gradient(180deg, ${accent}, transparent)` }} />
        {back && (
          <button
            onClick={goBack}
            className="relative -ml-2 mb-2 flex max-w-full items-center gap-0.5 rounded-full py-1 pr-2.5 pl-1 text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <ChevronLeft className="size-4 shrink-0" />
            <span className="shrink-0">{t("back", lang)}</span>
            {backTo && <span className="truncate text-faint">· {backTo}</span>}
          </button>
        )}
        <div className="relative flex items-start gap-3.5">
          {badgeOwner && hasEmblem(badgeOwner) ? (
            <TiltBadge glow={accent}>
              <Emblem entity={badgeOwner} size={64} className="drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)]" />
            </TiltBadge>
          ) : hasShield(entity) ? (
            <span className="mt-1 grid h-12 shrink-0 place-items-center drop-shadow-[0_3px_8px_rgba(0,0,0,0.25)]">
              <RouteShield entity={entity} height={44} />
            </span>
          ) : (
            <span className="relative mt-1 shrink-0">
              <span className="grid size-12 place-items-center rounded-2xl text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}bb)` }}>
                <EntityIcon entity={entity} className="size-5" />
              </span>
              {city && hasEmblem(city) && (
                <button onClick={() => select(city.id)} className="absolute -right-3 -bottom-1.5 transition-transform hover:scale-110" title={displayName(city, lang)}>
                  <Emblem entity={city} size={26} className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" />
                </button>
              )}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium tracking-wide text-muted uppercase">{kindLabel(entity, lang)}</span>
              {isCapital && (
                <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-px text-[10.5px] font-semibold text-amber-500">
                  <Star className="size-2.5 fill-current" />
                  {t(data.entities[entity.parent ?? ""]?.role === "nation" ? "nationCapital" : "capitalOf", lang)}
                </span>
              )}
              {entity.nation?.exile && (
                <span className="rounded-full bg-rose-500/15 px-1.5 py-px text-[10.5px] font-semibold text-rose-500">{t("exileTag", lang)}</span>
              )}
              {entity.wonder && (
                <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-1.5 py-px text-[10.5px] font-semibold text-violet-500">
                  <Sparkles className="size-2.5" />
                  {t("wonder", lang)}
                </span>
              )}
            </div>
            <h2 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">{cardName(entity, lang)}</h2>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" aria-label={t("names", lang)}>
              {names
                .filter((l) => l !== lang)
                .map((l) => (
                  <li key={l} className="flex min-w-0 items-baseline gap-1.5 text-[12.5px]" title={NAME_LANG_LABELS[l][lang]}>
                    <span className="shrink-0 text-[10px] font-semibold tracking-wide text-faint">{NAME_TAGS[l][lang]}</span>
                    <span className="truncate text-muted">{nameSet[l]}</span>
                  </li>
                ))}
            </ul>
            {entity.wonder && (
              <p className="mt-2 text-[12.5px] leading-snug text-violet-500">
                {entity.wonder.structure && <span className="font-semibold">{wonderName(entity, lang)} · </span>}
                {entity.wonder[lang]}
              </p>
            )}
          </div>
          <button onClick={() => select(null)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-hover" aria-label={t("close", lang)}>
            <X className="size-4" />
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className={clsx("grid gap-2 px-5 pb-4", items.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
          {items.map((s) => (
            <Stat key={s.label} accent={accent} {...s} />
          ))}
        </div>
      )}

      {isGroupedCard(entity) ? (
        <CardGroups
          data={data}
          entity={entity}
          lang={lang}
          accent={accent}
          shared={{
            about,
            legislature: <LegislatureSection data={data} entity={entity} lang={lang} />,
            people: <PeopleSection entity={entity} lang={lang} accent={accent} />,
            economy: <EconomySection entity={entity} lang={lang} accent={accent} />,
            climate: <ClimateSection data={data} entity={entity} lang={lang} />,
            children: <ChildList data={data} entity={entity} lang={lang} />,
            backed: <BackedSection data={data} entity={entity} lang={lang} />,
            flag: <FlagSection entity={entity} lang={lang} />,
            lineage: <Lineage data={data} entity={entity} lang={lang} />,
            codes: codeSection,
            party: (part) => <PartySections data={data} entity={entity} lang={lang} part={part} />,
          }}
        />
      ) : (
        <>
          {about}

          <PartySections data={data} entity={entity} lang={lang} />
          {party && <FlagSection entity={entity} lang={lang} />}
          <LegislatureSection data={data} entity={entity} lang={lang} />
          <CouncilSection data={data} entity={entity} lang={lang} />
          <ElectionSection data={data} entity={entity} lang={lang} />
          <PeopleSection entity={entity} lang={lang} accent={accent} />
          <EconomySection entity={entity} lang={lang} accent={accent} />
          <ClimateSection data={data} entity={entity} lang={lang} />

          {entity.segments?.length ? <RouteTimeline data={data} entity={entity} lang={lang} /> : <ChildList data={data} entity={entity} lang={lang} />}
          <BackedSection data={data} entity={entity} lang={lang} />

          <MilitarySection entity={entity} lang={lang} />
          <RoadSection entity={entity} lang={lang} />
          <ServiceSection entity={entity} lang={lang} />
          <TechSection entity={entity} lang={lang} />
          <EngineeringSection entity={entity} lang={lang} />
          {!party && <FlagSection entity={entity} lang={lang} />}

          <Lineage data={data} entity={entity} lang={lang} />
          {codeSection}
        </>
      )}

      {routable && (
        <div className="flex gap-2 border-t border-line px-5 py-4">
          <button onClick={() => setRoute({ from: entity.id })} className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-hover">
            <span className="size-2 rounded-full bg-emerald-500" />
            {t("routeFrom", lang)}
          </button>
          <button onClick={() => setRoute({ to: entity.id })} className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-[12.5px] font-medium text-ink hover:bg-hover">
            <span className="size-2 rounded-full bg-rose-500" />
            {t("routeTo", lang)}
          </button>
        </div>
      )}

      <footer className="border-t border-line px-4 pt-3 pb-4">
        <p className="text-center font-mono text-[10px] tracking-wider text-faint select-all">{entity.id}</p>
      </footer>
    </>
  );
}

export function InfoCard() {
  const data = useAtlas((s) => s.data);
  const lang = useAtlas((s) => s.lang);
  const selectedId = useAtlas((s) => s.selectedId);
  const entity = selectedId && data ? data.entities[selectedId] : undefined;
  const mobile = useMobile();

  return (
    <AnimatePresence mode="wait">
      {data && entity && (mobile ? <BottomSheet key={entity.id} data={data} entity={entity} lang={lang} /> : <Card key={entity.id} data={data} entity={entity} lang={lang} />)}
    </AnimatePresence>
  );
}

function Card({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const scroll = useCardScroll<HTMLElement>(entity.id);
  const aside = useAtlas((s) => s.searchOpen);
  return (
    <motion.article
      ref={scroll}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={aside ? { opacity: 0, y: 8, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      aria-hidden={aside || undefined}
      className={clsx("glass scrollbar-thin min-h-0 overflow-y-auto rounded-3xl select-text", aside ? "pointer-events-none" : "pointer-events-auto")}
    >
      <CardBody data={data} entity={entity} lang={lang} />
    </motion.article>
  );
}

const SHEET_FULL = 0.88;
const SHEET_HALF = 0.46;
const SHEET_SPRING = { type: "spring", stiffness: 420, damping: 40 } as const;
const viewHeight = () => window.visualViewport?.height ?? window.innerHeight;

/** Phone layout: the card is a sheet from the bottom, full height or half (map showing above). The sheet's
 * height follows the finger: half height, a swipe anywhere on it resizes it; full height, the card scrolls,
 * and pulling down once it is scrolled to the top resizes it. Let go and it settles at full, half or closed,
 * by how fast it was moving and where it is. */
function BottomSheet({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const full = useAtlas((s) => s.sheetFull);
  const setFull = useAtlas((s) => s.setSheetFull);
  const scroll = useCardScroll<HTMLDivElement>(entity.id);
  const aside = useAtlas((s) => s.searchOpen);
  const height = useMotionValue(viewHeight() * (full ? SHEET_FULL : SHEET_HALF));
  const gesture = useRef<{ y0: number; h0: number; y: number; t: number; v: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const settle = () => animate(height, viewHeight() * (full ? SHEET_FULL : SHEET_HALF), SHEET_SPRING);
    const run = settle();
    window.visualViewport?.addEventListener("resize", settle);
    return () => {
      run.stop();
      window.visualViewport?.removeEventListener("resize", settle);
    };
  }, [full, height]);

  const begin = (y: number) => {
    gesture.current = { y0: y, h0: height.get(), y, t: performance.now(), v: 0, moved: false };
  };
  const move = (y: number) => {
    const g = gesture.current;
    if (!g || (!g.moved && Math.abs(y - g.y0) < 6)) return false;
    const now = performance.now();
    g.v = (y - g.y) / Math.max(now - g.t, 1);
    g.y = y;
    g.t = now;
    g.moved = true;
    const vh = viewHeight();
    height.set(Math.min(Math.max(g.h0 - (y - g.y0), vh * 0.18), vh * 0.94));
    return true;
  };
  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.moved) return;
    dragged.current = true;
    const vh = viewHeight();
    const h = height.get();
    let next: "full" | "half" | "close";
    if (g.v < -0.4) next = "full";
    else if (g.v > 0.4) next = full && h > vh * SHEET_HALF * 0.8 ? "half" : "close";
    else if (h < vh * SHEET_HALF * 0.7) next = "close";
    else next = h > vh * (SHEET_HALF + SHEET_FULL) / 2 ? "full" : "half";
    if (next === "close") return select(null);
    animate(height, vh * (next === "full" ? SHEET_FULL : SHEET_HALF), SHEET_SPRING);
    setFull(next === "full");
  };

  // at full height the card scrolls; a pull down from its top resizes the sheet instead
  useEffect(() => {
    const el = scroll.current;
    if (!el || !full) return;
    const start = (e: TouchEvent) => {
      if (el.scrollTop <= 0) begin(e.touches[0].clientY);
    };
    const pull = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (!g.moved && e.touches[0].clientY < g.y0) {
        gesture.current = null;
        return;
      }
      if (move(e.touches[0].clientY)) e.preventDefault();
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", pull, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", pull);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  });

  // the pointer is captured only once it has moved, so a tap still reaches the link or button under it
  const pointer = (whole: boolean) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      if (whole || !full) begin(e.clientY);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      if (move(e.clientY) && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerUp: end,
    onPointerCancel: end,
  });

  return (
    <motion.article
      initial={{ y: "100%" }}
      animate={{ y: aside ? "100%" : 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 340, damping: 34 }}
      aria-hidden={aside || undefined}
      style={{ height }}
      onClickCapture={(e) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.stopPropagation();
        e.preventDefault();
      }}
      className="glass pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] border-b-0 pb-[env(safe-area-inset-bottom)]"
    >
      <div
        {...pointer(true)}
        onClick={() => setFull(!full)}
        className="flex shrink-0 cursor-grab touch-none justify-center pt-3 pb-2 active:cursor-grabbing"
        role="button"
        aria-label={t(full ? "collapse" : "expand", lang)}
      >
        <span className="h-1.5 w-11 rounded-full bg-faint/50" />
      </div>
      <div
        ref={scroll}
        {...pointer(false)}
        className={clsx("scrollbar-thin min-h-0 flex-1 overscroll-contain", full ? "overflow-y-auto select-text" : "touch-none overflow-hidden")}
      >
        <CardBody data={data} entity={entity} lang={lang} />
      </div>
    </motion.article>
  );
}
