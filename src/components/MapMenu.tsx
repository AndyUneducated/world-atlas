import clsx from "clsx";
import { Layers, Settings2, Wrench, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { t, type StringKey } from "../lib/i18n";
import { useAtlas } from "../store";
import { LayersTab } from "./menu/LayersTab";
import { SettingsTab } from "./menu/SettingsTab";
import { ToolsTab } from "./menu/ToolsTab";

type Tab = "layers" | "tools" | "settings";
const TABS: { id: Tab; icon: typeof Layers; label: StringKey }[] = [
  { id: "layers", icon: Layers, label: "layers" },
  { id: "tools", icon: Wrench, label: "tools" },
  { id: "settings", icon: Settings2, label: "settings" },
];

/** The one map button: layers, tools and settings share a single panel so only one popover is ever open. */
export function MapMenu() {
  const lang = useAtlas((s) => s.lang);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("layers");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase, so Escape closes the menu without also clearing the selection.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={root} className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx("glass grid size-10 place-items-center rounded-xl transition-colors", open ? "text-accent" : "text-ink")}
        aria-label={t("menu", lang)}
        title={t("menu", lang)}
        aria-expanded={open}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "x" : "layers"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="grid"
          >
            {open ? <X className="size-[18px]" /> : <Layers className="size-[18px]" />}
          </motion.span>
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
            style={{ transformOrigin: "top right" }}
            className="glass scrollbar-thin absolute top-12 right-0 flex max-h-[calc(100dvh-76px)] w-[min(312px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl"
            role="dialog"
            aria-label={t("menu", lang)}
          >
            <div role="tablist" className="m-2 mb-0 flex shrink-0 rounded-2xl bg-hover p-1 ring-1 ring-line">
              {TABS.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={clsx("relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-medium transition-colors", tab === id ? "text-ink" : "text-muted hover:text-ink")}
                >
                  {tab === id && (
                    <motion.span layoutId="menu-tab-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 rounded-xl bg-panel-solid shadow-sm ring-1 ring-line" />
                  )}
                  <Icon className="relative size-[14px]" />
                  <span className="relative">{t(label, lang)}</span>
                </button>
              ))}
            </div>
            <div role="tabpanel" className="scrollbar-thin min-h-0 overflow-y-auto p-2">
              {tab === "layers" ? <LayersTab /> : tab === "tools" ? <ToolsTab onDone={() => setOpen(false)} /> : <SettingsTab />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
