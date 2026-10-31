import type { ReactNode } from "react";

/**
 * Motifs drawn for the old city emblems and kept as flag charges (see charges.tsx): white on a
 * 48×48 box, with `ink` for the cut-outs where the field shows through.
 */

const W = "#fff";
const line = (width: number, opacity = 1) =>
  ({ fill: "none", stroke: W, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round", strokeOpacity: opacity }) as const;

const polar = (deg: number, r: number, cx = 24, cy = 24): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

export const MOTIFS: Record<string, (ink: string) => ReactNode> = {
  orbit: () => (
    <g>
      <g transform="rotate(-24 24 24)">
        <path d="M7 24a17 6.4 0 0 1 34 0" {...line(2.2, 0.55)} />
      </g>
      <circle cx="24" cy="24" r="7" fill={W} />
      <g transform="rotate(-24 24 24)">
        <path d="M7 24a17 6.4 0 0 0 34 0" {...line(2.4)} />
        <circle cx="41" cy="24" r="2.3" fill={W} />
      </g>
      <circle cx="12" cy="11" r="1.1" fill={W} />
      <circle cx="37" cy="37" r="0.9" fill={W} fillOpacity="0.8" />
    </g>
  ),
  wheat: () => (
    <g>
      <path d="M24 41V13" {...line(2)} />
      <ellipse cx="24" cy="11" rx="2.2" ry="4" fill={W} />
      {[17.2, 22.8, 28.4].map((y) => (
        <g key={y} fill={W}>
          <ellipse cx="20.4" cy={y} rx="2.3" ry="4.2" transform={`rotate(-38 20.4 ${y})`} />
          <ellipse cx="27.6" cy={y} rx="2.3" ry="4.2" transform={`rotate(38 27.6 ${y})`} />
        </g>
      ))}
      <path d="M24 37c-4.2-.8-7.4-3.4-9-7.6M24 37c4.2-.8 7.4-3.4 9-7.6" {...line(2)} />
    </g>
  ),
  peaks: (ink) => (
    <g>
      <path d="M4.5 38.5L18 14.5l7.2 11.8 4.6-6.6 13.7 18.8z" fill={W} />
      <path d="M14.2 21.6l2.2 1.4 1.6-1.8 1.8 2 2.2-1" fill="none" stroke={ink} strokeOpacity="0.5" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M29.8 19.7l-2.2 3.2" stroke={ink} strokeOpacity="0.3" strokeWidth="1.2" />
    </g>
  ),
  sun: () => (
    <g>
      <circle cx="24" cy="24" r="7.2" fill={W} />
      {Array.from({ length: 12 }, (_, k) => {
        const [x0, y0] = polar(k * 30 - 90, 10.8);
        const [x1, y1] = polar(k * 30 - 90, k % 2 ? 13.6 : 16);
        return <path key={k} d={`M${x0} ${y0}L${x1} ${y1}`} {...line(k % 2 ? 2 : 2.6)} />;
      })}
    </g>
  ),
  river: () => (
    <g>
      <path d="M5 17c5-5 9-5 13.5 0s8.5 5 13.5 0 7.5-4.5 11-2" {...line(3.2)} />
      <path d="M5 25.5c5-5 9-5 13.5 0s8.5 5 13.5 0 7.5-4.5 11-2" {...line(2.5, 0.85)} />
      <path d="M5 34c5-5 9-5 13.5 0s8.5 5 13.5 0 7.5-4.5 11-2" {...line(1.9, 0.7)} />
    </g>
  ),
  compass: (ink) => (
    <g>
      <circle cx="24" cy="24" r="16" {...line(1.3, 0.5)} />
      <path d="M24 5l3.3 15.7L43 24l-15.7 3.3L24 43l-3.3-15.7L5 24l15.7-3.3z" fill={W} />
      <path d="M24 5l3.3 15.7L24 24zM43 24l-15.7 3.3L24 24zM24 43l-3.3-15.7L24 24zM5 24l15.7-3.3L24 24z" fill={ink} fillOpacity="0.28" />
      <circle cx="24" cy="24" r="2.2" fill={ink} />
    </g>
  ),
  anchor: () => (
    <g>
      <circle cx="24" cy="9.6" r="3.6" {...line(2.4)} />
      <path d="M24 13.2V40" {...line(3)} />
      <path d="M16 19h16" {...line(2.8)} />
      <path d="M9.2 28.5c1.2 7.2 7.4 11.8 14.8 11.8s13.6-4.6 14.8-11.8" {...line(3)} />
      <path d="M5.4 31.6L9 24.6l4.6 5.2z" fill={W} />
      <path d="M42.6 31.6L39 24.6l-4.6 5.2z" fill={W} />
    </g>
  ),
  gull: () => (
    <g>
      <path d="M5 21c5.5-4.6 12-4.4 19 2.8 7-7.2 13.5-7.4 19-2.8-6.2-1-11.8 1.6-19 9.4C16.8 22.6 11.2 20 5 21z" fill={W} />
      <path d="M8 37c3-2 6-2 9 0s6 2 9 0 6-2 9 0 4 1.6 5 1.6" {...line(1.8, 0.75)} />
    </g>
  ),
  lighthouse: (ink) => (
    <g>
      <path d="M19 40l2.6-22h4.8L29 40z" fill={W} />
      <path d="M20.7 25.5h6.6M20.1 32.5h7.8" stroke={ink} strokeOpacity="0.4" strokeWidth="2.2" />
      <rect x="20.5" y="12.5" width="7" height="5" rx="1" fill={W} />
      <path d="M19.5 12.5h9L24 8.3z" fill={W} />
      <circle cx="24" cy="15" r="1.4" fill={ink} />
      <path d="M17 13.5L6.5 9.8M17 16.5L6.5 20.2M31 13.5l10.5-3.7M31 16.5l10.5 3.7" {...line(2, 0.8)} />
      <path d="M12 40.6h24" {...line(2.4)} />
    </g>
  ),
  pine: () => (
    <g fill={W}>
      <path d="M24 5L31.5 15H28L35.5 24.5H31.5L40 35H8L16.5 24.5H12.5L20 15H16.5Z" />
      <rect x="21.6" y="34.5" width="4.8" height="7.5" rx="1" />
    </g>
  ),
  volcano: (ink) => (
    <g>
      <path d="M4.5 40L18 20.5h12L43.5 40z" fill={W} />
      <path d="M18 20.5l3 3.2 3-2.2 3 2.2 3-3.2" fill="none" stroke={ink} strokeOpacity="0.5" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M24 17c-2.5-2.6-1.2-5.6 1.8-6.2-.6-3.2 2.6-5.4 5.6-3.8 2-2.4 6.4-1.6 6.8 1.6" {...line(2.2, 0.85)} />
    </g>
  ),
  sail: () => (
    <g>
      <rect x="22.8" y="5" width="2.2" height="30" rx="1" fill={W} />
      <path d="M26.6 7c7 6 11 15.5 11.5 26H26.6z" fill={W} />
      <path d="M21.2 11L10 33h11.2z" fill={W} fillOpacity="0.85" />
      <path d="M7 36h34l-4.5 5.5h-25z" fill={W} />
    </g>
  ),
  dawn: () => (
    <g>
      <path d="M13 31a11 11 0 0 1 22 0z" fill={W} />
      {[-162, -135, -108, -90, -72, -45, -18].map((a) => {
        const [x0, y0] = polar(a, 13.6, 24, 31);
        const [x1, y1] = polar(a, a === -90 ? 20.5 : 19, 24, 31);
        return <path key={a} d={`M${x0} ${y0}L${x1} ${y1}`} {...line(2.3)} />;
      })}
      <path d="M5 31h38" {...line(2.6)} />
      <path d="M10 36.5h28M16 41h16" {...line(2, 0.7)} />
    </g>
  ),
  fish: (ink) => (
    <g>
      <path d="M13 24c4-7 10-10.5 16.5-10.5S40 18 43 24c-3 6-7.5 10.5-13.5 10.5S17 31 13 24z" fill={W} />
      <path d="M14.5 24L5 15.5v17z" fill={W} />
      <path d="M31 17.5c-2 4-2 9 0 13" fill="none" stroke={ink} strokeOpacity="0.35" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="36.5" cy="22" r="1.5" fill={ink} />
    </g>
  ),
  turbine: (ink) => (
    <g>
      <path d="M22.4 42.5L23.3 18h1.4l.9 24.5z" fill={W} />
      {[10, 130, 250].map((a) => (
        <path key={a} d="M24 17c-1.6-3-2-9-.4-14.5.9-.6 1.6-.4 1.9.4.9 4.4.6 10.2-1.5 14.1z" fill={W} transform={`rotate(${a} 24 17)`} />
      ))}
      <circle cx="24" cy="17" r="2.4" fill={W} />
      <circle cx="24" cy="17" r="1" fill={ink} />
      <path d="M14 42.6h20" {...line(2)} />
    </g>
  ),
  snowflake: () => (
    <g>
      {Array.from({ length: 6 }, (_, k) => {
        const a = k * 60 - 90;
        const [x1, y1] = polar(a, 16.5);
        const [bx, by] = polar(a, 10);
        const [l1x, l1y] = polar(a - 28, 13.6);
        const [l2x, l2y] = polar(a + 28, 13.6);
        return (
          <g key={k}>
            <path d={`M24 24L${x1} ${y1}`} {...line(2.4)} />
            <path d={`M${l1x} ${l1y}L${bx} ${by}L${l2x} ${l2y}`} {...line(2)} />
          </g>
        );
      })}
      <circle cx="24" cy="24" r="2.6" fill={W} />
    </g>
  ),
  crystal: (ink) => (
    <g>
      <path d="M11 19.5l6.5-9h13l6.5 9-13 20z" fill={W} />
      <path d="M11 19.5h26M17.5 10.5l6.5 9 6.5-9M24 19.5v20M17.5 19.5L24 39.5l6.5-20" fill="none" stroke={ink} strokeOpacity="0.35" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M40 7v5M37.5 9.5h5M8 36v3.6M6.2 37.8h3.6" {...line(1.4, 0.8)} />
    </g>
  ),
  stupa: (ink) => (
    <g fill={W}>
      <path d="M23.3 5.5h1.4l.8 9.5h-3z" />
      <rect x="20.5" y="14.6" width="7" height="3" rx="0.8" />
      <path d="M14.5 29c0-6.2 4.2-11 9.5-11s9.5 4.8 9.5 11z" />
      <rect x="11.5" y="29.6" width="25" height="3.2" rx="1" />
      <rect x="8.5" y="33.6" width="31" height="3.2" rx="1" />
      <rect x="5.5" y="37.6" width="37" height="3.2" rx="1" />
      <path d="M21.8 33.6h4.4v7.2h-4.4z" fill={ink} fillOpacity="0.35" />
      <path d="M18.6 25.4a6 6 0 0 1 3-4.6" stroke={ink} strokeOpacity="0.3" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </g>
  ),
  hornbill: (ink) => (
    <g>
      <path
        d="M7.5 37c0-9 5.4-15.6 12.6-17 3-.6 6 .1 8.2 1.6l2.6-2c3.6-2.6 8.4-2.9 12.6-.8-2.6.4-5 1.4-7 3 3.4-.2 6.4.6 8.6 2.4-5.4.4-9.6 1.2-13 3.2-2 4.8-6 8.4-11 10L17.5 42h-9z"
        fill={W}
      />
      <circle cx="24.5" cy="24.8" r="1.4" fill={ink} />
      <path d="M30.4 23.6c3-1.4 6.5-2 10-1.8" fill="none" stroke={ink} strokeOpacity="0.35" strokeWidth="1.1" strokeLinecap="round" />
    </g>
  ),
  turtle: (ink) => (
    <g>
      <g fill={W}>
        <ellipse cx="24" cy="25" rx="10" ry="12.5" />
        <ellipse cx="24" cy="9.8" rx="3.4" ry="3.8" />
        <path d="M15.5 18c-4-2.6-8-2.8-11-1.4 2.6 2.4 6 4 10 4.2z" />
        <path d="M32.5 18c4-2.6 8-2.8 11-1.4-2.6 2.4-6 4-10 4.2z" />
        <path d="M16.5 33c-3 1.4-5 3.6-5.6 6.4 2.8-.4 5.4-2 7.2-4.4z" />
        <path d="M31.5 33c3 1.4 5 3.6 5.6 6.4-2.8-.4-5.4-2-7.2-4.4z" />
        <path d="M24 37.2l-1.4 4.3h2.8z" />
      </g>
      <path
        d="M24 19l4.4 2.6v5L24 29.2l-4.4-2.6v-5zM24 13.6V19M28.4 21.6l4.6-2.4M28.4 26.6l4.4 2.8M24 29.2v6.6M19.6 26.6l-4.4 2.8M19.6 21.6l-4.6-2.4"
        fill="none"
        stroke={ink}
        strokeOpacity="0.35"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </g>
  ),
  terraces: (ink) => (
    <g>
      <path d="M5 40.5C9 28 16 17 24 11c8 6 15 17 19 29.5z" fill={W} />
      <path
        d="M19.4 15.8c3 1 6.2 1 9.2 0M15.6 21c5.4 1.6 11.4 1.6 16.8 0M12.4 26.4c7.4 2 15.8 2 23.2 0M9.8 31.8c9.2 2.4 19.2 2.4 28.4 0M7.6 37c10.6 2.6 22.2 2.6 32.8 0"
        fill="none"
        stroke={ink}
        strokeOpacity="0.4"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <circle cx="37.5" cy="9.5" r="3.2" fill={W} />
    </g>
  ),
};

/** Network colours for route emblems, after the GB 5768 sign scheme (red national, amber territorial). */
export const ROUTE_COLORS: Record<string, string> = {
  national_expressway: "#E5484D",
  territorial_expressway: "#F0A020",
  territorial_highway: "#F0A020",
  intercity_rail: "#5B6B8C",
  freight_rail: "#8C6B4A",
};

export const TERRITORY_COLOR = "#2BB3A3";
