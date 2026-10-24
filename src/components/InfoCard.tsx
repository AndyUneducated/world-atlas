import clsx from "clsx";
import { Check, Crosshair, Link2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { accentColor } from "../lib/entity";
import { displayName, formatNumber, formatPopulation, kindLabel, NAME_LANG_LABELS, otherName, t } from "../lib/i18n";
import { NAME_LANGS, type AtlasData, type Entity, type Lang } from "../lib/types";
import { useAtlas } from "../store";
import { EntityIcon } from "./EntityIcon";

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
  if (e.stats?.density_per_km2) out.push({ label: t("density", lang), value: formatNumber(e.stats.density_per_km2, lang), unit: t("perKm2", lang) });
  if (e.stats?.length_km) out.push({ label: t("length", lang), value: formatNumber(e.stats.length_km, lang, 1), unit: "km" });
  if (e.stats?.drainage_km2) out.push({ label: t("drainage", lang), value: formatNumber(e.stats.drainage_km2, lang), unit: "km²" });
  if (e.stats?.elev_max_m) out.push({ label: t("maxElevation", lang), value: formatNumber(e.stats.elev_max_m, lang), unit: "m" });
  return out.slice(0, 4);
}

function codes(e: Entity, lang: Lang) {
  const c = e.codes ?? {};
  const out: [string, string][] = [];
  if (c.admin) out.push([t("adminCode", lang), c.admin]);
  if (c.iso3166_2) out.push(["ISO 3166-2", c.iso3166_2]);
  if (c.iso3166_1) out.push(["ISO 3166-1", `${c.iso3166_1.alpha2} · ${c.iso3166_1.alpha3} · ${c.iso3166_1.numeric}`]);
  if (c.unlocode) out.push(["UN/LOCODE", c.unlocode]);
  if (e.ref) out.push([lang === "zh" ? "路线编号" : "Route number", e.ref]);
  return out;
}

function ChildList({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const ids = entity.kind === "route" ? (entity.via ?? []) : (entity.children ?? []);
  const kids = ids.map((id) => data.entities[id]).filter((k): k is Entity => !!k?.bbox);
  if (!kids.length) return null;
  const max = Math.max(...kids.map((k) => k.population ?? 0), 1);
  return (
    <Section title={entity.kind === "route" ? t("passesThrough", lang) : `${t("subdivisions", lang)} · ${kids.length}`}>
      <ul className="-mx-2 space-y-0.5">
        {kids.map((k) => {
          const accent = accentColor(data, k) ?? "var(--ui-accent)";
          return (
            <li key={k.id}>
              <button onClick={() => select(k.id)} className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-hover">
                <div className="flex items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
                  <span className="flex-1 truncate text-[13px] text-ink">{displayName(k, lang)}</span>
                  {k.population ? <span className="text-[12px] text-muted tabular-nums">{formatPopulation(k.population, lang)}</span> : null}
                </div>
                {entity.kind !== "route" && k.population ? (
                  <div className="mt-1 ml-4 h-1 overflow-hidden rounded-full bg-hover">
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

function CardBody({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const select = useAtlas((s) => s.select);
  const map = useAtlas((s) => s.map);
  const setRoute = useAtlas((s) => s.setRoute);
  const routable = data.graph.places[entity.id] !== undefined;
  const [copied, setCopied] = useState(false);
  const accent = accentColor(data, entity) ?? "var(--ui-accent)";
  const statusKey = entity.status === "canon" ? "canon" : entity.status === "draft" ? "draft" : "generated";
  const items = stats(entity, lang);
  const codeRows = codes(entity, lang);
  const names = NAME_LANGS.filter((l) => entity.names[l]);

  const copy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const zoomTo = () => {
    if (map && entity.bbox) map.fitBounds(entity.bbox, { padding: { left: 460, top: 90, right: 100, bottom: 90 }, duration: 900 });
  };

  return (
    <>
      <div className="relative px-5 pt-5 pb-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-[0.16]" style={{ background: `linear-gradient(180deg, ${accent}, transparent)` }} />
        <div className="relative flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-sm" style={{ background: accent }}>
            <EntityIcon entity={entity} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted">
              <span className="uppercase">{kindLabel(entity, lang)}</span>
              <span
                title={t(statusKey === "canon" ? "canonHint" : "generatedHint", lang)}
                className={clsx(
                  "rounded-full px-1.5 py-px text-[10px] font-semibold",
                  statusKey === "canon" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600",
                )}
              >
                {t(statusKey, lang)}
              </span>
            </div>
            <h2 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight text-ink">{displayName(entity, lang)}</h2>
            <p className="truncate text-[13px] text-muted">{otherName(entity, lang)}</p>
          </div>
          <button onClick={() => select(null)} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-hover" aria-label={t("close", lang)}>
            <X className="size-4" />
          </button>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <button onClick={zoomTo} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-medium text-white shadow-sm hover:opacity-90">
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

      <Section title={t("names", lang)}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {names.map((l) => (
            <div key={l} className="contents">
              <dt className="text-muted">{NAME_LANG_LABELS[l][lang]}</dt>
              <dd className="text-ink">{entity.names[l]}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <ChildList data={data} entity={entity} lang={lang} />

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

      <div className="border-t border-line px-5 py-3 font-mono text-[10.5px] text-faint">
        {entity.id}
        {entity.source ? ` · ${entity.source}` : ""}
      </div>
    </>
  );
}

export function InfoCard() {
  const data = useAtlas((s) => s.data);
  const lang = useAtlas((s) => s.lang);
  const selectedId = useAtlas((s) => s.selectedId);
  const entity = selectedId && data ? data.entities[selectedId] : undefined;

  return (
    <AnimatePresence mode="wait">
      {data && entity && (
        <motion.article
          key={entity.id}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="glass scrollbar-thin pointer-events-auto min-h-0 overflow-y-auto rounded-3xl max-md:fixed max-md:inset-x-2 max-md:bottom-2 max-md:max-h-[52vh]"
        >
          <CardBody data={data} entity={entity} lang={lang} />
        </motion.article>
      )}
    </AnimatePresence>
  );
}
