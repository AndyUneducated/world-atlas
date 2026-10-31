import { useId } from "react";
import { cityFlag } from "../lib/cityFlags";
import { TERRITORY_COLOR } from "../lib/emblems";
import { FLAGS } from "../lib/flags";
import type { Entity } from "../lib/types";
import { useAtlas } from "../store";

type Props = { size: number; className?: string };

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9]/g, "");
}

/** A territory's or city's flag, `size` wide and two-thirds as tall, with a light cloth shading. */
export function Flag({ entity, size, className }: Props & { entity: Entity }) {
  const id = useSvgId();
  const territoryFlag = useAtlas((s) => {
    const parent = s.data?.entities[entity.parent ?? ""];
    return typeof parent?.flag === "string" ? parent.flag : undefined;
  });
  const flag = entity.flag;
  const art = typeof flag === "string" ? FLAGS[flag]?.(id) : flag ? cityFlag(flag, id, entity.names, territoryFlag) : null;
  return (
    <svg viewBox="-1 -1 62 42" width={size} height={(size * 2) / 3} className={className} role="img" aria-hidden>
      <defs>
        <clipPath id={`${id}-flag`}>
          <rect width="60" height="40" rx="2.2" />
        </clipPath>
        <linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-flag)`}>
        {art ?? <rect width="60" height="40" fill={TERRITORY_COLOR} />}
        <rect width="60" height="40" fill={`url(#${id}-cloth)`} />
      </g>
      <rect width="60" height="40" rx="2.2" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="0.8" />
    </svg>
  );
}

/** The flag of a territory or city, or null for everything else (districts, natural features). */
export function Emblem(props: Props & { entity: Entity }) {
  return hasEmblem(props.entity) ? <Flag {...props} /> : null;
}

export function hasEmblem(e: Entity) {
  return e.kind === "division" && (e.subtype === "dependency" || e.subtype === "locality") && !!e.flag;
}
