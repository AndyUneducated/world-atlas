import clsx from "clsx";
import { Check, Grid3x3, ListTree, Monitor, Moon, Plus, Ruler, Sun, ZoomIn } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { t, type StringKey } from "../../lib/i18n";
import { THEMES } from "../../lib/themes";
import type { Appearance, Lang, ThemeId } from "../../lib/types";
import { useAtlas, type DisplayToggles } from "../../store";
import { Switch } from "../Switch";

const REPO_URL = "https://github.com/AndyUneducated/world-atlas";

const APPEARANCES: { id: Appearance; icon: typeof Sun; label: StringKey }[] = [
  { id: "auto", icon: Monitor, label: "appearanceAuto" },
  { id: "light", icon: Sun, label: "appearanceLight" },
  { id: "dark", icon: Moon, label: "appearanceDark" },
];

const LANGS: { id: Lang; label: string }[] = [
  { id: "zh", label: "中文" },
  { id: "en", label: "English" },
];

const DISPLAY: { key: keyof DisplayToggles; icon: typeof Sun; label: StringKey }[] = [
  { key: "legend", icon: ListTree, label: "legend" },
  { key: "scale", icon: Ruler, label: "scaleBar" },
  { key: "coordinates", icon: Grid3x3, label: "coordinates" },
  { key: "zoomLevel", icon: ZoomIn, label: "zoomLevel" },
  { key: "zoomButtons", icon: Plus, label: "zoomButtons" },
];

const LAND = "M8 40 C 14 22, 30 14, 46 18 C 60 21, 66 12, 80 16 C 92 19, 96 32, 88 42 C 80 52, 62 50, 50 54 C 34 59, 16 56, 8 40 Z";

/** A tiny rendition of the map in one theme, used as the appearance option thumbnail. */
function MiniMap({ theme }: { theme: ThemeId }) {
  const m = THEMES[theme].map;
  return (
    <>
      <rect width="100" height="64" fill={m.background} />
      <path d={LAND} fill={m.land} stroke={m.coast.color} strokeWidth="0.8" />
      <path d="M50 18 C 52 30, 46 40, 52 54" fill="none" stroke={m.cityLine.color} strokeWidth="0.8" strokeDasharray="2 1.5" />
      <path d="M14 42 C 30 36, 46 34, 62 38 S 84 34, 90 30" fill="none" stroke={m.nationalExpressway.fill} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="40" cy="34" r="2.6" fill={m.cityDot.capital} stroke={m.cityDot.fill} strokeWidth="1" />
    </>
  );
}

function AppearanceTile({ id, active, onSelect, lang }: { id: Appearance; active: boolean; onSelect: () => void; lang: Lang }) {
  const clip = useId();
  const { icon: Icon, label } = APPEARANCES.find((a) => a.id === id)!;
  return (
    <button role="radio" aria-checked={active} onClick={onSelect} className="group flex flex-col items-center gap-1.5 rounded-2xl p-1 outline-none">
      <span
        className={clsx(
          "relative block w-full overflow-hidden rounded-xl ring-1 transition-all duration-200",
          active ? "ring-2 ring-accent shadow-[0_6px_18px_-8px_var(--ui-accent)]" : "ring-line group-hover:ring-faint",
        )}
      >
        <svg viewBox="0 0 100 64" className="block aspect-[100/64] w-full" aria-hidden>
          {id === "dark" ? (
            <MiniMap theme="dark" />
          ) : id === "light" ? (
            <MiniMap theme="light" />
          ) : (
            <>
              <MiniMap theme="light" />
              <clipPath id={clip}>
                <path d="M64 0 L100 0 L100 64 L36 64 Z" />
              </clipPath>
              <g clipPath={`url(#${clip})`}>
                <MiniMap theme="dark" />
              </g>
              <path d="M64 0 L36 64" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
            </>
          )}
        </svg>
        <AnimatePresence>
          {active && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 600, damping: 30 }}
              className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-accent text-on-accent shadow"
            >
              <Check className="size-2.5" strokeWidth={3.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className={clsx("flex items-center gap-1 text-[11.5px] font-medium transition-colors", active ? "text-ink" : "text-muted group-hover:text-ink")}>
        <Icon className="size-3" strokeWidth={2.2} />
        {t(label, lang)}
      </span>
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="px-1 pb-2 text-[11px] font-semibold tracking-wider text-faint uppercase">{children}</p>;
}

export function SettingsTab() {
  const lang = useAtlas((s) => s.lang);
  const setLang = useAtlas((s) => s.setLang);
  const appearance = useAtlas((s) => s.appearance);
  const setAppearance = useAtlas((s) => s.setAppearance);
  const display = useAtlas((s) => s.display);
  const toggleDisplay = useAtlas((s) => s.toggleDisplay);

  return (
    <div className="p-1">
      <SectionTitle>{t("appearance", lang)}</SectionTitle>
      <div role="radiogroup" aria-label={t("appearance", lang)} className="grid grid-cols-3 gap-1">
        {APPEARANCES.map((a) => (
          <AppearanceTile key={a.id} id={a.id} active={a.id === appearance} onSelect={() => setAppearance(a.id)} lang={lang} />
        ))}
      </div>

      <div className="mt-4">
        <SectionTitle>{t("language", lang)}</SectionTitle>
        <div role="radiogroup" aria-label={t("language", lang)} className="flex rounded-xl bg-hover p-1 ring-1 ring-line">
          {LANGS.map((l) => (
            <button
              key={l.id}
              role="radio"
              aria-checked={lang === l.id}
              onClick={() => setLang(l.id)}
              className={clsx("relative h-8 flex-1 rounded-lg text-[12.5px] font-medium transition-colors", lang === l.id ? "text-ink" : "text-muted hover:text-ink")}
            >
              {lang === l.id && (
                <motion.span layoutId="settings-lang-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 rounded-lg bg-panel-solid shadow-sm ring-1 ring-line" />
              )}
              <span className="relative">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle>{t("onScreen", lang)}</SectionTitle>
        <div className="-mx-1">
          {DISPLAY.map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => toggleDisplay(key)} aria-pressed={display[key]} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover">
              <span className={clsx("grid size-7 place-items-center rounded-lg transition-colors", display[key] ? "bg-accent-soft text-accent" : "bg-hover text-muted")}>
                <Icon className="size-[15px]" />
              </span>
              <span className="flex-1">{t(label, lang)}</span>
              <Switch on={display[key]} />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line px-1 pt-3 text-[11px] text-faint">
        <span>{t("license", lang)}</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="grid size-6 place-items-center rounded-md hover:bg-hover hover:text-ink" aria-label="GitHub">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </div>
    </div>
  );
}
