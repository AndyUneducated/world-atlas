import clsx from "clsx";
import { Grid3x3, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { effectiveStep, formatStep, GRATICULE_STEPS, viewOf, type GraticuleStep } from "../lib/graticule";
import { t } from "../lib/i18n";
import { useAtlas, useCursor } from "../store";

/** The grid's spacing chooser, shown on the map while the grid is on. */
export function GraticulePanel() {
  const step = useAtlas((s) => s.graticule);
  const setStep = useAtlas((s) => s.setGraticule);
  const map = useAtlas((s) => s.map);
  const lang = useAtlas((s) => s.lang);
  useCursor((s) => s.zoom); // re-render as the view changes, so the spacing shown stays current
  const drawn = step && map ? effectiveStep(step, viewOf(map)) : null;
  const coarsened = step !== null && step !== "auto" && drawn !== null && drawn !== step;
  const options: GraticuleStep[] = ["auto", ...GRATICULE_STEPS];

  return (
    <AnimatePresence>
      {step && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 480, damping: 34 }}
          className="glass pointer-events-auto flex max-w-[calc(100vw-24px)] flex-col gap-1.5 rounded-2xl p-2"
          role="group"
          aria-label={t("graticule", lang)}
        >
          <div className="flex items-center gap-2 pl-1">
            <Grid3x3 className="size-4 shrink-0 text-accent" />
            <span className="text-[12px] font-semibold text-ink">{t("graticule", lang)}</span>
            <span className="truncate text-[11px] text-muted tabular-nums">
              {drawn !== null && (coarsened ? t("graticuleCoarsened", lang).replace("{step}", formatStep(drawn)) : `${t("graticuleEvery", lang)} ${formatStep(drawn)}`)}
            </span>
            <button onClick={() => setStep(null)} className="ml-auto grid size-6 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink" aria-label={t("close", lang)}>
              <X className="size-3.5" />
            </button>
          </div>
          <div className="scrollbar-thin flex gap-0.5 overflow-x-auto rounded-xl bg-hover p-0.5" role="radiogroup">
            {options.map((o) => (
              <button
                key={o}
                role="radio"
                aria-checked={o === step}
                onClick={() => setStep(o)}
                className={clsx(
                  "shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-medium tabular-nums transition-colors",
                  o === step ? "bg-panel-solid text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {o === "auto" ? t("auto", lang) : formatStep(o)}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
