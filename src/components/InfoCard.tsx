import clsx from "clsx";
import {
  Banknote,
  Car,
  ChartNoAxesColumn,
  Check,
  ChevronRight,
  Columns3,
  Crosshair,
  Droplets,
  Gauge,
  LandPlot,
  Link2,
  Mountain,
  Ruler,
  Shell,
  Star,
  TrainFront,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useDragControls, useSpring, type PanInfo } from "motion/react";
import { useState, type ReactNode } from "react";
import { CityEmblem, Emblem, hasEmblem } from "./Emblem";
import { RouteTimeline } from "./RouteTimeline";
import { cardPadding, useMobile } from "../lib/viewport";
import { accentColor, lineage } from "../lib/entity";
import { displayName, formatNumber, formatPopulation, formatUsd, kindLabel, NAME_LANG_LABELS, t } from "../lib/i18n";
import { hasShield } from "../lib/shields";
import { RouteShield } from "./RouteShield";
import { formatDuration } from "./RoutePanel";
import { NAME_LANGS, type AtlasData, type Entity, type Lang, type NameLang } from "../lib/types";

const NAME_TAGS: Record<NameLang, Record<Lang, string>> = {
  zh: { zh: "中", en: "ZH" },
  en: { zh: "英", en: "EN" },
  "art-x-viking": { zh: "维", en: "VIK" },
  "art-x-buckham": { zh: "巴", en: "BCK" },
  "art-x-tavrunaq": { zh: "塔", en: "TAV" },
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="mb-2.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{title}</h3>
      {children}
    </section>
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
function stats(e: Entity, lang: Lang): StatItem[] {
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
      <p className="mt-2.5 text-[11px] text-faint">{t("costNote", lang)}</p>
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
        ? `${names.zh} · ${wagons} 节车皮，每列净载 ${formatNumber(net_t, lang)} 吨`
        : `${names.en} · ${wagons} wagons, ${formatNumber(net_t, lang)} t net a train`,
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

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="text-ink tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
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
      <p className="mt-2.5 text-[11px] text-faint">{t("trafficNote", lang)}</p>
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
        [t("peakHeadway", lang), lang === "zh" ? `每 ${s.peak_headway_min} 分钟一班` : `every ${s.peak_headway_min} min`],
        [t("ridership", lang), lang === "zh" ? `${formatPopulation(s.ridership_per_year ?? 0, lang)}人次` : formatPopulation(s.ridership_per_year ?? 0, lang)],
      ];
  if (s.operator) rows.push([t("railOperator", lang), s.operator[lang]]);
  return (
    <Section title={t("serviceTitle", lang)}>
      <Rows rows={rows} />
      <p className="mt-2.5 text-[11px] text-faint">{t(freight ? "freightNote" : "serviceNote", lang)}</p>
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

function Sub({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-3.5 first:mt-0">
      <h4 className="mb-1.5 text-[11px] font-semibold text-faint">{label}</h4>
      {children}
    </div>
  );
}

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
  return (
    <Section title={t("peopleTitle", lang)}>
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
      <p className="mt-3 text-[11px] text-faint">{t("economyNote", lang)}</p>
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
        : `${t("subdivisions", lang)} · ${kids.length}`;
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

function CardAction({ onClick, accent, icon, label }: { onClick: () => void; accent: string; icon: ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="group flex flex-1 items-center justify-center gap-2 py-2.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-hover">
      <span
        className="grid size-6 place-items-center rounded-full transition-transform duration-200 group-hover:scale-110"
        style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function CardBody({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const map = useAtlas((s) => s.map);
  const setRoute = useAtlas((s) => s.setRoute);
  const routable = data.graph.places[entity.id] !== undefined;
  const [copied, setCopied] = useState(false);
  const accent = accentColor(data, entity) ?? "var(--ui-accent)";
  const items = stats(entity, lang);
  const codeRows = codes(entity, lang);
  const names = NAME_LANGS.filter((l) => entity.names[l]);

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const zoomTo = () => {
    if (map && entity.bbox) map.fitBounds(entity.bbox, { padding: cardPadding(), duration: 900 });
  };

  const badgeOwner = entity.kind === "place" && entity.emblem_of ? data.entities[entity.emblem_of] : entity;
  const city = entity.subtype === "borough" && entity.parent ? data.entities[entity.parent] : undefined;
  const isCapital = data.entities[entity.parent ?? ""]?.capital === entity.id;

  return (
    <>
      <div className="relative overflow-hidden px-5 pt-5 pb-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.2]" style={{ background: `linear-gradient(180deg, ${accent}, transparent)` }} />
        {badgeOwner && hasEmblem(badgeOwner) && (
          <div className="pointer-events-none absolute -top-10 -right-12 rotate-[-14deg] opacity-[0.09] blur-[0.5px]">
            <Emblem entity={badgeOwner} size={210} />
          </div>
        )}
        <div className="relative flex items-start gap-3.5">
          {badgeOwner && hasEmblem(badgeOwner) ? (
            <TiltBadge glow={accent}>
              <Emblem entity={badgeOwner} size={64} sheen className="drop-shadow-[0_6px_14px_rgba(0,0,0,0.35)]" />
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
                <button onClick={() => select(city.id)} className="absolute -right-2 -bottom-2 transition-transform hover:scale-110" title={displayName(city, lang)}>
                  <CityEmblem entity={city} size={24} className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)]" />
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
                  {t("capitalOf", lang)}
                </span>
              )}
            </div>
            <h2 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">{displayName(entity, lang)}</h2>
            <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" aria-label={t("names", lang)}>
              {names
                .filter((l) => l !== lang)
                .map((l) => (
                  <li key={l} className="flex min-w-0 items-baseline gap-1.5 text-[12.5px]" title={NAME_LANG_LABELS[l][lang]}>
                    <span className="shrink-0 text-[10px] font-semibold tracking-wide text-faint">{NAME_TAGS[l][lang]}</span>
                    <span className="truncate text-muted">{entity.names[l]}</span>
                  </li>
                ))}
            </ul>
          </div>
          <button onClick={() => select(null)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-hover" aria-label={t("close", lang)}>
            <X className="size-4" />
          </button>
        </div>
        {routable && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            <button onClick={() => setRoute({ from: entity.id })} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-hover">
              <span className="size-2 rounded-full bg-emerald-500" />
              {t("routeFrom", lang)}
            </button>
            <button onClick={() => setRoute({ to: entity.id })} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-hover">
              <span className="size-2 rounded-full bg-rose-500" />
              {t("routeTo", lang)}
            </button>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className={clsx("grid gap-2 px-5 pb-4", items.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
          {items.map((s) => (
            <Stat key={s.label} accent={accent} {...s} />
          ))}
        </div>
      )}

      {(entity.notes || entity.motto || entity.background) && (
        <Section title={t("about", lang)}>
          {entity.notes && <p className="text-[13.5px] leading-relaxed text-ink">{entity.notes[lang]}</p>}
          {entity.background && (
            <>
              <h4 className="mt-3 mb-1 text-[11px] font-semibold text-faint">{t("background", lang)}</h4>
              <p className="text-[13px] leading-relaxed text-muted">{entity.background[lang]}</p>
            </>
          )}
          {entity.motto && (
            <p className="mt-2 text-[13px] text-muted">
              {t("motto", lang)} · <span className="italic">{entity.motto[lang]}</span>
            </p>
          )}
        </Section>
      )}

      <EconomySection entity={entity} lang={lang} accent={accent} />
      <PeopleSection entity={entity} lang={lang} accent={accent} />

      {entity.segments?.length ? <RouteTimeline data={data} entity={entity} lang={lang} /> : <ChildList data={data} entity={entity} lang={lang} />}

      <MilitarySection entity={entity} lang={lang} />
      <RoadSection entity={entity} lang={lang} />
      <ServiceSection entity={entity} lang={lang} />
      <TechSection entity={entity} lang={lang} />
      <EngineeringSection entity={entity} lang={lang} />

      <Lineage data={data} entity={entity} lang={lang} />

      {codeRows.length > 0 && (
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
      )}

      <footer className="border-t border-line px-4 pt-3.5 pb-4">
        <div className="flex overflow-hidden rounded-2xl border border-line bg-hover">
          <CardAction onClick={zoomTo} accent={accent} icon={<Crosshair className="size-3.5" />} label={t("zoomTo", lang)} />
          <span className="my-2 w-px shrink-0 bg-line" aria-hidden />
          <CardAction
            onClick={copy}
            accent={copied ? "#10b981" : accent}
            icon={copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
            label={t(copied ? "copied" : "share", lang)}
          />
        </div>
        <p className="mt-2.5 text-center font-mono text-[10px] tracking-wider text-faint select-all">{entity.id}</p>
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
      {data && entity && (mobile ? <BottomSheet key={entity.id} data={data} entity={entity} lang={lang} /> : (
        <motion.article
          key={entity.id}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="glass scrollbar-thin pointer-events-auto min-h-0 overflow-y-auto rounded-3xl"
        >
          <CardBody data={data} entity={entity} lang={lang} />
        </motion.article>
      ))}
    </AnimatePresence>
  );
}

/** Phone layout: the card is a sheet that peeks from the bottom and drags up to full height. */
function BottomSheet({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const [full, setFull] = useState(false);
  const drag = useDragControls();
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y < -40 || info.velocity.y < -500) setFull(true);
    else if (info.offset.y > 60 || info.velocity.y > 500) {
      if (full) setFull(false);
      else select(null);
    }
  };
  return (
    <motion.article
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 340, damping: 34 }}
      drag="y"
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.08, bottom: 0.6 }}
      onDragEnd={onDragEnd}
      className={clsx(
        "glass pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] border-b-0 pb-[env(safe-area-inset-bottom)] transition-[height] duration-300 ease-out",
        full ? "h-[88dvh]" : "h-[46dvh]",
      )}
    >
      <div
        onPointerDown={(e) => drag.start(e)}
        onClick={() => setFull((f) => !f)}
        className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing"
        role="button"
        aria-label={t(full ? "collapse" : "expand", lang)}
      >
        <span className="h-1.5 w-11 rounded-full bg-faint/50" />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <CardBody data={data} entity={entity} lang={lang} />
      </div>
    </motion.article>
  );
}
