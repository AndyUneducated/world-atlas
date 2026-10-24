import clsx from "clsx";
import { Monitor, Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { t, type StringKey } from "../lib/i18n";
import type { Appearance } from "../lib/types";
import { useAtlas } from "../store";

const APPEARANCES: { id: Appearance; icon: typeof Sun; label: StringKey }[] = [
  { id: "auto", icon: Monitor, label: "appearanceAuto" },
  { id: "light", icon: Sun, label: "appearanceLight" },
  { id: "dark", icon: Moon, label: "appearanceDark" },
];

export function AppearanceSwitcher() {
  const appearance = useAtlas((s) => s.appearance);
  const lang = useAtlas((s) => s.lang);
  const setAppearance = useAtlas((s) => s.setAppearance);
  return (
    <div role="radiogroup" aria-label={t("appearance", lang)} className="glass pointer-events-auto flex gap-0.5 rounded-2xl p-1">
      {APPEARANCES.map(({ id, icon: Icon, label }) => {
        const active = id === appearance;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            onClick={() => setAppearance(id)}
            title={t(label, lang)}
            aria-label={t(label, lang)}
            className={clsx("relative grid h-7 w-8 place-items-center rounded-xl transition-colors", active ? "text-ink" : "text-muted hover:text-ink")}
          >
            {active && <motion.span layoutId="appearance-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 rounded-xl bg-hover ring-1 ring-line" />}
            <Icon className="relative size-[15px]" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}

export function LangToggle() {
  const lang = useAtlas((s) => s.lang);
  const setLang = useAtlas((s) => s.setLang);
  return (
    <div className="glass pointer-events-auto relative flex rounded-2xl p-1 text-[12.5px] font-medium">
      {(["zh", "en"] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)} className={clsx("relative h-7 w-10 rounded-xl transition-colors", lang === l ? "text-ink" : "text-muted hover:text-ink")} aria-pressed={lang === l}>
          {lang === l && <motion.span layoutId="lang-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 rounded-xl bg-hover ring-1 ring-line" />}
          <span className="relative">{l === "zh" ? "中" : "EN"}</span>
        </button>
      ))}
    </div>
  );
}
