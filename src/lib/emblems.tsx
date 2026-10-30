import type { ReactNode } from "react";

/**
 * Emblem artwork. A division or route names a motif (the central glyph) and a pattern (the
 * engraved background texture) in its source YAML; colours come from the entity's `color`.
 * Glyphs are drawn in white on a 48×48 box; `ink` is a dark tone of the emblem colour used
 * for cut-outs and details.
 */

const W = "#fff";
const line = (width: number, opacity = 1) =>
  ({ fill: "none", stroke: W, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round", strokeOpacity: opacity }) as const;

const polar = (deg: number, r: number, cx = 24, cy = 24): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

/** Clockwise arc (screen space) from angle a0 to a1 with an arrowhead at the end. */
function arcArrow(a0: number, a1: number, r: number, width: number, key?: string) {
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0;
  const t = ((a1 + 90) * Math.PI) / 180;
  const [dx, dy] = [Math.cos(t), Math.sin(t)];
  const [nx, ny] = [-dy, dx];
  const h = width * 1.5;
  const tip = [x1 + dx * h * 1.1, y1 + dy * h * 1.1];
  const b1 = [x1 - dx * h * 0.4 + nx * h, y1 - dy * h * 0.4 + ny * h];
  const b2 = [x1 - dx * h * 0.4 - nx * h, y1 - dy * h * 0.4 - ny * h];
  return (
    <g key={key}>
      <path d={`M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}`} {...line(width)} />
      <path d={`M${tip.join(" ")}L${b1.join(" ")}L${b2.join(" ")}Z`} fill={W} />
    </g>
  );
}

function gearPath(teeth: number, outer: number, inner: number) {
  const step = 360 / teeth;
  const pts: [number, number][] = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step - 90;
    pts.push(polar(a - step * 0.34, inner), polar(a - step * 0.2, outer), polar(a + step * 0.2, outer), polar(a + step * 0.34, inner));
  }
  return `M${pts.map((p) => p.map((v) => v.toFixed(2)).join(" ")).join("L")}Z`;
}

export const MOTIFS: Record<string, (ink: string) => ReactNode> = {
  capitol: (ink) => (
    <g fill={W}>
      <rect x="23.2" y="9.5" width="1.6" height="6.5" rx="0.8" />
      <circle cx="24" cy="9" r="1.7" />
      <path d="M15 24.5a9 9 0 0 1 18 0z" />
      <path d="M19 22.6a5.6 5.6 0 0 1 3.4-4" stroke={ink} strokeOpacity="0.35" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <rect x="12.5" y="24.6" width="23" height="3" rx="1" />
      {[16, 20, 24, 28, 32].map((x) => (
        <rect key={x} x={x - 1.15} y="28.8" width="2.3" height="6.4" rx="0.6" />
      ))}
      <rect x="10.5" y="36.2" width="27" height="3" rx="1" />
    </g>
  ),
  longship: (ink) => (
    <g>
      <rect x="23" y="7.5" width="2" height="20" rx="1" fill={W} />
      <path d="M14.5 10.5h19l-1.6 13h-15.8z" fill={W} />
      <path d="M20.3 11v12M27.7 11v12" stroke={ink} strokeOpacity="0.45" strokeWidth="1.6" />
      <path d="M6.5 27.5h35c-2.3 6-8.2 9-17.5 9s-15.2-3-17.5-9z" fill={W} />
      <path d="M6.5 27.5c-1.6-3.4-.6-6.7 2.6-7.6M41.5 27.5c1.6-3.4.6-6.7-2.6-7.6" {...line(2.4)} />
      {[13, 18.5, 24, 29.5, 35].map((x) => (
        <circle key={x} cx={x} cy="30.6" r="1.7" fill={ink} fillOpacity="0.45" />
      ))}
    </g>
  ),
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
  ox: (ink) => (
    <g>
      <path d="M17.5 19.5c-4.6-.4-7.2-3.4-7.5-8.2M30.5 19.5c4.6-.4 7.2-3.4 7.5-8.2" {...line(3.2)} />
      <ellipse cx="13.6" cy="22.6" rx="3.8" ry="2.1" transform="rotate(22 13.6 22.6)" fill={W} />
      <ellipse cx="34.4" cy="22.6" rx="3.8" ry="2.1" transform="rotate(-22 34.4 22.6)" fill={W} />
      <path d="M17 18.4h14c.9 0 1.6.7 1.5 1.6l-1 9.2C30.9 34.9 27.8 38.5 24 38.5s-6.9-3.6-7.5-9.3l-1-9.2c-.1-.9.6-1.6 1.5-1.6z" fill={W} />
      <circle cx="20.3" cy="24.6" r="1.35" fill={ink} />
      <circle cx="27.7" cy="24.6" r="1.35" fill={ink} />
      <ellipse cx="24" cy="33.2" rx="5" ry="3.3" fill={ink} fillOpacity="0.22" />
      <circle cx="22" cy="33.3" r="0.95" fill={ink} />
      <circle cx="26" cy="33.3" r="0.95" fill={ink} />
    </g>
  ),
  peaks: (ink) => (
    <g>
      <path d="M4.5 38.5L18 14.5l7.2 11.8 4.6-6.6 13.7 18.8z" fill={W} />
      <path d="M14.2 21.6l2.2 1.4 1.6-1.8 1.8 2 2.2-1" fill="none" stroke={ink} strokeOpacity="0.5" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M29.8 19.7l-2.2 3.2" stroke={ink} strokeOpacity="0.3" strokeWidth="1.2" />
    </g>
  ),
  skyline: (ink) => (
    <g>
      <g fill={W}>
        <rect x="7.5" y="26" width="6" height="12.5" rx="1" />
        <rect x="15" y="18" width="7" height="20.5" rx="1" />
        <rect x="23.6" y="10" width="6.6" height="28.5" rx="1" />
        <rect x="26.25" y="5" width="1.3" height="5.5" rx="0.6" />
        <rect x="31.8" y="21" width="6" height="17.5" rx="1" />
        <rect x="39.3" y="28" width="4" height="10.5" rx="1" />
        <rect x="5.5" y="39.4" width="37" height="1.8" rx="0.9" />
      </g>
      <g fill={ink} fillOpacity="0.32">
        {[14, 18, 22, 26, 30].map((y) => (
          <rect key={y} x="25.4" y={y} width="3" height="1.6" rx="0.4" />
        ))}
        {[22, 26.5, 31].map((y) => (
          <rect key={y} x="17" y={y} width="3" height="1.6" rx="0.4" />
        ))}
        {[25, 29.5].map((y) => (
          <rect key={y} x="33.4" y={y} width="2.8" height="1.6" rx="0.4" />
        ))}
      </g>
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
  gear: (ink) => (
    <g>
      <path d={gearPath(9, 15, 11.6)} fill={W} />
      <circle cx="24" cy="24" r="7.6" fill="none" stroke={ink} strokeOpacity="0.22" strokeWidth="1.4" />
      <circle cx="24" cy="24" r="4.4" fill={ink} />
    </g>
  ),
  exchange: () => (
    <g>
      {arcArrow(200, 322, 12.5, 2.6, "a")}
      {arcArrow(20, 142, 12.5, 2.6, "b")}
      <path d="M24 18.5l5.5 5.5-5.5 5.5-5.5-5.5z" fill={W} />
    </g>
  ),
  basin: () => (
    <g>
      <path d="M4.5 24.5l7-9.5 5 5.4 7.3-9.6 7 8.4 5-5.2 7.7 10.5" {...line(2.4)} />
      <path d="M8 28c4 9 9.5 12.5 16 12.5S36 37 40 28" {...line(2.3)} />
      <path d="M13.8 29.5c2.7 5.3 6 7.4 10.2 7.4s7.5-2.1 10.2-7.4" {...line(2, 0.8)} />
      <path d="M19.4 31c1.4 2.3 2.8 3.1 4.6 3.1s3.2-.8 4.6-3.1" {...line(1.8, 0.65)} />
    </g>
  ),
  river: () => (
    <g>
      <path d="M5 17c5-5 9-5 13.5 0s8.5 5 13.5 0 7.5-4.5 11-2" {...line(3.2)} />
      <path d="M5 25.5c5-5 9-5 13.5 0s8.5 5 13.5 0 7.5-4.5 11-2" {...line(2.5, 0.85)} />
      <path d="M5 34c5-5 9-5 13.5 0s8.5 5 13.5 0 7.5-4.5 11-2" {...line(1.9, 0.7)} />
    </g>
  ),
  ring: () => (
    <g>
      {arcArrow(-58, 248, 14.5, 2.8)}
      <path d="M16.8 22.4c1-4.2 6-6.3 10.2-4.6s6.6 4.2 5.5 8.2-5.6 6.2-9.6 5.2-7.2-4.6-6.1-8.8z" fill={W} />
    </g>
  ),
  pass: (ink) => (
    <g>
      <path d="M3.5 39L16 11.5l9 18.5-2.6 9z" fill={W} />
      <path d="M44.5 39L32 11.5 23 30l2.6 9z" fill={W} fillOpacity="0.88" />
      <path d="M18.8 39.2l4.4-9.6h1.6l4.4 9.6z" fill={ink} fillOpacity="0.55" />
      <path d="M24 31.6v6.6" stroke={W} strokeWidth="1" strokeDasharray="1.6 1.4" />
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
  helm: (ink) => (
    <g>
      {Array.from({ length: 8 }, (_, k) => {
        const [x0, y0] = polar(k * 45, 4);
        const [x1, y1] = polar(k * 45, 16);
        const [hx, hy] = polar(k * 45, 17.4);
        return (
          <g key={k}>
            <path d={`M${x0} ${y0}L${x1} ${y1}`} {...line(2.2)} />
            <circle cx={hx} cy={hy} r="2.2" fill={W} />
          </g>
        );
      })}
      <circle cx="24" cy="24" r="11" {...line(3)} />
      <circle cx="24" cy="24" r="4.4" fill={W} />
      <circle cx="24" cy="24" r="1.7" fill={ink} />
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
  star: (ink) => {
    const pts = Array.from({ length: 10 }, (_, k) => polar(k * 36 - 90, k % 2 ? 6.8 : 15.5, 24, 25));
    return (
      <g>
        <path d={`M${pts.map((p) => p.map((v) => v.toFixed(2)).join(" ")).join("L")}Z`} fill={W} />
        <circle cx="24" cy="25" r="2" fill={ink} fillOpacity="0.4" />
        <path d="M39 6v6M36 9h6M9 37v4M7 39h4" {...line(1.4, 0.8)} />
      </g>
    );
  },
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
  polar_bear: (ink) => (
    <g>
      <path
        d="M5.5 29.5c0-5.6 4.6-9.5 11-9.5h11.2c2.6-2.6 5.6-3.6 8.6-2.8l2.6.8c1.9.6 3 1.9 3.2 3.4l.2 1.2-2.4 1.3h-3.2c-1 1.7-1.7 3.6-1.7 6v8.6h-3.8l-.7-6.2c-1.9.9-4 1.4-6.3 1.4l-.9 4.8h-3.8l.1-5.3c-1.8-.6-3.2-1.6-4.2-3l-2.4 8.3H9.2l1.2-9.4c-1.8-1.2-3.4-2.4-4.3-3.6-.4-.6-.6-1.3-.6-2z"
        fill={W}
      />
      <circle cx="37.6" cy="20.2" r="1.05" fill={ink} />
      <path d="M8.5 40.8h31" {...line(1.6, 0.6)} />
    </g>
  ),
  dome: (ink) => (
    <g>
      <path d="M7.5 34a16.5 16.5 0 0 1 33 0z" fill={W} />
      <g fill="none" stroke={ink} strokeOpacity="0.4" strokeWidth="1.2">
        <path d="M24 17.6V34M15.6 34a8.4 16.4 0 0 1 16.8 0M10 26.5h28M8.6 30.5h30.8M13.3 22h21.4" />
      </g>
      <rect x="5.5" y="34.6" width="37" height="3" rx="1" fill={W} />
      <path d="M24 9.5v4M20 11.5h8" {...line(1.6, 0.8)} />
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
  drum: (ink) => (
    <g>
      <circle cx="21" cy="20.5" r="13" fill={W} />
      <circle cx="21" cy="20.5" r="10.6" fill="none" stroke={ink} strokeOpacity="0.28" strokeWidth="1.2" />
      <path d="M21 33.5v9" {...line(3.2)} />
      <path d="M31.5 31.5l9.5 7.5" {...line(2.4)} />
      <circle cx="41.4" cy="39.3" r="1.9" fill={W} />
    </g>
  ),
  palm: () => (
    <g>
      <path d="M24.5 41.5c1-8 .6-15-1.8-21.5" {...line(2.6)} />
      <g fill={W}>
        <path d="M23 19c-4-4-10-5-15-2.5 5 0 9 1.5 12 4.5z" />
        <path d="M23 19c4-4 10-5 15-2.5-5 0-9 1.5-12 4.5z" />
        <path d="M23 19c-2-5.5-7-9-12.5-9.5 4.5 2 7.6 5 9.6 9z" />
        <path d="M23 19c2-5.5 7-9 12.5-9.5-4.5 2-7.6 5-9.6 9z" />
        <path d="M23 19c-.4-5 1-9.6 3.5-12.5-.8 4-.9 8 .1 12z" />
        <circle cx="21.6" cy="21.2" r="1.5" />
        <circle cx="24.7" cy="21.6" r="1.5" />
      </g>
      <path d="M10 42.5h28" {...line(1.8, 0.7)} />
    </g>
  ),
  lotus: (ink) => (
    <g>
      <g fill={W}>
        <path d="M24 11.5c3.6 4 5 8.8 4.2 13.6-1 4.8-2.6 7.4-4.2 9-1.6-1.6-3.2-4.2-4.2-9-.8-4.8.6-9.6 4.2-13.6z" />
        <path d="M10 19.5c5 .6 9 3.2 11.4 7.6 1.6 3.2 2 5.6 2.2 7.6-3.6-.2-7.6-1.6-10.4-5-2.2-2.7-3.2-6.2-3.2-10.2z" />
        <path d="M38 19.5c-5 .6-9 3.2-11.4 7.6-1.6 3.2-2 5.6-2.2 7.6 3.6-.2 7.6-1.6 10.4-5 2.2-2.7 3.2-6.2 3.2-10.2z" />
        <path d="M5 29.5c4.8-.6 9.6.8 14 4.6.8.7 1 1 1.2 1.4-5 .4-10.6-.6-15.2-6z" />
        <path d="M43 29.5c-4.8-.6-9.6.8-14 4.6-.8.7-1 1-1.2 1.4 5 .4 10.6-.6 15.2-6z" />
      </g>
      <path d="M24 16.5v13" stroke={ink} strokeOpacity="0.3" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 40h32" {...line(2)} />
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
  chip: (ink) => (
    <g>
      {[16.5, 21.4, 26.6, 31.5].map((p) => (
        <path key={p} d={`M${p} 13V8M${p} 35v5M13 ${p}H8M35 ${p}h5`} {...line(2)} />
      ))}
      <rect x="13" y="13" width="22" height="22" rx="2.4" fill={W} />
      <rect x="18.5" y="18.5" width="11" height="11" rx="1.2" fill="none" stroke={ink} strokeOpacity="0.4" strokeWidth="1.3" />
    </g>
  ),
};

/** Background textures on the 64×64 emblem box. */
export const PATTERNS: Record<string, () => ReactNode> = {
  rays: () =>
    Array.from({ length: 17 }, (_, k) => {
      const a = ((-180 + k * 11.25) * Math.PI) / 180;
      return <path key={k} d={`M32 30L${32 + 80 * Math.cos(a)} ${30 + 80 * Math.sin(a)}`} stroke={W} strokeWidth="1.6" />;
    }).concat(
      Array.from({ length: 16 }, (_, k) => {
        const a = ((k * 11.25 + 5.6) * Math.PI) / 180;
        return <path key={`b${k}`} d={`M32 30L${32 + 80 * Math.cos(a)} ${30 + 80 * Math.sin(a)}`} stroke={W} strokeWidth="1.6" />;
      }),
    ),
  waves: () =>
    Array.from({ length: 11 }, (_, k) => {
      const y = 4 + k * 6;
      let d = `M-4 ${y}`;
      for (let x = -4; x < 68; x += 8) d += `q4 -2.6 8 0`;
      return <path key={k} d={d} fill="none" stroke={W} strokeWidth="1.1" />;
    }),
  dots: () =>
    Array.from({ length: 13 * 13 }, (_, k) => {
      const i = k % 13;
      const j = Math.floor(k / 13);
      return <circle key={k} cx={2 + i * 5 + (j % 2) * 2.5} cy={2 + j * 5} r="0.85" fill={W} />;
    }),
  furrows: () =>
    Array.from({ length: 16 }, (_, k) => {
      const y = -6 + k * 5;
      return <path key={k} d={`M-6 ${y + 10}Q32 ${y - 8} 70 ${y + 10}`} fill="none" stroke={W} strokeWidth="1.2" />;
    }),
  stripes: () =>
    Array.from({ length: 12 }, (_, k) => <rect key={k} x={k * 6 - 1} y="-4" width="2.6" height="72" fill={W} />),
  contours: () =>
    Array.from({ length: 10 }, (_, k) => (
      <ellipse key={k} cx="44" cy="46" rx={6 + k * 6.5} ry={4.5 + k * 5} fill="none" stroke={W} strokeWidth="1" transform="rotate(-18 44 46)" />
    )),
  grid: () =>
    Array.from({ length: 12 }, (_, k) => (
      <g key={k} stroke={W} strokeWidth="0.8">
        <path d={`M${k * 6} -4V68`} />
        <path d={`M-4 ${k * 6}H68`} />
      </g>
    )),
  halo: () =>
    Array.from({ length: 9 }, (_, k) => <circle key={k} cx="32" cy="30" r={9 + k * 5} fill="none" stroke={W} strokeWidth="1.1" />),
  hex: () => {
    const s = 4.2;
    const h = s * Math.sqrt(3);
    const cells: ReactNode[] = [];
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 10; i++) {
        const cx = i * s * 1.5;
        const cy = j * h + (i % 2 ? h / 2 : 0);
        const pts = Array.from({ length: 6 }, (_, k) => polar(k * 60, s * 0.92, cx, cy).map((v) => v.toFixed(2)).join(" "));
        cells.push(<path key={`${i}-${j}`} d={`M${pts.join("L")}Z`} fill="none" stroke={W} strokeWidth="0.8" />);
      }
    return cells;
  },
  diagonal: () => Array.from({ length: 20 }, (_, k) => <path key={k} d={`M${k * 7 - 64} 68L${k * 7 + 4} 0`} stroke={W} strokeWidth="1.5" />),
  flow: () =>
    Array.from({ length: 10 }, (_, k) => {
      const y = 2 + k * 7;
      return <path key={k} d={`M-4 ${y}C14 ${y - 8} 26 ${y + 8} 44 ${y}S62 ${y - 6} 70 ${y}`} fill="none" stroke={W} strokeWidth="1.2" />;
    }),
  ice: () =>
    [0, 60, 120].map((deg) => (
      <g key={deg} transform={`rotate(${deg} 32 32)`} stroke={W} strokeWidth="0.8">
        {Array.from({ length: 19 }, (_, k) => (
          <path key={k} d={`M-40 ${-38 + k * 7.8}H104`} />
        ))}
      </g>
    )),
  aurora: () =>
    Array.from({ length: 9 }, (_, k) => {
      const x = -6 + k * 9;
      return (
        <path key={k} d={`M${x} -4C${x + 10} 10 ${x - 6} 22 ${x + 4} 36S${x + 2} 56 ${x + 8} 70`} fill="none" stroke={W} strokeWidth={k % 2 ? 1 : 1.6} strokeOpacity={k % 3 ? 0.8 : 1} />
      );
    }),
  weave: () =>
    Array.from({ length: 64 }, (_, k) => {
      const [i, j] = [k % 8, Math.floor(k / 8)];
      const [x, y] = [i * 8, j * 8];
      const d = (i + j) % 2 ? `M${x + 1} ${y + 2.6}h6M${x + 1} ${y + 5.4}h6` : `M${x + 2.6} ${y + 1}v6M${x + 5.4} ${y + 1}v6`;
      return <path key={k} d={d} stroke={W} strokeWidth="1.1" strokeLinecap="round" />;
    }),
  fronds: () =>
    Array.from({ length: 6 }, (_, k) => {
      const y = 2 + k * 12;
      let d = `M-4 ${y}H68`;
      for (let x = -2; x < 68; x += 5) d += `M${x} ${y}l3.4 -4.6M${x} ${y}l3.4 4.6`;
      return <path key={k} d={d} fill="none" stroke={W} strokeWidth="1" strokeLinecap="round" />;
    }),
};

function channel(hex: string) {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

/** Mix a #RRGGBB colour towards white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number) {
  const target = amount > 0 ? 255 : 0;
  const a = Math.abs(amount);
  return `#${channel(hex)
    .map((c) => Math.round(c + (target - c) * a).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = channel(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Network colours for route emblems, after the GB 5768 sign scheme (red national, amber territorial). */
export const ROUTE_COLORS: Record<string, string> = {
  national_expressway: "#E5484D",
  territorial_expressway: "#F0A020",
  territorial_highway: "#F0A020",
  intercity_rail: "#5B6B8C",
  freight_rail: "#8C6B4A",
};

export const TERRITORY_COLOR = "#2BB3A3";
