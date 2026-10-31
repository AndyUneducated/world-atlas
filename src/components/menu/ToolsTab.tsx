import clsx from "clsx";
import { Navigation2, Ruler } from "lucide-react";
import { t, type StringKey } from "../../lib/i18n";
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
  const measuring = useAtlas((s) => s.measure !== null);
  const setMeasure = useAtlas((s) => s.setMeasure);
  const bearing = useCursor((s) => s.bearing);

  const run = (fn: () => void) => () => {
    fn();
    onDone();
  };
  const tools: { key: StringKey; icon: React.ReactNode; active?: boolean; onClick: () => void }[] = [
    { key: "measure", icon: <Ruler className="size-4" />, active: measuring, onClick: run(() => setMeasure(measuring ? null : [])) },
    {
      key: "resetNorth",
      icon: <Navigation2 className="size-4 fill-current" style={{ transform: `rotate(${-bearing}deg)` }} />,
      onClick: run(() => map?.easeTo({ bearing: 0, pitch: 0, duration: 500 })),
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
