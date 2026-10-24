import clsx from "clsx";
import { motion } from "motion/react";
import { useMemo } from "react";
import { accentColor, chainage } from "../lib/entity";
import { displayName, formatNumber, t } from "../lib/i18n";
import type { AtlasData, BBox, Entity, Lang, LngLat, RouteSegment } from "../lib/types";
import { cardPadding } from "../lib/viewport";
import { useAtlas } from "../store";
import { CityEmblem } from "./Emblem";

interface Group {
  key: string;
  city: Entity | undefined;
  rows: { seg: RouteSegment; district: Entity | undefined; key: string; end: number }[];
  km: number;
}

function groupByCity(data: AtlasData, segments: RouteSegment[]): Group[] {
  const groups: Group[] = [];
  segments.forEach((seg, i) => {
    const district = seg.division ? data.entities[seg.division] : undefined;
    const city = district?.parent ? data.entities[district.parent] : undefined;
    const last = groups[groups.length - 1];
    const row = { seg, district, key: `s${i}`, end: segments[i + 1]?.from_km ?? seg.from_km + seg.km };
    if (last && last.city?.id === city?.id) {
      last.rows.push(row);
      last.km += seg.km;
    } else {
      groups.push({ key: `g${i}`, city, rows: [row], km: seg.km });
    }
  });
  return groups;
}

const union = (boxes: BBox[]): BBox => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

/** Vertical, city-grouped list of the districts a route passes through, in travel order. */
export function RouteTimeline({ data, entity, lang }: { data: AtlasData; entity: Entity; lang: Lang }) {
  const map = useAtlas((s) => s.map);
  const highlight = useAtlas((s) => s.highlight);
  const setHighlight = useAtlas((s) => s.setHighlight);
  const segments = entity.segments ?? [];
  const groups = useMemo(() => groupByCity(data, segments), [data, segments]);
  if (!segments.length) return null;

  const total = segments.reduce((s, x) => s + x.km, 0);
  const longest = Math.max(...segments.map((s) => s.km));
  const districtCount = new Set(segments.map((s) => s.division)).size;
  const cityCount = new Set(groups.map((g) => g.city?.id)).size;

  const locate = (key: string, lines: LngLat[][], bbox: BBox) => {
    setHighlight({ key, lines });
    map?.fitBounds(bbox, {
      padding: cardPadding(20),
      maxZoom: 11,
      duration: 900,
    });
  };
  const preview = (key: string, lines: LngLat[][]) => {
    if (useAtlas.getState().highlight?.key.startsWith("pin:")) return;
    setHighlight({ key, lines });
  };
  const endPreview = () => {
    if (!useAtlas.getState().highlight?.key.startsWith("pin:")) setHighlight(null);
  };
  const active = highlight?.key.replace(/^pin:/, "");

  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold tracking-wider text-faint uppercase">{t("route_segments", lang)}</h3>
          <p className="mt-1 text-[12px] text-muted">
            {cityCount} {t("route_cities", lang)} · {districtCount} {t("route_districts", lang)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {entity.ring && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">{t("route_loop", lang)}</span>}
          {entity.ends_at_network && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">{t("route_spur", lang)}</span>}
          <span className="text-[17px] font-semibold tracking-tight text-ink tabular-nums">
            {formatNumber(total, lang, 1)}
            <span className="ml-0.5 text-[11px] font-normal text-faint">km</span>
          </span>
        </div>
      </div>

      <ol className="relative -mx-2">
        {groups.map((g, gi) => {
          const color = (g.city && accentColor(data, g.city)) ?? "var(--ui-accent)";
          const groupLines = g.rows.map((r) => r.seg.line);
          const groupBox = union(g.rows.map((r) => r.seg.bbox));
          const isLast = gi === groups.length - 1;
          return (
            <motion.li
              key={g.key}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(gi * 0.035, 0.4), duration: 0.25 }}
              className="relative"
            >
              <span
                className="absolute top-6 bottom-0 left-[19px] w-[3px] rounded-full"
                style={{ background: `linear-gradient(${color}, ${color}${isLast ? "00" : "aa"})` }}
              />
              <button
                onClick={() => locate(`pin:${g.key}`, groupLines, groupBox)}
                onMouseEnter={() => preview(g.key, groupLines)}
                onMouseLeave={endPreview}
                className={clsx("relative flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-hover", active === g.key && "bg-hover")}
              >
                <span className="relative grid size-[26px] shrink-0 place-items-center">
                  {g.city?.emblem ? <CityEmblem entity={g.city} size={26} /> : <span className="size-3 rounded-full" style={{ background: color }} />}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{g.city ? displayName(g.city, lang) : "—"}</span>
                <span className="text-[12px] font-medium text-muted tabular-nums">
                  {formatNumber(g.km, lang, 1)} <span className="text-faint">km</span>
                </span>
              </button>
              <ol className="pb-1.5">
                {g.rows.map(({ seg, district, key, end }) => (
                  <li key={key}>
                    <button
                      onClick={() => locate(`pin:${key}`, [seg.line], seg.bbox)}
                      onMouseEnter={() => preview(key, [seg.line])}
                      onMouseLeave={endPreview}
                      className={clsx(
                        "group relative flex w-full items-center gap-2.5 rounded-lg py-1 pr-2 pl-[36px] text-left transition-colors hover:bg-hover",
                        active === key && "bg-hover",
                      )}
                    >
                      <span
                        className={clsx(
                          "absolute left-[15.5px] size-[10px] rounded-full border-2 transition-transform duration-200 group-hover:scale-125",
                          active === key && "scale-125",
                        )}
                        style={{ borderColor: color, background: active === key ? color : "var(--ui-panel-solid)" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{district ? displayName(district, lang) : t("route_water", lang)}</span>
                        <span className="block font-mono text-[10.5px] text-faint">
                          {chainage(seg.from_km)} – {chainage(end)}
                        </span>
                      </span>
                      <span className="relative h-1 w-12 overflow-hidden rounded-full bg-hover">
                        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(100 * seg.km) / longest}%`, background: color }} />
                      </span>
                      <span className="w-12 text-right text-[12px] text-muted tabular-nums">{formatNumber(seg.km, lang, 1)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
