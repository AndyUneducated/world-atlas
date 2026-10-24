import clsx from "clsx";
import { motion } from "motion/react";
import { THEME_ORDER, THEMES } from "../lib/themes";
import { t } from "../lib/i18n";
import { useAtlas } from "../store";

export function ThemeSwitcher() {
  const theme = useAtlas((s) => s.theme);
  const lang = useAtlas((s) => s.lang);
  const setTheme = useAtlas((s) => s.setTheme);
  return (
    <div role="radiogroup" aria-label={t("theme", lang)} className="glass pointer-events-auto flex gap-1 rounded-2xl p-1">
      {THEME_ORDER.map((id) => {
        const th = THEMES[id];
        const active = id === theme;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(id)}
            title={th.tagline[lang]}
            className={clsx("relative flex items-center gap-2 rounded-xl py-1.5 pr-3 pl-1.5 text-[12.5px] font-medium transition-colors", active ? "text-ink" : "text-muted hover:text-ink")}
          >
            {active && <motion.span layoutId="theme-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 rounded-xl bg-hover ring-1 ring-line" />}
            <span className="relative size-5 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: `conic-gradient(${th.swatch[0]} 0 120deg, ${th.swatch[1]} 0 240deg, ${th.swatch[2]} 0)` }} />
            <span className="relative">{th.label[lang]}</span>
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
        <button key={l} onClick={() => setLang(l)} className={clsx("relative w-10 rounded-xl py-1.5 transition-colors", lang === l ? "text-ink" : "text-muted hover:text-ink")} aria-pressed={lang === l}>
          {lang === l && <motion.span layoutId="lang-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 rounded-xl bg-hover ring-1 ring-line" />}
          <span className="relative">{l === "zh" ? "中" : "EN"}</span>
        </button>
      ))}
    </div>
  );
}
