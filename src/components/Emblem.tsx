import { useId } from "react";
import { MOTIFS, PATTERNS, shade, TERRITORY_COLOR } from "../lib/emblems";
import { FLAGS } from "../lib/flags";
import { GLYPHS } from "../lib/glyphs";
import type { Entity } from "../lib/types";

const SHIELD =
  "M32 3.5L54.5 9.8C56.4 10.3 57.5 12 57.5 13.9V29C57.5 44.5 47 55.4 32 61C17 55.4 6.5 44.5 6.5 29V13.9C6.5 12 7.6 10.3 9.5 9.8Z";

type Props = { size: number; className?: string };

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9]/g, "");
}

function Body({ id, shape, color, pattern, detail }: { id: string; shape: string; color: string; pattern?: string; detail: boolean }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={shade(color, 0.22)} />
          <stop offset="0.5" stopColor={color} />
          <stop offset="1" stopColor={shade(color, -0.42)} />
        </linearGradient>
        <radialGradient id={`${id}-gloss`} cx="0.32" cy="0" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.25" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <path d={shape} />
        </clipPath>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="0.9" floodColor={shade(color, -0.7)} floodOpacity="0.5" />
        </filter>
      </defs>
      <path d={shape} fill={`url(#${id}-fill)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {detail && pattern && PATTERNS[pattern] && <g opacity="0.15">{PATTERNS[pattern]()}</g>}
        <ellipse cx="26" cy="2" rx="40" ry="26" fill={`url(#${id}-gloss)`} />
      </g>
      {detail && <path d={shape} transform="translate(32 32) scale(0.85) translate(-32 -32)" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="1" />}
      <path d={shape} fill="none" stroke={`url(#${id}-bevel)`} strokeWidth="1.4" />
      <path d={shape} fill="none" stroke={shade(color, -0.55)} strokeOpacity="0.55" strokeWidth="0.8" />
    </>
  );
}

/** A shield glyph (24 box) scaled into the 48 box the emblem motifs use. */
function glyphMotif(name: string) {
  const parts = GLYPHS[name];
  if (!parts) return null;
  return (
    <g transform="translate(6 6) scale(1.5)">
      {parts.map((p, i) =>
        p.stroke ? (
          <path key={i} d={p.d} fill="none" stroke="#fff" strokeWidth={p.stroke} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={i} d={p.d} fill="#fff" fillRule="evenodd" />
        ),
      )}
    </g>
  );
}

function Glyph({ id, motif, ink, x, y, scale }: { id: string; motif?: string; ink: string; x: number; y: number; scale: number }) {
  const draw = MOTIFS[motif ?? ""];
  const art = draw ? draw(ink) : glyphMotif(motif ?? "");
  if (!art) return null;
  return (
    <g filter={`url(#${id}-shadow)`} transform={`translate(${x - 24 * scale} ${y - 24 * scale}) scale(${scale})`}>
      {art}
    </g>
  );
}

export function CityEmblem({ entity, size, className }: Props & { entity: Entity }) {
  const id = useSvgId();
  const color = entity.color ?? TERRITORY_COLOR;
  const detail = size >= 34;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-hidden>
      <Body id={id} shape={SHIELD} color={color} pattern={entity.emblem?.pattern} detail={detail} />
      <Glyph id={id} motif={entity.emblem?.motif} ink={shade(color, -0.55)} x={32} y={30.5} scale={detail ? 0.8 : 0.9} />
    </svg>
  );
}

/** A territory's flag, `size` wide and two-thirds as tall, with a light cloth shading. */
function TerritoryFlag({ entity, size, className }: Props & { entity: Entity }) {
  const id = useSvgId();
  const draw = FLAGS[entity.flag ?? ""];
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
        {draw ? draw(id) : <rect width="60" height="40" fill={TERRITORY_COLOR} />}
        <rect width="60" height="40" fill={`url(#${id}-cloth)`} />
      </g>
      <rect width="60" height="40" rx="2.2" fill="none" stroke="#000" strokeOpacity="0.22" strokeWidth="0.8" />
    </svg>
  );
}

/** The right emblem for an entity, or null when it has none (districts, natural features). */
export function Emblem(props: Props & { entity: Entity }) {
  const { entity } = props;
  if (entity.kind === "division" && entity.subtype === "dependency" && entity.flag) return <TerritoryFlag {...props} />;
  if (entity.kind === "division" && entity.subtype === "locality" && entity.emblem) return <CityEmblem {...props} />;
  return null;
}

export function hasEmblem(e: Entity) {
  return e.kind === "division" && ((e.subtype === "dependency" && !!e.flag) || (e.subtype === "locality" && !!e.emblem));
}
