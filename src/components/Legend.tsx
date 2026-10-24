import { AnimatePresence, motion } from "motion/react";
import { t } from "../lib/i18n";
import { DENSITY_BREAKS } from "../lib/style";
import { THEMES } from "../lib/themes";
import { useAtlas } from "../store";

export function Legend() {
  const on = useAtlas((s) => s.layers.choropleth);
  const theme = useAtlas((s) => s.theme);
  const lang = useAtlas((s) => s.lang);
  const ramp = THEMES[theme].map.choropleth;
  return (
    <AnimatePresence>
      {on && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="glass pointer-events-auto w-64 rounded-2xl px-3.5 py-3"
        >
          <div className="mb-2 flex items-baseline justify-between text-[11px]">
            <span className="font-semibold text-ink">{t("choropleth", lang)}</span>
            <span className="text-faint">{t("perKm2", lang)}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full">
            {ramp.map((c) => (
              <span key={c} className="flex-1" style={{ background: c }} />
            ))}
          </div>
          <div className="mt-1 flex text-[10px] text-muted tabular-nums">
            <span className="flex-1" />
            {DENSITY_BREAKS.map((b) => (
              <span key={b} className="flex-1 -translate-x-1/2 text-left">
                {b >= 1000 ? `${b / 1000}k` : b}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
