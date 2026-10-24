import clsx from "clsx";
import { Layers, Maximize, Minus, Mountain, Navigation2, Plus, Ruler } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { t, type StringKey } from "../lib/i18n";
import { THEMES, type MapTheme } from "../lib/themes";
import { homePadding } from "../lib/viewport";
import { useAtlas, useCursor, type LayerToggles } from "../store";
import { Switch } from "./Switch";

const BTN = "grid size-10 place-items-center text-ink transition-colors hover:bg-hover active:scale-95";
const LAYER_GROUPS: { title: StringKey; keys: (keyof LayerToggles)[] }[] = [
  { title: "roads", keys: ["nationalExpressway", "territorialExpressway", "cityRoads"] },
  { title: "mapDetails", keys: ["landcover", "boundaries", "choropleth"] },
];
const ROAD_SWATCH: Partial<Record<keyof LayerToggles, (m: MapTheme) => string>> = {
  nationalExpressway: (m) => m.nationalExpressway.fill,
  territorialExpressway: (m) => m.territorialExpressway.fill,
  cityRoads: (m) => (m.cityRoad.fill === "#ffffff" ? m.cityRoad.casing : m.cityRoad.fill),
};

export function MapControls() {
  const map = useAtlas((s) => s.map);
  const lang = useAtlas((s) => s.lang);
  const data = useAtlas((s) => s.data);
  const layers = useAtlas((s) => s.layers);
  const toggleLayer = useAtlas((s) => s.toggleLayer);
  const mapTheme = THEMES[useAtlas((s) => s.theme)].map;
  const bearing = useCursor((s) => s.bearing);
  const measuring = useAtlas((s) => s.measure !== null);
  const setMeasure = useAtlas((s) => s.setMeasure);
  const [open, setOpen] = useState(false);

  const home = () => {
    if (map && data) map.fitBounds(data.manifest.regions[0].bounds, { padding: homePadding(), bearing: 0, duration: 1200 });
  };

  return (
    <div className="pointer-events-auto relative flex flex-col items-end gap-2">
      <div className="relative">
        <button onClick={() => setOpen((o) => !o)} className={clsx("glass grid size-10 place-items-center rounded-xl text-ink", open && "text-accent")} aria-label={t("layers", lang)} title={t("layers", lang)}>
          <Layers className="size-[18px]" />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, x: 8, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="glass absolute top-0 right-12 w-60 rounded-2xl p-1.5"
            >
              <button
                onClick={() => toggleLayer("terrain")}
                className={clsx("flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors", layers.terrain ? "bg-accent-soft ring-1 ring-accent/40" : "hover:bg-hover")}
                aria-pressed={layers.terrain}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#cfe3c4] via-[#e6d5ac] to-[#c9b29c] text-[#5c4a37] shadow-inner">
                  <Mountain className="size-5" strokeWidth={1.8} />
                </span>
                <span className="flex-1 text-[13px] font-medium text-ink">{t("terrain", lang)}</span>
                <Switch on={layers.terrain} />
              </button>
              {LAYER_GROUPS.map((group) => (
                <div key={group.title} className="mt-1.5">
                  <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">{t(group.title, lang)}</p>
                  {group.keys.map((k) => (
                    <button key={k} onClick={() => toggleLayer(k)} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-ink hover:bg-hover" aria-pressed={layers[k]}>
                      {ROAD_SWATCH[k] && <span className="h-1.5 w-4 shrink-0 rounded-full" style={{ background: ROAD_SWATCH[k](mapTheme) }} />}
                      <span className="flex-1 text-left">{t(k as StringKey, lang)}</span>
                      <Switch on={layers[k]} />
                    </button>
                  ))}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="glass flex flex-col overflow-hidden rounded-xl">
        <button className={BTN} onClick={() => map?.zoomIn()} aria-label={t("zoomIn", lang)} title={t("zoomIn", lang)}>
          <Plus className="size-[18px]" />
        </button>
        <div className="mx-2 h-px bg-line" />
        <button className={BTN} onClick={() => map?.zoomOut()} aria-label={t("zoomOut", lang)} title={t("zoomOut", lang)}>
          <Minus className="size-[18px]" />
        </button>
      </div>

      <button
        className={clsx("glass rounded-xl", BTN, measuring && "text-accent ring-1 ring-accent/50")}
        onClick={() => setMeasure(measuring ? null : [])}
        aria-pressed={measuring}
        aria-label={t("measure", lang)}
        title={t("measure", lang)}
      >
        <Ruler className="size-[18px]" />
      </button>

      <button className={clsx("glass rounded-xl", BTN)} onClick={() => map?.easeTo({ bearing: 0, duration: 500 })} aria-label={t("resetNorth", lang)} title={t("resetNorth", lang)}>
        <Navigation2 className="size-[18px] fill-accent text-accent transition-transform" style={{ transform: `rotate(${-bearing}deg)` }} />
      </button>

      <button className={clsx("glass rounded-xl", BTN)} onClick={home} aria-label={t("home", lang)} title={t("home", lang)}>
        <Maximize className="size-[17px]" />
      </button>
    </div>
  );
}
