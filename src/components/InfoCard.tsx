import clsx from "clsx";
import { Check, ChevronRight, Crosshair, Link2, Star, X } from "lucide-react";
import { AnimatePresence, motion, useDragControls, useSpring, type PanInfo } from "motion/react";
import { useState } from "react";
import { CityEmblem, Emblem, hasEmblem } from "./Emblem";
import { RouteTimeline } from "./RouteTimeline";
import { cardPadding, useMobile } from "../lib/viewport";
import { accentColor, lineage } from "../lib/entity";
import { displayName, formatNumber, formatPopulation, formatUsd, kindLabel, NAME_LANG_LABELS, t } from "../lib/i18n";
import { hasShield } from "../lib/shields";
import { RouteShield } from "./RouteShield";
import { NAME_LANGS, type AtlasData, type Entity, type Lang, type NameLang } from "../lib/types";

const NAME_TAGS: Record<NameLang, Record<Lang, string>> = {
  zh: { zh: "中", en: "ZH" },
  en: { zh: "英", en: "EN" },
  "art-x-viking": { zh: "维", en: "VIK" },
  "art-x-buckham": { zh: "巴", en: "BCK" },
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

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl bg-hover px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-[17px] font-semibold tracking-tight text-ink tabular-nums">{value}</span>
        {unit && <span className="text-[11px] text-faint">{unit}</span>}
      </div>
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

function stats(e: Entity, lang: Lang) {
  const out: { label: string; value: string; unit?: string }[] = [];
  if (e.population) out.push({ label: t("population", lang), value: formatPopulation(e.population, lang) });
  if (e.area_km2) out.push({ label: t("area", lang), value: formatNumber(e.area_km2, lang), unit: "km²" });
  else if (e.stats?.area_km2_mapped) out.push({ label: t("area", lang), value: formatNumber(e.stats.area_km2_mapped, lang, 1), unit: "km²" });
  if (e.stats?.density_per_km2) out.push({ label: t("density", lang), value: formatNumber(e.stats.density_per_km2, lang, e.stats.density_per_km2 < 10 ? 1 : 0), unit: t("perKm2", lang) });
  if (e.stats?.length_km) out.push({ label: t("length", lang), value: formatNumber(e.stats.length_km, lang, 1), unit: "km" });
  if (e.stats?.bridge_km) out.push({ label: t("seaBridge", lang), value: formatNumber(e.stats.bridge_km, lang, 1), unit: "km" });
  if (e.stats?.elevation_m) out.push({ label: t("elevation", lang), value: formatNumber(e.stats.elevation_m, lang), unit: "m" });
  if (e.stats?.prominence_m) out.push({ label: t("prominence", lang), value: formatNumber(e.stats.prominence_m, lang), unit: "m" });
  if (e.stats?.width_km) out.push({ label: t("width", lang), value: formatNumber(e.stats.width_km, lang, 1), unit: "km" });
  if (e.stats?.drainage_km2) out.push({ label: t("drainage", lang), value: formatNumber(e.stats.drainage_km2, lang), unit: "km²" });
  if (e.stats?.elev_max_m) out.push({ label: t("maxElevation", lang), value: formatNumber(e.stats.elev_max_m, lang), unit: "m" });
  if (e.tech?.operating_speed_kmh) out.push({ label: t("operatingSpeed", lang), value: String(e.tech.operating_speed_kmh), unit: "km/h" });
  if (e.speed?.limits.length) out.push(speedStat(e.speed, lang));
  return out.slice(0, 4);
}

function speedStat(speed: NonNullable<Entity["speed"]>, lang: Lang) {
  const nums = speed.limits.filter((v): v is number => v !== null);
  const label = t("speedLimit", lang);
  const tagged = (tag: string, v: number) => (lang === "zh" ? `${tag} ${v}` : `${v} ${tag}`);
  if (speed.limits.includes(null)) {
    const unit = nums.length ? tagged(t("inPlaces", lang), Math.min(...nums)) : speed.advisory ? tagged(t("advisory", lang), speed.advisory) : undefined;
    return { label, value: t("noLimit", lang), unit };
  }
  const [lo, hi] = [Math.min(...nums), Math.max(...nums)];
  return { label, value: lo === hi ? String(lo) : `${lo}–${hi}`, unit: "km/h" };
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

function EngineeringSection({ entity, lang }: { entity: Entity; lang: Lang }) {
  const eng = entity.engineering;
  if (!eng) return null;
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
  const structures = pct(eng.bridge_km + eng.tunnel_km, eng.length_km);
  return (
    <Section title={t("engineeringTitle", lang)}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-hover">
          <span className="h-full bg-sky-500" style={{ width: `${pct(eng.bridge_km, eng.length_km)}%` }} />
          <span className="h-full bg-stone-500" style={{ width: `${pct(eng.tunnel_km, eng.length_km)}%` }} />
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
  return (
    <Section title={t("techTitle", lang)}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
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
  const isLine = entity.network === "intercity_rail" || entity.network === "metro";
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
              {hasShield(entity) && <RouteShield entity={entity} height={20} className="-my-0.5" />}
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
        <div className="relative mt-4 flex flex-wrap gap-2">
          <button onClick={zoomTo} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent shadow-sm hover:opacity-90">
            <Crosshair className="size-3.5" />
            {t("zoomTo", lang)}
          </button>
          {routable && (
            <>
              <button onClick={() => setRoute({ from: entity.id })} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-hover">
                <span className="size-2 rounded-full bg-emerald-500" />
                {t("routeFrom", lang)}
              </button>
              <button onClick={() => setRoute({ to: entity.id })} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-hover">
                <span className="size-2 rounded-full bg-rose-500" />
                {t("routeTo", lang)}
              </button>
            </>
          )}
          <button onClick={copy} className="grid size-[30px] place-items-center rounded-full border border-line text-ink hover:bg-hover" title={t(copied ? "copied" : "share", lang)} aria-label={t("share", lang)}>
            {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-2 px-5 pb-4">
          {items.map((s) => (
            <Stat key={s.label} {...s} />
          ))}
        </div>
      )}

      {(entity.notes || entity.motto) && (
        <Section title={t("about", lang)}>
          {entity.notes && <p className="text-[13.5px] leading-relaxed text-ink">{entity.notes[lang]}</p>}
          {entity.motto && (
            <p className="mt-2 text-[13px] text-muted">
              {t("motto", lang)} · <span className="italic">{entity.motto[lang]}</span>
            </p>
          )}
        </Section>
      )}

      {entity.segments?.length ? <RouteTimeline data={data} entity={entity} lang={lang} /> : <ChildList data={data} entity={entity} lang={lang} />}

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

      <div className="border-t border-line px-5 py-3 font-mono text-[10.5px] text-faint">{entity.id}</div>
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
