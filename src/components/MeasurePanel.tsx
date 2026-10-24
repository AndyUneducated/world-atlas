import { Eraser, Ruler, Undo2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { t } from "../lib/i18n";
import { formatKm, pathKm } from "../lib/measure";
import { useAtlas } from "../store";

const ICON_BTN = "grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35";

export function MeasurePanel() {
  const points = useAtlas((s) => s.measure);
  const setMeasure = useAtlas((s) => s.setMeasure);
  const lang = useAtlas((s) => s.lang);

  useEffect(() => {
    if (!points) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Escape") setMeasure(null);
      if (e.key === "Backspace" || ((e.ctrlKey || e.metaKey) && e.key === "z")) {
        e.preventDefault();
        setMeasure(points.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [points, setMeasure]);

  const km = points ? pathKm(points) : 0;
  const hint = !points?.length ? t("measureStart", lang) : t("measureNext", lang);

  return (
    <AnimatePresence>
      {points && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 480, damping: 34 }}
          className="glass pointer-events-auto flex items-center gap-3 rounded-2xl py-2 pr-2 pl-3"
          role="status"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Ruler className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-wider text-faint uppercase">{t("totalDistance", lang)}</div>
            <div className="flex items-baseline gap-2">
              <motion.span key={Math.round(km * 100)} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="text-[18px] leading-tight font-semibold tracking-tight text-ink tabular-nums">
                {formatKm(km)}
              </motion.span>
              <span className="truncate text-[11.5px] text-muted max-sm:hidden">{hint}</span>
            </div>
          </div>
          <div className="ml-1 flex items-center gap-0.5 border-l border-line pl-2">
            <button className={ICON_BTN} onClick={() => setMeasure(points.slice(0, -1))} disabled={!points.length} title={`${t("undo", lang)} (Backspace)`} aria-label={t("undo", lang)}>
              <Undo2 className="size-4" />
            </button>
            <button className={ICON_BTN} onClick={() => setMeasure([])} disabled={!points.length} title={t("clear", lang)} aria-label={t("clear", lang)}>
              <Eraser className="size-4" />
            </button>
            <button onClick={() => setMeasure(null)} className="ml-1 h-8 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-on-accent shadow-sm hover:opacity-90" title="Esc">
              {t("done", lang)}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
