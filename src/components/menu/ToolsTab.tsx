import clsx from "clsx";
import { Check, Link2, Maximize, Navigation2, Ruler } from "lucide-react";
import { useState } from "react";
import { t, type StringKey } from "../../lib/i18n";
import { homePadding } from "../../lib/viewport";
import { useAtlas, useCursor } from "../../store";

function Tile({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "flex flex-col items-start gap-3 rounded-2xl p-3 text-left text-[12.5px] font-medium ring-1 transition-colors",
        active ? "bg-accent-soft text-accent ring-accent/40" : "bg-hover text-ink ring-line hover:ring-faint",
      )}
    >
      <span className={clsx("grid size-8 place-items-center rounded-xl", active ? "bg-accent text-on-accent" : "bg-panel-solid text-ink shadow-sm")}>{icon}</span>
      {label}
    </button>
  );
}

/** One-shot map actions; each closes the menu so the map is in view straight away. */
export function ToolsTab({ onDone }: { onDone: () => void }) {
  const lang = useAtlas((s) => s.lang);
  const map = useAtlas((s) => s.map);
  const data = useAtlas((s) => s.data);
  const measuring = useAtlas((s) => s.measure !== null);
  const setMeasure = useAtlas((s) => s.setMeasure);
  const bearing = useCursor((s) => s.bearing);
  const [copied, setCopied] = useState(false);

  const run = (fn: () => void) => () => {
    fn();
    onDone();
  };
  const tools: { key: StringKey; icon: React.ReactNode; active?: boolean; onClick: () => void }[] = [
    { key: "measure", icon: <Ruler className="size-4" />, active: measuring, onClick: run(() => setMeasure(measuring ? null : [])) },
    {
      key: "home",
      icon: <Maximize className="size-4" />,
      onClick: run(() => {
        if (map && data) map.fitBounds(data.manifest.regions[0].bounds, { padding: homePadding(), bearing: 0, pitch: 0, duration: 1200 });
      }),
    },
    {
      key: "resetNorth",
      icon: <Navigation2 className="size-4 fill-current" style={{ transform: `rotate(${-bearing}deg)` }} />,
      onClick: run(() => map?.easeTo({ bearing: 0, pitch: 0, duration: 500 })),
    },
    {
      key: copied ? "copied" : "share",
      icon: copied ? <Check className="size-4" /> : <Link2 className="size-4" />,
      onClick: () => {
        void navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 p-0.5">
      {tools.map((tool, i) => (
        <Tile key={i} icon={tool.icon} label={t(tool.key, lang)} active={tool.active} onClick={tool.onClick} />
      ))}
    </div>
  );
}
