import clsx from "clsx";
import { displayName, formatNumber, t, type StringKey } from "../lib/i18n";
import { isRegistryCountry, islandStates, lineage } from "../lib/entity";
import type { AtlasData, Entity, Lang } from "../lib/types";

/** The indicators drawn as a line of text with a thin bar: each one's bar runs over a fixed scale. */
const SCALES = {
  life_expectancy: [40, 90],
  literacy: [0, 100],
  hdi: [0, 1],
  gini: [0, 100],
  unemployment: [0, 30],
  inflation: [0, 30],
} as const;
export type IndicatorKey = keyof typeof SCALES;

const LABELS: Record<IndicatorKey, StringKey> = {
  life_expectancy: "lifeExpectancy",
  literacy: "literacy",
  hdi: "hdi",
  gini: "gini",
  unemployment: "unemployment",
  inflation: "inflation",
};

/** UNDP's tiers of the human development index. */
const HDI_TIERS: [number, { zh: string; en: string }][] = [
  [0.8, { zh: "极高", en: "Very high" }],
  [0.7, { zh: "高", en: "High" }],
  [0.55, { zh: "中", en: "Medium" }],
  [0, { zh: "低", en: "Low" }],
];

type Figures = Partial<Record<IndicatorKey, number>>;

function figuresOf(e: Entity): Figures {
  const dm = e.demographics;
  const ec = e.economy;
  return { life_expectancy: dm?.life_expectancy, literacy: dm?.literacy, hdi: dm?.hdi, gini: ec?.gini, unemployment: ec?.unemployment, inflation: ec?.inflation };
}

/** What an entity's indicators are set against: the country it lies in, or for a state on Ranova the mean of
 * the island's states. China and the United States, and the states themselves, have nothing above them. */
export type Reference = { label: string; figures: Figures };

export function indicatorReference(data: AtlasData, e: Entity, lang: Lang): Reference | null {
  const top = lineage(data, e)[0];
  if (top && top.id !== e.id && top.subtype === "country") {
    const name = top.short_names?.[lang] ?? displayName(top, lang);
    return { label: lang === "zh" ? `${name}平均` : `${name} average`, figures: figuresOf(top) };
  }
  if (e.subtype === "country" && !isRegistryCountry(e)) {
    const states = islandStates(data);
    const figures: Figures = {};
    for (const k of Object.keys(SCALES) as IndicatorKey[]) {
      const values = states.map((s) => figuresOf(s)[k]).filter((v): v is number => v !== undefined);
      if (values.length) figures[k] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    return { label: lang === "zh" ? `拉诺瓦 ${states.length} 国平均` : `Mean of Ranova's ${states.length} states`, figures };
  }
  return null;
}

function format(k: IndicatorKey, v: number, lang: Lang) {
  if (k === "life_expectancy") return `${formatNumber(v, lang, 1)} ${lang === "zh" ? "岁" : "years"}`;
  if (k === "hdi") return formatNumber(v, lang, 3);
  if (k === "gini") return formatNumber(v, lang, 1);
  return `${formatNumber(v, lang, 1)}%`;
}

const share = (k: IndicatorKey, v: number) => {
  const [lo, hi] = SCALES[k];
  return Math.min(Math.max((v - lo) / (hi - lo), 0), 1) * 100;
};

/** Indicators as rows of text, each with a thin bar over its scale and a tick at the reference's figure. */
export function IndicatorRows({ entity, keys, reference, accent, lang, className }: { entity: Entity; keys: IndicatorKey[]; reference: Reference | null; accent: string; lang: Lang; className?: string }) {
  const own = figuresOf(entity);
  const shown = keys.filter((k) => own[k] !== undefined);
  if (!shown.length) return null;
  const ticked = shown.some((k) => reference?.figures[k] !== undefined);
  return (
    <div className={clsx("mb-3.5 last:mb-0", className)}>
      <dl className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-[13px]">
        {shown.map((k) => {
          const v = own[k]!;
          const ref = reference?.figures[k];
          const tier = k === "hdi" ? HDI_TIERS.find(([min]) => v >= min)![1][lang] : null;
          return (
            <div key={k} className="contents">
              <dt className="text-muted">{t(LABELS[k], lang)}</dt>
              <span className="relative h-[3px] min-w-8 rounded-full bg-hover" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${share(k, v)}%`, background: accent }} />
                {ref !== undefined && (
                  <span className="absolute -top-[3px] h-[9px] w-[1.5px] -translate-x-1/2 rounded-full bg-muted" style={{ left: `${share(k, ref)}%` }} title={`${reference!.label} ${format(k, ref, lang)}`} />
                )}
              </span>
              <dd className="text-right text-ink tabular-nums">
                {format(k, v, lang)}
                {tier && <span className="ml-1 text-[11px]" style={{ color: accent }}>{tier}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {ticked && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
          <span className="h-[9px] w-[1.5px] rounded-full bg-muted" />
          {reference!.label}
        </p>
      )}
    </div>
  );
}
