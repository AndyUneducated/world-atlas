import clsx from "clsx";
import { Layers, Maximize, Minus, Navigation2, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { t, type StringKey } from "../lib/i18n";
import { useAtlas, useCursor, type LayerToggles } from "../store";

const BTN = "grid size-10 place-items-center text-ink transition-colors hover:bg-hover active:scale-95";
const LAYER_KEYS: (keyof LayerToggles)[] = ["boundaries", "roads", "hillshade", "choropleth"];

function Switch({ on }: { on: boolean }) {
  return (
    <span className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-accent" : "bg-hover ring-1 ring-line")}>
      <motion.span layout transition={{ type: "spring", stiffness: 600, damping: 34 }} className={clsx("absolute top-0.5 size-4 rounded-full bg-white shadow", on ? "right-0.5" : "left-0.5")} />
    </span>
  );
}

export function MapControls() {
  const map = useAtlas((s) => s.map);
  const lang = useAtlas((s) => s.lang);
  const data = useAtlas((s) => s.data);
  const layers = useAtlas((s) => s.layers);
  const toggleLayer = useAtlas((s) => s.toggleLayer);
  const bearing = useCursor((s) => s.bearing);
  const [open, setOpen] = useState(false);

  const home = () => {
    if (map && data) map.fitBounds(data.manifest.regions[0].bounds, { padding: 80, bearing: 0, duration: 1200 });
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
              className="glass absolute top-0 right-12 w-56 rounded-2xl p-1.5"
            >
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">{t("layers", lang)}</p>
              {LAYER_KEYS.map((k) => (
                <button key={k} onClick={() => toggleLayer(k)} className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-[13px] text-ink hover:bg-hover">
                  {t(k as StringKey, lang)}
                  <Switch on={layers[k]} />
                </button>
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

      <button className={clsx("glass rounded-xl", BTN)} onClick={() => map?.easeTo({ bearing: 0, duration: 500 })} aria-label={t("resetNorth", lang)} title={t("resetNorth", lang)}>
        <Navigation2 className="size-[18px] fill-accent text-accent transition-transform" style={{ transform: `rotate(${-bearing}deg)` }} />
      </button>

      <button className={clsx("glass rounded-xl", BTN)} onClick={home} aria-label={t("home", lang)} title={t("home", lang)}>
        <Maximize className="size-[17px]" />
      </button>
    </div>
  );
}
