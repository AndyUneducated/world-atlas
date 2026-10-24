import clsx from "clsx";
import { Minus, Navigation2, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { t } from "../lib/i18n";
import { useAtlas, useCursor } from "../store";

const BTN = "grid size-10 place-items-center text-ink transition-colors hover:bg-hover active:scale-95";
const POP = { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.8 }, transition: { duration: 0.15 } };

/** Optional zoom buttons, and a compass that only appears once the map has been rotated. */
export function MapControls() {
  const map = useAtlas((s) => s.map);
  const lang = useAtlas((s) => s.lang);
  const zoomButtons = useAtlas((s) => s.display.zoomButtons);
  const bearing = useCursor((s) => s.bearing);
  const rotated = Math.abs(bearing) > 0.5;

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2">
      <AnimatePresence>
        {rotated && (
          <motion.button key="north" {...POP} className={clsx("glass rounded-xl", BTN)} onClick={() => map?.easeTo({ bearing: 0, pitch: 0, duration: 500 })} aria-label={t("resetNorth", lang)} title={t("resetNorth", lang)}>
            <Navigation2 className="size-[18px] fill-accent text-accent" style={{ transform: `rotate(${-bearing}deg)` }} />
          </motion.button>
        )}
        {zoomButtons && (
          <motion.div key="zoom" {...POP} className="glass flex flex-col overflow-hidden rounded-xl">
            <button className={BTN} onClick={() => map?.zoomIn()} aria-label={t("zoomIn", lang)} title={t("zoomIn", lang)}>
              <Plus className="size-[18px]" />
            </button>
            <div className="mx-2 h-px bg-line" />
            <button className={BTN} onClick={() => map?.zoomOut()} aria-label={t("zoomOut", lang)} title={t("zoomOut", lang)}>
              <Minus className="size-[18px]" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
