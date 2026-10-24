import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { useId, useMemo } from "react";
import { MOTIFS, PATTERNS, ROUTE_COLORS, shade, TERRITORY_COLOR } from "../lib/emblems";
import type { AtlasData, Entity } from "../lib/types";
import { useAtlas } from "../store";

const SHIELD =
  "M32 3.5L54.5 9.8C56.4 10.3 57.5 12 57.5 13.9V29C57.5 44.5 47 55.4 32 61C17 55.4 6.5 44.5 6.5 29V13.9C6.5 12 7.6 10.3 9.5 9.8Z";
const ROUNDED = "M19 4H45C53.3 4 60 10.7 60 19V45C60 53.3 53.3 60 45 60H19C10.7 60 4 53.3 4 45V19C4 10.7 10.7 4 19 4Z";

type Props = { size: number; className?: string; sheen?: boolean };

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9]/g, "");
}

/** Gradient body, engraved pattern, gloss and bevel shared by the shield and route badges. */
function Sheen({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0.45">
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
          <animateTransform attributeName="gradientTransform" type="translate" values="-1.2 0;-1.2 0;1.2 0" keyTimes="0;0.6;1" dur="6s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="64" height="64" fill={`url(#${id}-sheen)`} style={{ mixBlendMode: "overlay" }} />
    </>
  );
}

function Body({ id, shape, color, pattern, detail, sheen }: { id: string; shape: string; color: string; pattern?: string; detail: boolean; sheen?: boolean }) {
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
        {sheen && <Sheen id={id} />}
      </g>
      {detail && <path d={shape} transform="translate(32 32) scale(0.85) translate(-32 -32)" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="1" />}
      <path d={shape} fill="none" stroke={`url(#${id}-bevel)`} strokeWidth="1.4" />
      <path d={shape} fill="none" stroke={shade(color, -0.55)} strokeOpacity="0.55" strokeWidth="0.8" />
    </>
  );
}

function Glyph({ id, motif, ink, x, y, scale }: { id: string; motif?: string; ink: string; x: number; y: number; scale: number }) {
  const draw = MOTIFS[motif ?? ""];
  if (!draw) return null;
  return (
    <g filter={`url(#${id}-shadow)`} transform={`translate(${x - 24 * scale} ${y - 24 * scale}) scale(${scale})`}>
      {draw(ink)}
    </g>
  );
}

export function CityEmblem({ entity, size, className, sheen }: Props & { entity: Entity }) {
  const id = useSvgId();
  const color = entity.color ?? TERRITORY_COLOR;
  const detail = size >= 34;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-hidden>
      <Body id={id} shape={SHIELD} color={color} pattern={entity.emblem?.pattern} detail={detail} sheen={sheen} />
      <Glyph id={id} motif={entity.emblem?.motif} ink={shade(color, -0.55)} x={32} y={30.5} scale={detail ? 0.8 : 0.9} />
    </svg>
  );
}

export function RouteEmblem({ entity, size, className, sheen }: Props & { entity: Entity }) {
  const id = useSvgId();
  const color = ROUTE_COLORS[entity.network ?? ""] ?? "#64748b";
  const plate = size >= 34;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-hidden>
      <Body id={id} shape={ROUNDED} color={color} pattern={entity.emblem?.pattern} detail={plate} sheen={sheen} />
      <Glyph id={id} motif={entity.emblem?.motif} ink={shade(color, -0.55)} x={32} y={plate ? 25.5 : 32} scale={plate ? 0.64 : 0.82} />
      {plate && (
        <g>
          <rect x="9.5" y="42.5" width="45" height="13" rx="3.6" fill="#0B7A4B" stroke="#fff" strokeOpacity="0.85" strokeWidth="1" />
          <text
            x="32"
            y="51.7"
            textAnchor="middle"
            fill="#fff"
            fontSize="8.6"
            fontWeight="700"
            letterSpacing="0.3"
            fontFamily="Inter, 'Segoe UI', system-ui, sans-serif"
          >
            {entity.ref}
          </text>
        </g>
      )}
    </svg>
  );
}

const STARS: [number, number, number][] = [
  [16, 21, 0.7], [22, 14, 0.5], [41, 15, 0.6], [47, 22, 0.8], [27, 20, 0.4], [36, 11, 0.45], [50, 31, 0.5],
  [13, 31, 0.5], [44, 27, 0.35], [19, 27, 0.35], [30, 26, 0.3], [38, 22, 0.4],
];

/** Outer ring of the territory outline projected into a box; empty until data has loaded. */
function islandPath(data: AtlasData | null, territoryId: string, cx: number, cy: number, w: number, h: number) {
  const f = data?.layers.divisions.features.find((x) => (x.properties as { id?: string })?.id === territoryId) as Feature<Polygon | MultiPolygon> | undefined;
  if (!f) return "";
  const rings: Position[][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]);
  const ring = rings.reduce((a, b) => (b.length > a.length ? b : a));
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
  const xs = ring.map((p) => p[0] * Math.cos(lat0));
  const ys = ring.map((p) => -p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(w / (x1 - x0), h / (y1 - y0));
  const step = Math.max(1, Math.floor(ring.length / 160));
  const pts: string[] = [];
  for (let i = 0; i < ring.length; i += step) {
    pts.push(`${(cx + (xs[i] - (x0 + x1) / 2) * k).toFixed(2)} ${(cy + (ys[i] - (y0 + y1) / 2) * k).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function TerritorySeal({ entity, size, className, sheen }: Props & { entity: Entity }) {
  const id = useSvgId();
  const data = useAtlas((s) => s.data);
  const island = useMemo(() => islandPath(data, entity.id, 32, 40, 30, 15), [data, entity.id]);
  const lettering = size >= 64;
  const disc = lettering ? 23.5 : 27;
  const text = `${entity.names.zh} · ${entity.names.en.toUpperCase()} · `;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-hidden>
      <defs>
        <radialGradient id={`${id}-sky`} cx="0.5" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#15516a" />
          <stop offset="0.55" stopColor="#0b1a36" />
          <stop offset="1" stopColor="#060a17" />
        </radialGradient>
        <linearGradient id={`${id}-aurora`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cf7d4" stopOpacity="0" />
          <stop offset="0.35" stopColor="#5ef2c2" stopOpacity="0.95" />
          <stop offset="0.75" stopColor="#3ba7f5" stopOpacity="0.35" />
          <stop offset="1" stopColor="#3ba7f5" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-aurora2`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c084fc" stopOpacity="0" />
          <stop offset="0.45" stopColor="#a78bfa" stopOpacity="0.7" />
          <stop offset="1" stopColor="#5ef2c2" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe7a1" />
          <stop offset="0.5" stopColor="#e9b949" />
          <stop offset="1" stopColor="#a8741a" />
        </linearGradient>
        <linearGradient id={`${id}-land`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6fff6" />
          <stop offset="1" stopColor="#8fe3cf" />
        </linearGradient>
        <clipPath id={`${id}-disc`}>
          <circle cx="32" cy="32" r={disc} />
        </clipPath>
        <path id={`${id}-text`} d="M32 32m-27 0a27 27 0 1 1 54 0a27 27 0 1 1 -54 0" />
      </defs>
      <circle cx="32" cy="32" r="31" fill="#070c1c" />
      <circle cx="32" cy="32" r="30.6" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="1.2" />
      {lettering && (
        <text fontSize="4.3" fontWeight="600" letterSpacing="0.55" fill={`url(#${id}-gold)`} fontFamily="Inter, 'Segoe UI', system-ui, sans-serif">
          <textPath href={`#${id}-text`} startOffset="0" textLength={2 * Math.PI * 27 - 2} lengthAdjust="spacing">
            {text}
          </textPath>
        </text>
      )}
      <circle cx="32" cy="32" r={disc} fill={`url(#${id}-sky)`} />
      <g clipPath={`url(#${id}-disc)`}>
        {STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={0.5 + (i % 3) * 0.2} />
        ))}
        <path d="M-2 30C8 16 18 30 28 18S48 6 66 16V26C52 18 42 30 30 26S10 28-2 40Z" fill={`url(#${id}-aurora)`} />
        <path d="M-2 22C10 12 20 22 32 12S52 8 66 10V18C50 14 42 22 32 20S12 20-2 30Z" fill={`url(#${id}-aurora2)`} opacity="0.7" />
        <path d="M32 9.5l1.1 3.3 3.3 1.1-3.3 1.1-1.1 3.3-1.1-3.3-3.3-1.1 3.3-1.1z" fill="#fff" />
        <rect x="0" y="40" width="64" height="30" fill="#0a2a44" opacity="0.65" />
        {island && <path d={island} fill={`url(#${id}-land)`} stroke="#0b1a36" strokeWidth="0.5" />}
        <ellipse cx="22" cy="12" rx="22" ry="12" fill="#fff" opacity="0.08" />
        {sheen && <Sheen id={id} />}
      </g>
      <circle cx="32" cy="32" r={disc} fill="none" stroke={`url(#${id}-gold)`} strokeWidth="0.9" />
    </svg>
  );
}

/** The right emblem for an entity, or null when it has none (districts, natural features). */
export function Emblem(props: Props & { entity: Entity }) {
  const { entity } = props;
  if (entity.kind === "route" && entity.emblem) return <RouteEmblem {...props} />;
  if (entity.kind === "division" && entity.subtype === "dependency" && entity.emblem) return <TerritorySeal {...props} />;
  if (entity.kind === "division" && entity.subtype === "locality" && entity.emblem) return <CityEmblem {...props} />;
  return null;
}

export function hasEmblem(e: Entity) {
  return !!e.emblem && (e.kind === "route" || e.subtype === "dependency" || e.subtype === "locality");
}
