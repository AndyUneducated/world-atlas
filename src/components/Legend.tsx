import { AnimatePresence, motion } from "motion/react";
import { t, type StringKey } from "../lib/i18n";
import { DENSITY_BREAKS } from "../lib/style";
import { BUILDING_CLASSES, LANDCOVER_CLASSES, THEMES, type MapTheme } from "../lib/themes";
import type { Lang } from "../lib/types";
import { useAtlas, type LayerToggles } from "../store";

function Heading({ children, unit }: { children: React.ReactNode; unit?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between text-[10.5px] font-semibold tracking-wider text-faint uppercase">
      <span>{children}</span>
      {unit && <span className="font-normal tracking-normal normal-case">{unit}</span>}
    </div>
  );
}

function Row({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-2.5 text-[12px] text-ink">
      <span className="flex w-7 shrink-0 justify-center">{swatch}</span>
      <span className="truncate">{label}</span>
    </li>
  );
}

function LineSwatch({ color, casing, width = 3, dash }: { color: string; casing?: string; width?: number; dash?: string }) {
  return (
    <svg width="28" height="10" aria-hidden>
      {casing && <line x1="2" y1="5" x2="26" y2="5" stroke={casing} strokeWidth={width + 2} strokeLinecap="round" />}
      <line x1="2" y1="5" x2="26" y2="5" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} />
    </svg>
  );
}

function Shield({ fill, stroke, text, label }: { fill: string; stroke: string; text: string; label: string }) {
  return (
    <span className="rounded-[4px] px-1 text-[9px] leading-[14px] font-semibold" style={{ background: fill, color: text, boxShadow: `inset 0 0 0 1.2px ${stroke}` }}>
      {label}
    </span>
  );
}

function Ramp({ colors, ticks }: { colors: string[]; ticks: string[] }) {
  return (
    <>
      <div className="flex h-2 overflow-hidden rounded-full ring-1 ring-line">
        {colors.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <div className="mt-1 flex text-[10px] text-muted tabular-nums">
        <span className="flex-1" />
        {ticks.map((b) => (
          <span key={b} className="flex-1 -translate-x-1/2 text-left">
            {b}
          </span>
        ))}
      </div>
    </>
  );
}

function ElevationRamp({ relief }: { relief: [number, string][] }) {
  const max = relief[relief.length - 1][0];
  const gradient = relief.map(([e, c]) => `${c} ${(100 * e) / max}%`).join(", ");
  return (
    <>
      <div className="h-2 rounded-full ring-1 ring-line" style={{ background: `linear-gradient(90deg, ${gradient})` }} />
      <div className="relative mt-1 h-3 text-[10px] text-muted tabular-nums">
        {[0, 1000, 2000].map((e) => (
          <span key={e} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${(100 * e) / max}%` }}>
            {e}
          </span>
        ))}
      </div>
    </>
  );
}

const ROADS: { key: keyof LayerToggles; style: (m: MapTheme) => { fill: string; casing: string }; shield?: (m: MapTheme) => MapTheme["shield"]["national"]; ref?: string }[] = [
  { key: "nationalExpressway", style: (m) => m.nationalExpressway, shield: (m) => m.shield.national, ref: "G" },
  { key: "territorialExpressway", style: (m) => m.territorialExpressway, shield: (m) => m.shield.territorial, ref: "S" },
  { key: "cityRoads", style: (m) => m.cityRoad },
];

function LegendBody({ m, layers, lang }: { m: MapTheme; layers: LayerToggles; lang: Lang }) {
  const roads = ROADS.filter((r) => layers[r.key]);
  return (
    <div className="space-y-2.5">
      {roads.length > 0 && (
        <section>
          <Heading>{t("roads", lang)}</Heading>
          <ul className="space-y-1">
            {roads.map((r) => {
              const s = r.style(m);
              const sh = r.shield?.(m);
              return (
                <Row
                  key={r.key}
                  label={t(r.key as StringKey, lang)}
                  swatch={sh ? <Shield {...sh} text={sh.text} label={r.ref!} /> : <LineSwatch color={s.fill} casing={s.casing} width={2.5} />}
                />
              );
            })}
          </ul>
        </section>
      )}
      {(layers.railways || layers.metro) && (
        <section>
          <Heading>{t("transit", lang)}</Heading>
          <ul className="space-y-1">
            {layers.railways && (
              <Row
                label={t("railways", lang)}
                swatch={
                  <svg width="28" height="10" aria-hidden>
                    <line x1="2" y1="5" x2="26" y2="5" stroke={m.rail.casing} strokeWidth={4} />
                    <line x1="2" y1="5" x2="26" y2="5" stroke={m.rail.fill} strokeWidth={1.8} strokeDasharray="4 4" />
                  </svg>
                }
              />
            )}
            {layers.metro && <Row label={t("metro", lang)} swatch={<LineSwatch color="#E4453A" casing={m.rail.metroCasing} width={2.5} />} />}
            {layers.railways && <Row label={t("railStation", lang)} swatch={<span className="size-2.5 rounded-full" style={{ background: m.rail.station, boxShadow: `0 0 0 2px ${m.rail.stationStroke}` }} />} />}
            {layers.metro && <Row label={t("metroStation", lang)} swatch={<span className="size-2 rounded-full" style={{ background: m.rail.station, boxShadow: "0 0 0 1.8px #E4453A" }} />} />}
            {layers.metro && <Row label={t("transferStation", lang)} swatch={<span className="size-2.5 rounded-full" style={{ background: m.rail.station, boxShadow: `0 0 0 2px ${m.rail.stationStroke}` }} />} />}
          </ul>
        </section>
      )}
      <section>
        <Heading>{t("places", lang)}</Heading>
        <ul className="space-y-1">
          <Row label={t("capital", lang)} swatch={<span className="size-2.5 rounded-full" style={{ background: m.cityDot.capital, boxShadow: `0 0 0 1.5px ${m.cityDot.fill}` }} />} />
          <Row label={t("city", lang)} swatch={<span className="size-2.5 rounded-full" style={{ background: m.cityDot.fill, boxShadow: `0 0 0 1.5px ${m.cityDot.stroke}` }} />} />
          {layers.boundaries && <Row label={t("boundaryCity", lang)} swatch={<LineSwatch color={m.cityLine.color} width={1.4} />} />}
          {layers.boundaries && <Row label={t("boundaryDistrict", lang)} swatch={<LineSwatch color={m.districtLine.color} width={1.2} dash="3 2" />} />}
        </ul>
      </section>
      {layers.landcover && (
        <section>
          <Heading>{t("landcover", lang)}</Heading>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
            {LANDCOVER_CLASSES.map((c) => (
              <li key={c} className="flex items-center gap-1.5 truncate text-[11.5px] text-ink">
                <span className="size-2.5 shrink-0 rounded-[3px] ring-1 ring-line" style={{ background: m.landcover.colors[c] }} />
                {t(`lc_${c}` as StringKey, lang)}
              </li>
            ))}
            <li className="flex items-center gap-1.5 truncate text-[11.5px] text-ink">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: m.glacier.fill, boxShadow: `inset 0 0 0 1px ${m.glacier.line}` }} />
              {t("lc_glacier", lang)}
            </li>
            <li className="flex items-center gap-1.5 truncate text-[11.5px] text-ink">
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="shrink-0">
                <path d="M5 1 L9.4 9 H0.6 Z" fill={m.peak} />
                <path d="M5 1 L6.3 3.4 H3.7 Z" fill="#fff" />
              </svg>
              {t("peak", lang)}
            </li>
          </ul>
        </section>
      )}
      {layers.buildings && (
        <section>
          <Heading>{t("buildings", lang)}</Heading>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
            {[
              ...BUILDING_CLASSES.map((c) => ({ key: `bc_${c}`, fill: m.building.fill[c], line: m.building.outline })),
              { key: "bc_landmark", fill: m.building.landmark.fill, line: m.building.landmark.outline },
              { key: "bc_park", fill: m.building.park, line: m.building.park },
              { key: "fc_runway", fill: m.building.facility.runway, line: m.building.facility.runway },
              { key: "fc_paved", fill: m.building.facility.paved, line: m.building.facility.runway },
            ].map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 truncate text-[11.5px] text-ink">
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: s.fill, boxShadow: `inset 0 0 0 1px ${s.line}` }} />
                {t(s.key as StringKey, lang)}
              </li>
            ))}
          </ul>
        </section>
      )}
      {layers.terrain && (
        <section>
          <Heading unit="m">{t("elevation", lang)}</Heading>
          <ElevationRamp relief={m.terrain.relief} />
        </section>
      )}
      {layers.choropleth && (
        <section>
          <Heading unit={t("perKm2", lang)}>{t("choropleth", lang)}</Heading>
          <Ramp colors={m.choropleth} ticks={DENSITY_BREAKS.map((b) => (b >= 1000 ? `${b / 1000}k` : String(b)))} />
        </section>
      )}
    </div>
  );
}

export function Legend() {
  const on = useAtlas((s) => s.display.legend);
  const layers = useAtlas((s) => s.layers);
  const theme = useAtlas((s) => s.theme);
  const lang = useAtlas((s) => s.lang);
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="glass pointer-events-auto w-52 rounded-2xl px-3.5 py-3 max-md:hidden"
          aria-label={t("legend", lang)}
        >
          <LegendBody m={THEMES[theme].map} layers={layers} lang={lang} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
