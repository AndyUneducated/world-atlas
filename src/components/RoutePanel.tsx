import { ArrowUpDown, Navigation, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { displayName, formatNumber, t } from "../lib/i18n";
import type { Lang } from "../lib/types";
import { useRoute } from "../lib/useRoute";
import { useAtlas } from "../store";

export function formatDuration(minutes: number, lang: Lang) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} ${t("hour", lang)} ${m} ${t("minute", lang)}` : `${Math.max(m, 1)} ${t("minute", lang)}`;
}

function Endpoint({ label, id, dot }: { label: string; id: string | null; dot: string }) {
  const data = useAtlas((s) => s.data)!;
  const lang = useAtlas((s) => s.lang);
  const select = useAtlas((s) => s.select);
  const e = id ? data.entities[id] : undefined;
  return (
    <button onClick={() => e && select(e.id)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-hover">
      <span className={`size-2.5 shrink-0 rounded-full ring-2 ring-white/60 ${dot}`} />
      <span className="min-w-0">
        <span className="block text-[10.5px] text-faint">{label}</span>
        <span className={`block truncate text-[13.5px] ${e ? "font-medium text-ink" : "text-muted"}`}>{e ? displayName(e, lang) : "—"}</span>
      </span>
    </button>
  );
}

export function RoutePanel() {
  const data = useAtlas((s) => s.data);
  const lang = useAtlas((s) => s.lang);
  const { from, to } = useAtlas((s) => s.route);
  const setRoute = useAtlas((s) => s.setRoute);
  const select = useAtlas((s) => s.select);
  const result = useRoute();
  const open = !!(from || to);

  return (
    <AnimatePresence>
      {data && open && (
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="glass pointer-events-auto shrink-0 rounded-2xl p-2"
        >
          <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
            <Navigation className="size-3.5 text-accent" />
            <span className="flex-1 text-[11px] font-semibold tracking-wider text-faint uppercase">{t("directions", lang)}</span>
            <button
              onClick={() => setRoute({ from: to, to: from })}
              className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover"
              title={t("swap", lang)}
              aria-label={t("swap", lang)}
            >
              <ArrowUpDown className="size-3.5" />
            </button>
            <button onClick={() => setRoute({ from: null, to: null })} className="grid size-7 place-items-center rounded-full text-muted hover:bg-hover" aria-label={t("close", lang)}>
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex flex-col">
            <Endpoint label={t("origin", lang)} id={from} dot="bg-emerald-500" />
            <Endpoint label={t("destination", lang)} id={to} dot="bg-rose-500" />
          </div>
          <div className="mt-1.5 border-t border-line px-2 pt-2.5 pb-1">
            {!(from && to) && <p className="text-[12px] text-muted">{t("pickOnCard", lang)}</p>}
            {from && to && !result && <p className="text-[12px] text-muted">{t("noRoute", lang)}</p>}
            {result && (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-[20px] font-semibold tracking-tight text-ink tabular-nums">{formatDuration(result.minutes, lang)}</span>
                  <span className="text-[13px] text-muted tabular-nums">{formatNumber(result.km, lang, 1)} km</span>
                  <span className="ml-auto text-[11px] text-faint">{t("fastest", lang)}</span>
                </div>
                <ol className="mt-2 space-y-0.5">
                  {result.steps.map((s, i) => {
                    const road = data.entities[s.roadId];
                    return (
                      <li key={`${s.roadId}-${i}`}>
                        <button onClick={() => select(s.roadId)} className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[12.5px] hover:bg-hover">
                          <span className="min-w-14 rounded-md border border-line px-1.5 py-px text-center text-[10.5px] font-semibold text-muted">{road?.ref}</span>
                          <span className="flex-1 truncate text-ink">{road ? displayName(road, lang) : ""}</span>
                          <span className="text-[11.5px] text-faint tabular-nums">{formatNumber(s.km, lang, 1)} km</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
