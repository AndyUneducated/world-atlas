import { useId } from "react";
import { cityFlag } from "../lib/cityFlags";
import { TERRITORY_COLOR } from "../lib/emblems";
import { FLAGS } from "../lib/flags";
import { NATION_FLAGS, type NationFlag } from "../lib/nationFlags";
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
  const nation = typeof flag === "string" ? NATION_FLAGS[flag] : undefined;
  if (nation) return <NationFlagSvg flag={nation} id={id} size={size} className={className} />;
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

/** A nation flag in its own proportions and outline, fitted into the `size` × two-thirds box. */
function NationFlagSvg({ flag, id, size, className }: Props & { flag: NationFlag; id: string }) {
  const { w, h } = flag;
  const scale = Math.min(size / w, (size * 2) / 3 / h);
  const outline = flag.shape ?? `M0 0H${w}V${h}H0Z`;
  return (
    <svg viewBox={`-1 -1 ${w + 2} ${h + 2}`} width={(w + 2) * scale} height={(h + 2) * scale} className={className} role="img" aria-hidden>
      <defs>
        <clipPath id={`${id}-flag`}>{flag.shape ? <path d={flag.shape} /> : <rect width={w} height={h} rx="2.2" />}</clipPath>
        <linearGradient id={`${id}-cloth`} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.7" stopColor="#000" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-flag)`}>
        {flag.draw(id)}
        <rect width={w} height={h} fill={`url(#${id}-cloth)`} />
      </g>
      {flag.shape ? (
        <path d={outline} fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="0.8" strokeLinejoin="round" />
      ) : (
        <rect width={w} height={h} rx="2.2" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="0.8" />
      )}
    </svg>
  );
}

/** The flag of a territory, city or party, or null for everything else (districts, natural features). */
export function Emblem(props: Props & { entity: Entity }) {
  return hasEmblem(props.entity) ? <Flag {...props} /> : null;
}

export function hasEmblem(e: Entity) {
  return ((e.kind === "division" && (e.subtype === "dependency" || e.subtype === "locality")) || e.kind === "party") && !!e.flag;
}
