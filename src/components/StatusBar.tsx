import { formatNumber } from "../lib/i18n";
import { useAtlas, useCursor } from "../store";

const NICE = [1, 2, 5];

function scaleBar(metersPerPixel: number, maxPx = 96) {
  if (!metersPerPixel) return { px: 0, label: "" };
  const maxM = metersPerPixel * maxPx;
  const pow = 10 ** Math.floor(Math.log10(maxM));
  const step = [...NICE].reverse().find((n) => n * pow <= maxM) ?? 1;
  const m = step * pow;
  return { px: m / metersPerPixel, label: m >= 1000 ? `${m / 1000} km` : `${m} m` };
}

function dms(v: number, pos: string, neg: string) {
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = Math.round(((a - d) * 60 - m) * 60);
  return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″${v >= 0 ? pos : neg}`;
}

/** Scale bar, cursor coordinates and zoom level, each behind its own display toggle. */
export function StatusBar() {
  const display = useAtlas((s) => s.display);
  const { lngLat, zoom, metersPerPixel } = useCursor();
  const bar = scaleBar(metersPerPixel);

  const items: React.ReactNode[] = [];
  if (display.scale)
    items.push(
      <span key="scale" className="flex items-center gap-2">
        <span className="relative h-1.5 border-x border-b border-current transition-[width] duration-150" style={{ width: bar.px }} />
        {bar.label}
      </span>,
    );
  if (display.coordinates) items.push(<span key="coords">{lngLat ? `${dms(lngLat[1], "N", "S")}  ${dms(lngLat[0], "E", "W")}` : "—"}</span>);
  if (display.zoomLevel) items.push(<span key="zoom">z {formatNumber(zoom, "en", 1)}</span>);
  if (!items.length) return null;

  return (
    <div className="glass pointer-events-auto flex h-8 items-center gap-3 rounded-full px-3 text-[11px] text-muted tabular-nums">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-3">
          {i > 0 && <span className="h-3 w-px bg-line" />}
          {item}
        </span>
      ))}
    </div>
  );
}
