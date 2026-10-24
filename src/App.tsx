import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { InfoCard } from "./components/InfoCard";
import { Legend } from "./components/Legend";
import { MapControls } from "./components/MapControls";
import { MapMenu } from "./components/MapMenu";
import { MapView } from "./components/MapView";
import { MeasurePanel } from "./components/MeasurePanel";
import { RoutePanel } from "./components/RoutePanel";
import { SearchBox } from "./components/SearchBox";
import { StatusBar } from "./components/StatusBar";
import { loadAtlas } from "./lib/data";
import { t } from "./lib/i18n";
import { useAtlas } from "./store";

function Loader({ error }: { error: string | null }) {
  const lang = useAtlas((s) => s.lang);
  return (
    <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="absolute inset-0 z-50 grid place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-4">
        <div className="relative size-12">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent/30" />
          <span className="absolute inset-2 rounded-full bg-accent" />
        </div>
        <p className="text-[13px] text-muted">{error ?? `${t("loading", lang)}…`}</p>
      </div>
    </motion.div>
  );
}

export default function App() {
  const data = useAtlas((s) => s.data);
  const setData = useAtlas((s) => s.setData);
  const theme = useAtlas((s) => s.theme);
  const lang = useAtlas((s) => s.lang);
  const selectedId = useAtlas((s) => s.selectedId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAtlas()
      .then(setData)
      .catch((e: unknown) => setError(String(e)));
  }, [setData]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = lang === "zh" ? "北维京岛领地 · 世界地图" : "North Viking Island · World Atlas";
  }, [lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useAtlas.getState();
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement) && !s.measure) s.select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      {data && <MapView />}

      {data && (
        <div className="pointer-events-none absolute inset-0 z-10">
          <aside className="absolute top-3 bottom-14 left-3 flex w-[min(400px,calc(100vw-76px))] flex-col gap-2">
            <SearchBox />
            <RoutePanel />
            <InfoCard />
          </aside>

          <div className="absolute top-3 right-3 z-20">
            <MapMenu />
          </div>

          <div className="absolute top-1/2 right-3 -translate-y-1/2 max-md:top-20 max-md:translate-y-0">
            <MapControls />
          </div>

          <div className="absolute right-3 bottom-12">
            <Legend />
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-md:bottom-14">
            <MeasurePanel />
          </div>

          <div className={clsx("absolute right-3 bottom-3", selectedId && "max-md:hidden")}>
            <StatusBar />
          </div>
        </div>
      )}

      <AnimatePresence>{!data && <Loader error={error} />}</AnimatePresence>
    </div>
  );
}
