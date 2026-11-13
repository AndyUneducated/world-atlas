import type { ReactNode } from "react";
import { MOTIFS } from "./emblems";

/**
 * Flag charges: the symbols on city flags, drawn in white on a 48×48 box like the emblem motifs.
 * `cut` is drawn where the field shows through; a flag paints the white in the charge's tincture.
 */

const W = "#fff";
const stroke = (width: number) => ({ fill: "none", stroke: W, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round" }) as const;

const polar = (deg: number, r: number, cx = 24, cy = 24): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

function starPath(n: number, outer: number, inner: number, cx = 24, cy = 24, turn = -90) {
  const pts = Array.from({ length: n * 2 }, (_, k) => polar(turn + (k * 180) / n, k % 2 ? inner : outer, cx, cy));
  return `M${pts.map((p) => p.map((v) => v.toFixed(2)).join(" ")).join("L")}Z`;
}

function hammer(angle: number) {
  return (
    <g transform={`rotate(${angle} 24 24)`}>
      <rect x="22.6" y="9" width="2.8" height="31" rx="1.2" fill={W} />
      <path d="M16 6.5h16l-1.2 6.5H17.2z" fill={W} />
    </g>
  );
}

const NEW: Record<string, (cut: string) => ReactNode> = {
  star8: () => <path d={starPath(8, 17, 7.4)} fill={W} />,
  star4: () => (
    <g fill={W}>
      <path d={starPath(4, 18, 4.2)} />
      <path d={starPath(4, 9, 2.6, 24, 24, -45)} />
    </g>
  ),
  /** A longship's stem rising into a dragon's head, maned down the neck, with the shield row along the hull. */
  prow: (cut) => (
    <g>
      <path d="M2.5 33.5H24c4.4 0 7-2.6 7-7V18h7.5v9c0 8.6-6 14.5-14.5 14.5H5.5z" fill={W} />
      <path d="M31 18.5C30.6 11.6 32.6 7.4 37 6.2l10 .9-6.2 2.7 5.8 3.6-7.6-.6c-.8 1.8-.8 3.8-.5 5.7z" fill={W} />
      <path d="M33.6 7.2l-3.4-4.8 5.4 3.6z" fill={W} />
      <circle cx="37.6" cy="9.1" r="1" fill={cut} />
      <path d="M31 22.5h7.5M31 27h7.2" stroke={cut} strokeWidth="0.9" />
      {[7.5, 13.5, 19.5, 25.3].map((x) => (
        <g key={x}>
          <circle cx={x} cy="37.4" r="2.5" fill={cut} />
          <circle cx={x} cy="37.4" r="0.8" fill={W} />
        </g>
      ))}
    </g>
  ),
  /** Two longship steering oars crossed, blades down. */
  rudder: (cut) => {
    const oar = (angle: number) => (
      <g transform={`rotate(${angle} 24 24)`}>
        <rect x="22.7" y="2.5" width="2.6" height="28" rx="1.2" fill={W} />
        <path d="M24 24.5c3.8 1.6 4.8 6.6 4.5 11.2-.3 4-1.8 7-4.5 8.3-2.7-1.3-4.2-4.3-4.5-8.3-.3-4.6.7-9.6 4.5-11.2z" fill={W} />
        <path d="M24 29v11" stroke={cut} strokeWidth="0.9" strokeLinecap="round" />
        <path d="M20.6 6.5h6.8" stroke={W} strokeWidth="2.6" strokeLinecap="round" />
      </g>
    );
    return (
      <g>
        {oar(-34)}
        <g transform="rotate(34 24 24)">
          <rect x="21.7" y="2.5" width="4.6" height="28" fill={cut} />
        </g>
        {oar(34)}
      </g>
    );
  },
  /** A Tavrunaq frame drum held up by its handle, seen from a little below its rim, a stepped diamond painted on the skin. */
  frame_drum: (cut) => (
    <g>
      <path d="M5 17v4.5a19 12 0 0 0 38 0V17z" fill={W} />
      <ellipse cx="24" cy="17" rx="19" ry="12" fill={W} />
      <ellipse cx="24" cy="17" rx="19" ry="12" fill="none" stroke={cut} strokeWidth="1.1" />
      <ellipse cx="24" cy="17" rx="15.6" ry="9.4" fill="none" stroke={cut} strokeWidth="1" />
      <path d="M24 10.2L32.6 17 24 23.8 15.4 17z" fill={cut} />
      <path d="M24 13.4L28.6 17 24 20.6 19.4 17z" fill={W} />
      <path d="M24 15.6L25.8 17 24 18.4 22.2 17z" fill={cut} />
      <rect x="21.8" y="32" width="4.4" height="12.5" rx="1.6" fill={W} />
      <path d="M21.8 35.4h4.4M21.8 37.8h4.4" stroke={cut} strokeWidth="0.9" />
      <path d="M34 45l9.5-11.5" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="43.8" cy="33.2" r="2.3" fill={W} />
    </g>
  ),
  /** Houses standing in a ring round a round green: the commune's ring of homes and its assembly ground. */
  ring_homes: (cut) => (
    <g>
      {Array.from({ length: 8 }, (_, k) => {
        const [x, y] = polar(k * 45 - 90, 16.5);
        return (
          <g key={k} transform={`translate(${(x - 24).toFixed(2)} ${(y - 24).toFixed(2)})`}>
            <path d="M20.2 27.6v-4.8L24 19.4l3.8 3.4v4.8z" fill={W} />
            <rect x="23" y="24.6" width="2" height="3" fill={cut} />
          </g>
        );
      })}
      <circle cx="24" cy="24" r="7.4" fill="none" stroke={W} strokeWidth="2" />
      <circle cx="24" cy="24" r="3.2" fill={W} />
    </g>
  ),
  /** An observatory: a domed drum with its shutter open. */
  observatory: (cut) => (
    <g>
      <path d="M10 28a14 14 0 0 1 28 0z" fill={W} />
      <rect x="12" y="29.5" width="24" height="11" fill={W} />
      <path d="M21.8 14.2h4.4V28h-4.4z" fill={cut} />
      <rect x="21.5" y="33" width="5" height="7.5" fill={cut} />
      <path d="M5 43h38" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  ),
  /** Three salt crystals, cubes seen from a corner. */
  salt: (cut) => (
    <g>
      {[
        [24, 13.5],
        [14.5, 30],
        [33.5, 30],
      ].map(([x, y]) => (
        <g key={x}>
          <path d={`M${x} ${y - 9}l8.2 4.7v9.6L${x} ${y + 9.9}l-8.2-4.7v-9.6z`} fill={W} />
          <path d={`M${x - 8.2} ${y - 4.3}L${x} ${y + 0.4}l8.2-4.7M${x} ${y + 0.4}v9.5`} fill="none" stroke={cut} strokeWidth="1.3" strokeLinejoin="round" />
        </g>
      ))}
    </g>
  ),
  /** Steam rising from a spring. */
  steam: () => (
    <g>
      {[15, 24, 33].map((x, i) => (
        <path key={x} d={`M${x} 29c-3.4-3.6-3.4-6.6 0-9.6s3.4-6.2 0-9.8`} {...stroke(i === 1 ? 3 : 2.6)} transform={i === 1 ? "translate(0 -2.5)" : undefined} />
      ))}
      <path d="M5.5 35.5c3.1-2.4 6.2-2.4 9.3 0s6.2 2.4 9.2 0 6.2-2.4 9.2 0 6.2 2.4 9.3 0" {...stroke(2.6)} />
      <path d="M11 41.5c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.4 0 4.4-1.6 6.4 0 4.4 1.6 6.6 0" {...stroke(2.2)} />
    </g>
  ),
  /** Basalt columns, the sea cliff of a lava shore. */
  basalt: (cut) => (
    <g>
      {[
        [6.5, 22],
        [14.5, 13],
        [22.5, 7.5],
        [30.5, 15],
        [38.5, 24.5],
      ].map(([x, top]) => (
        <path key={x} d={`M${x} ${top + 2}l3.5-2 3.5 2V41h-7z`} fill={W} />
      ))}
      <path d="M4 42h40" stroke={W} strokeWidth="2" strokeLinecap="round" />
      {[22, 13, 7.5, 15, 24.5].map((top, i) => (
        <path key={i} d={`M${6.5 + i * 8} ${top + 7}h7`} stroke={cut} strokeWidth="1.1" />
      ))}
    </g>
  ),
  /** A whale's flukes rising from the sea. */
  whaletail: () => (
    <g>
      <path
        d="M24 31.5c-1-5.6-2.6-10.6-6-13.6-3.4-3-8.6-3.8-13.5-2.2 1.4-3.6 5.4-6.6 10.2-6.6 4.6 0 7.8 2.6 9.3 6.4 1.5-3.8 4.7-6.4 9.3-6.4 4.8 0 8.8 3 10.2 6.6-4.9-1.6-10.1-.8-13.5 2.2-3.4 3-5 8-6 13.6z"
        fill={W}
      />
      <path d="M21.6 27h4.8l.6 8h-6z" fill={W} />
      <path d="M5 37.5c3.2-2.4 6.4-2.4 9.6 0s6.2 2.4 9.4 0 6.2-2.4 9.4 0 6.4 2.4 9.6 0" {...stroke(2.4)} />
    </g>
  ),
  /** A kayak and its paddler on the swell. */
  kayak: () => (
    <g>
      <path d="M3.5 29.5c6.5 2.4 13.4 3.4 20.5 3.4s14-1 20.5-3.4c-6-3-13-4.4-20.5-4.4S9.5 26.5 3.5 29.5z" fill={W} />
      <circle cx="24" cy="15" r="3.2" fill={W} />
      <path d="M20.2 26.5c0-5 1.6-7.8 3.8-7.8s3.8 2.8 3.8 7.8z" fill={W} />
      <path d="M11 31L37 14" {...stroke(2)} />
      <path d="M8.2 32.8l4.6-2.9-1.2-2.7-4.8 3.1zM39.8 12.2l-4.6 2.9 1.2 2.7 4.8-3.1z" fill={W} />
      <path d="M5 39c3.2-2 6.4-2 9.6 0s6.2 2 9.4 0 6.2-2 9.4 0 6.4 2 9.6 0" {...stroke(2)} />
    </g>
  ),
  flame: (cut) => (
    <g>
      <path d="M24 4.5c2 6 9.8 10.5 11.6 18.6C37.4 31.6 31.8 41 24 41s-13.4-9.4-11.6-17.9c.9-4.4 3.6-7.4 6.4-9.8-.2 3.8.8 6.6 2.6 8.2C21.2 15.6 21.6 9.6 24 4.5z" fill={W} />
      <path d="M24 22.5c1.4 3.4 5.4 5.6 5.4 10 0 4-2.6 6.4-5.4 6.4s-5.4-2.4-5.4-6.4c0-2.6 1.4-4.4 2.8-5.6.2 1.8.8 2.8 1.6 3.4.2-2.8.2-5.4 1-7.8z" fill={cut} />
    </g>
  ),
  /** Islands on the open sea. */
  isles: () => (
    <g>
      <path d="M3.5 32.5L14 17l6.2 9 4.8-5 7 11.5z" fill={W} />
      <path d="M29.5 32.5l7.5-10 7.5 10z" fill={W} />
      <path d="M4 37c3.3-2.2 6.6-2.2 9.9 0s6.4 2.2 9.6 0 6.4-2.2 9.6 0 6.6 2.2 9.9 0" {...stroke(2.4)} />
      <path d="M10 42.5c2.3-1.4 4.6-1.4 6.9 0s4.6 1.4 7 0 4.6-1.4 6.9 0 4.6 1.4 7 0" {...stroke(1.8)} />
    </g>
  ),
  /** A hexagon round the pole star: the vault and the exchange. */
  hexstar: () => {
    const hex = Array.from({ length: 6 }, (_, k) => polar(k * 60 - 90, 18).map((v) => v.toFixed(2)).join(" "));
    return (
      <g>
        <path d={`M${hex.join("L")}Z`} {...stroke(3)} />
        <path d={starPath(4, 11.5, 3)} fill={W} />
      </g>
    );
  },
  key: (cut) => (
    <g fill={W}>
      <circle cx="24" cy="11.5" r="7.4" />
      <circle cx="24" cy="11.5" r="3.4" fill={cut} />
      <rect x="22.2" y="17.5" width="3.6" height="24" rx="1" />
      <path d="M25.8 30.5h6.8v3.8h-3.2v3h3.2v3.8h-6.8z" />
    </g>
  ),
  anvil: (cut) => (
    <g fill={W}>
      <path d="M4.5 13.5h27.5c5.8 0 9.8 1.6 11.5 4.6-4.2.4-7.6 1.8-9.6 4.6-1.6 2.4-2.6 4.4-6 4.4h-1.8v4.5h-8.2v-4.5h-2.4c-5.2 0-9-3.4-11-9.6z" />
      <path d="M13 35.5h22l2.5 5.5H10.5z" />
      <rect x="19" y="31" width="10" height="5" />
      <path d="M8 17h22" stroke={cut} strokeWidth="1.1" strokeOpacity="0.6" />
    </g>
  ),
  /** A young shoot from tilled ground. */
  sprout: () => (
    <g>
      <path d="M24 38V18" {...stroke(2.8)} />
      <path d="M24 25c-1.2-6.6-6-10.4-13.5-10.2.6 7.4 5.6 11.4 13.5 10.2z" fill={W} />
      <path d="M24 20.5c.6-7.6 5.6-12.4 14-13 0 8.2-5.2 13.2-14 13z" fill={W} />
      <path d="M6 38h36M10.5 43h27" {...stroke(2.6)} />
    </g>
  ),
  tower: (cut) => (
    <g>
      <path d="M12 42V16.5h-2V7h5v3.6h3.6V7h4.6v3.6h1.6V7h4.6v3.6h3.6V7h5v9.5h-2V42z" fill={W} />
      <path d="M19.5 42V33a4.5 4.5 0 0 1 9 0v9z" fill={cut} />
      <rect x="22.4" y="20" width="3.2" height="6" rx="1.6" fill={cut} />
      <path d="M12 16.5h24" stroke={cut} strokeWidth="1.1" />
    </g>
  ),
  /** An outrigger boat under a crab-claw sail. */
  boat: (cut) => (
    <g>
      <path d="M24 6c7.4 5.4 11.2 12.6 11.6 21.5H24.8L24 6z" fill={W} />
      <path d="M22.6 9c-4.6 5.6-7.4 11.8-8 18.5h8z" fill={W} />
      <path d="M5.5 30h37c-2.6 5-8 7.4-18.5 7.4S8.1 35 5.5 30z" fill={W} />
      <path d="M12 40.5h24" {...stroke(2.2)} />
      <path d="M15.5 37v3.5M32.5 37v3.5" {...stroke(1.6)} />
      <path d="M24 9v18.5" stroke={cut} strokeWidth="1.1" />
    </g>
  ),
  /** A pearl in an open scallop shell. */
  pearl: (cut) => {
    const n = 7;
    const at = (k: number) => -155 + (k * 130) / n;
    let d = `M${polar(at(0), 25, 24, 43).join(" ")}`;
    for (let k = 0; k < n; k++) {
      const [x, y] = polar(at(k + 1), 25, 24, 43);
      d += `A3.4 3.4 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return (
      <g>
        <path d={`${d}L24 43Z`} fill={W} />
        {Array.from({ length: n - 1 }, (_, k) => {
          const [x, y] = polar(at(k + 1), 23.5, 24, 43);
          return <path key={k} d={`M24 41L${x.toFixed(2)} ${y.toFixed(2)}`} stroke={cut} strokeWidth="1" />;
        })}
        <path d="M17.5 39.5h13l1.5 4.5H16z" fill={W} />
        <circle cx="24" cy="28" r="7.6" fill={cut} />
        <circle cx="24" cy="28" r="6.2" fill={W} />
        <path d="M20.8 25.6a3.8 3.8 0 0 1 3.4-1.9" stroke={cut} strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </g>
    );
  },
  /** A pepper vine: a sprig with its hanging cluster of berries. */
  pepper: () => (
    <g>
      <path d="M24 5c0 9-3 16-1 24s.4 12-1 14" {...stroke(2.2)} />
      <path d="M23.6 13c3.6-5.4 9.6-7 15.4-5.4-2.2 6-7.8 9-15.4 5.4z" fill={W} />
      <path d="M23 21.5c-3.8-5-9.6-6.4-15-4.6 2.4 5.6 7.8 8.4 15 4.6z" fill={W} />
      {[
        [27, 24],
        [30, 27.5],
        [26.6, 28.4],
        [29.6, 31.8],
        [26.4, 32.8],
        [28.8, 36.2],
        [26, 37.4],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" fill={W} />
      ))}
      <path d="M24 22.5c1.6.6 3 1.2 3.6 1.4" {...stroke(1.4)} />
    </g>
  ),
  /** Hammer and pick crossed, the old sign of mining. */
  mining: () => (
    <g>
      {hammer(42)}
      {hammer(-42)}
    </g>
  ),
  antlers: () => (
    <g {...stroke(2.6)}>
      <path d="M21 40c-1.4-6-4.6-10-9-13.4-3.2-2.4-4.8-6.4-4-11.6M12 26.6c-2.6-.4-5-.2-7.4.6M10 21c2-2.6 2.4-5.4 1.8-8.6M8.4 16.6c-1.6-1.6-2.4-3.6-2.4-6" />
      <path d="M27 40c1.4-6 4.6-10 9-13.4 3.2-2.4 4.8-6.4 4-11.6M36 26.6c2.6-.4 5-.2 7.4.6M38 21c-2-2.6-2.4-5.4-1.8-8.6M39.6 16.6c1.6-1.6 2.4-3.6 2.4-6" />
      <path d="M21 40h6" />
    </g>
  ),
  /** Three peaks with a star over them. */
  peaks_star: (cut) => (
    <g>
      <path d="M3.5 41L15 22.5l5 7.4 4-6.6 3.6 5.4L33 20l11.5 21z" fill={W} />
      <path d="M12.4 26.6l2.6 1.6 2-2M30.4 24.2l2.6 1.6 2.2-2" fill="none" stroke={cut} strokeWidth="1.3" strokeLinejoin="round" />
      <path d={starPath(8, 8.2, 3.5, 24, 10)} fill={W} />
    </g>
  ),
  /** Two chain links, each passing through the other. */
  links: (cut) => {
    const halo = { fill: "none", stroke: cut, strokeWidth: 8, strokeLinecap: "butt" } as const;
    const over = "M21.22 17.11A7 7 0 0 1 26.06 20.5";
    return (
      <g transform="rotate(-32 24 24)">
        <rect x="6" y="17" width="21" height="14" rx="7" {...stroke(4)} />
        <rect x="21" y="17" width="21" height="14" rx="7" {...halo} />
        <rect x="21" y="17" width="21" height="14" rx="7" {...stroke(4)} />
        <path d={over} {...halo} />
        <path d={over} {...stroke(4)} strokeLinecap="butt" />
      </g>
    );
  },
  /** A speaking trumpet with its sound going out. */
  horn: () => (
    <g>
      <path d="M5 20.5h7l19-10.5v28L12 27.5H5z" fill={W} />
      <rect x="31" y="8.5" width="4.2" height="31" rx="1.6" fill={W} />
      <path d="M13.5 27.5l3 9.5h4.4l-2-8z" fill={W} />
      <path d="M39.5 17.5c1.8 1.9 2.8 4 2.8 6.5s-1 4.6-2.8 6.5M43.5 13.5c2.8 3 4 6.4 4 10.5s-1.2 7.5-4 10.5" {...stroke(2.2)} />
    </g>
  ),
  /** Angle brackets round a slash, the sign of source code. */
  brackets: () => (
    <g {...stroke(3.8)}>
      <path d="M15 13L5 24l10 11M33 13l10 11-10 11M27.6 8.5l-7.2 31" />
    </g>
  ),
  star5: () => <path d={starPath(5, 20, 8, 24, 25.5)} fill={W} />,
  /** A plain Latin cross. */
  cross: () => <path d="M21 5h6v11h10v6H27v21h-6V22H11v-6h10z" fill={W} />,
  /** A crescent opening to the fly. */
  crescent: () => <path d="M29 7.5a17 17 0 1 0 0 33a13.4 13.4 0 1 1 0-33z" fill={W} />,
  /** A dove in flight with an olive sprig. */
  dove: () => (
    <g>
      <path d="M6 29c7 0 11-3 15-8 3-4 7-7 12-7 2.2 0 4 .8 5.2 2l4.8-.6-3 3.6c.2 7.4-5.4 13.6-13.8 14.8-6 .9-10.8-.4-14.6-2.6L7 33z" fill={W} />
      <path d="M22 21c-2-6-7-10-13-11 1 6 5 10 11 12" fill={W} />
      <path d="M41 17.5l4 2.5M44 20c-1 1.6-2.6 2.4-4 2.2M43 18.4c1.6-.8 3.2-.6 4.2.4" {...stroke(1.4)} />
    </g>
  ),
  /** The scales of justice. */
  scales: () => (
    <g>
      <path d="M24 8v32M15 42h18M9 14h30" {...stroke(2.8)} />
      <circle cx="24" cy="8" r="2.6" fill={W} />
      <path d="M9 14L4 27M9 14l5 13M39 14l-5 13M39 14l5 13" {...stroke(1.6)} />
      <path d="M3 27h12a6 6 0 0 1-12 0zM33 27h12a6 6 0 0 1-12 0z" fill={W} />
    </g>
  ),
  /** An open book. */
  book: (cut) => (
    <g>
      <path d="M24 13c-5-3-12-4-19-3v25c7-1 14 0 19 3 5-3 12-4 19-3V10c-7-1-14 0-19 3z" fill={W} />
      <path d="M24 14v23" stroke={cut} strokeWidth="1.6" />
    </g>
  ),
  /** A sickle and a hammer crossed under a star, the old sign of workers and peasants together. */
  hammer_sickle: () => (
    <g>
      <path d={starPath(5, 6, 2.4, 24, 6.8)} fill={W} />
      <path d="M15.4 37.2A12.6 12.6 0 1 1 35.8 30.6" {...stroke(3.6)} />
      <path d="M15.4 37.2L10 42.6" {...stroke(4.6)} />
      <g transform="rotate(-45 27.5 29)">
        <rect x="26.1" y="18.5" width="2.8" height="23" rx="1.2" fill={W} />
        <rect x="21" y="15" width="13" height="5.6" rx="1" fill={W} />
      </g>
    </g>
  ),
  /** A cogwheel with a hammer at its hub. */
  gear_hammer: (cut) => (
    <g>
      {Array.from({ length: 10 }, (_, k) => (
        <rect key={k} x="21.2" y="3.2" width="5.6" height="7.4" rx="1" fill={W} transform={`rotate(${k * 36} 24 24)`} />
      ))}
      <circle cx="24" cy="24" r="15.4" fill={W} />
      <circle cx="24" cy="24" r="10.6" fill={cut} />
      <g transform="rotate(40 24 24)" fill={W}>
        <rect x="22.9" y="18.6" width="2.2" height="14.4" rx="1" />
        <rect x="19" y="15.4" width="10" height="4.2" rx="0.8" />
      </g>
    </g>
  ),
  /** Nine small stars in a ring. */
  star_ring: () => (
    <g fill={W}>
      {Array.from({ length: 9 }, (_, k) => {
        const [x, y] = polar(k * 40 - 90, 18);
        return <path key={k} d={starPath(5, 3.8, 1.55, x, y)} />;
      })}
    </g>
  ),
  /** A longhouse under its sagging ridge, with crossed gable boards at each end. */
  longhouse: (cut) => (
    <g>
      <path d="M4 15Q24 21.5 44 15L41 27.5Q24 31 7 27.5Z" fill={W} />
      <path d="M9 28.4Q24 31.6 39 28.4V41H9z" fill={W} />
      <path d="M2 9.5L8.5 17.5M8 9.5L1.8 17M46 9.5l-6.5 8M40 9.5l6.2 7.5" {...stroke(2.2)} />
      <path d="M8.5 21.6Q24 26.6 39.5 21.6" stroke={cut} strokeWidth="1" fill="none" />
      <path d="M20.5 41v-6.5a3.5 3.5 0 0 1 7 0V41z" fill={cut} />
    </g>
  ),
  /** A hoe and a rifle crossed, the rifle's muzzle to the upper right and the hoe's blade to the upper left (flag of the Ranovan People's War Party) */
  hoe_rifle: () => (
    <g>
      <path d="M8.3 38.0L12.7 42.4L14.8 40.3L18.8 31.5L16.5 29.2Z" fill={W} />
      <path d="M15.9 29.3L26.1 19.1L28.5 21.5L26.1 23.9L31.1 26.8L28.9 29.6L23.6 26.4L18.6 32.1Z" fill={W} />
      <path d="M26.1 19.8L37.8 8.1L39.1 9.4L27.7 21.4Z" fill={W} />
      <path d="M35.7 10.2L36.8 9.1L35.5 7.7L34.3 8.9Z" fill={W} />
      <path d="M37.2 39.1L12.5 14.3L14.3 12.5L39.1 37.2Z" fill={W} />
      <path d="M12.8 14.7L10.0 11.8L15.5 3.5L21.2 9.2Z" fill={W} />
    </g>
  ),
  /** A dhow: a pointed hull rising a little at the stern, with a single mast carrying a great lateen sail that dips towards the bow. */
  dhow: () => (
    <g>
      <path d="M2 29L46 27L43 36Q42 38.5 39 38.5H11Q8.5 38.5 7 36.5Z" fill={W} />
      <path d="M24 6h2.4v22h-2.4z" fill={W} />
      <path d="M8 25Q24 12 40 4Q38 16 33.5 26Q21 27 8 25Z" fill={W} />
      <path d="M4 43q2.5-2 5 0t5 0t5 0t5 0t5 0t5 0t5 0t5 0v2q-2.5-2-5 0t-5 0t-5 0t-5 0t-5 0t-5 0t-5 0t-5 0z" fill={W} />
    </g>
  ),
  /** An eight-spoked wheel of the law: a round rim, a hub and eight spokes, with a round knob outside the rim at the end of each spoke. */
  dharma_wheel: () => (
    <g>
      <path d="M24 6.5A17.5 17.5 0 1 1 24 41.5A17.5 17.5 0 1 1 24 6.5ZM24 10A14 14 0 1 0 24 38A14 14 0 1 0 24 10Z" fill={W} />
      <path d="M24 19.5A4.5 4.5 0 1 1 24 28.5A4.5 4.5 0 1 1 24 19.5Z" fill={W} />
      <path d="M23 9H25V39H23ZM9 23H39V25H9ZM14.1 12.69L35.32 33.9L33.9 35.32L12.69 14.1ZM33.9 12.69L35.32 14.1L14.1 35.32L12.69 33.9Z" fill={W} />
      <path d="M21.8 4.5a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0ZM21.8 43.5a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0ZM2.3 24a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0ZM41.3 24a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0ZM35.59 10.21a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0ZM35.59 37.79a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0ZM8.01 37.79a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0ZM8.01 10.21a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0Z" fill={W} />
    </g>
  ),
  /** An upright spear with a pair of upswept zebu horns across its shaft and a collar below the head. */
  zebu_spear: () => (
    <g>
      <path d="M5 6C6 18 13 27 24 27C35 27 42 18 43 6C40 15 33 21 24 21C15 21 8 15 5 6Z" fill={W} />
      <path d="M24 2C27.4 7 28.4 11.4 26.8 15H21.2C19.6 11.4 20.6 7 24 2Z" fill={W} />
      <path d="M22.6 15H25.4V45H22.6ZM20 16.4H28V18.6H20Z" fill={W} />
    </g>
  ),
};

/** Charges of the California Autonomous State's cities. */
const CALIFORNIA: Record<string, (cut: string) => ReactNode> = {
  /** A microchip: a square die with pins on all four sides and a circuit trace on its face. */
  chip: (cut) => (
    <g>
      <rect x="12" y="12" width="24" height="24" rx="2.5" fill={W} />
      {[16, 21, 27, 32].map((v) => (
        <g key={v} fill={W}>
          <rect x={v - 1.1} y="5" width="2.2" height="7" rx="0.8" />
          <rect x={v - 1.1} y="36" width="2.2" height="7" rx="0.8" />
          <rect x="5" y={v - 1.1} width="7" height="2.2" rx="0.8" />
          <rect x="36" y={v - 1.1} width="7" height="2.2" rx="0.8" />
        </g>
      ))}
      <path d="M17 19h7v5h7M17 29h4v-5" fill="none" stroke={cut} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="31" cy="24" r="1.8" fill={cut} />
      <circle cx="17" cy="19" r="1.5" fill={cut} />
      <circle cx="17" cy="29" r="1.5" fill={cut} />
    </g>
  ),
  /** A fan palm leaning over a low sun. */
  palm: (cut) => (
    <g>
      <path d="M8 43a16 16 0 0 1 32 0z" fill={W} />
      <path d="M24.5 43C25 33 25.5 24 23.5 15" fill="none" stroke={cut} strokeWidth="5" strokeLinecap="round" />
      <path d="M24.5 43C25 33 25.5 24 23.5 15" {...stroke(2.6)} />
      {[-160, -125, -95, -60, -25].map((a) => {
        const [x, y] = polar(a, 14, 23.5, 15);
        const [mx, my] = polar(a + 18, 9, 23.5, 15);
        return <path key={a} d={`M23.5 15Q${mx.toFixed(1)} ${(my - 3).toFixed(1)} ${x.toFixed(1)} ${(y + 3).toFixed(1)}`} {...stroke(3)} />;
      })}
    </g>
  ),
  /** A bunch of grapes under a vine leaf. */
  grapes: () => (
    <g fill={W}>
      <path d="M24 13c-1-4-4-7-8-7.5 1 4 3.6 6.6 8 7.5zM24 13c1.2-4.6 5-7.6 10-8-1.2 4.8-4.8 7.6-10 8z" />
      <path d="M24 13V8" {...stroke(1.8)} />
      {[[17, 18], [24, 18], [31, 18], [20.5, 24.5], [27.5, 24.5], [17, 31], [24, 31], [31, 31], [20.5, 37.5], [27.5, 37.5], [24, 43]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y - 1} r="3.4" />
      ))}
    </g>
  ),
  /** A film clapperboard, its striped clapper raised. */
  clapper: (cut) => (
    <g>
      <rect x="7" y="20" width="34" height="22" rx="2" fill={W} />
      <path d="M6.5 17.5L39 9.5l1.4 5.6L8 23z" fill={W} />
      {[0, 1, 2, 3].map((k) => (
        <path key={k} d={`M${12 + k * 7.6} ${15.8 - k * 1.85}l4.2-1 -2.6 6.8 -4.2 1z`} fill={cut} />
      ))}
      <path d="M11 27h26M11 32h18M11 37h22" stroke={cut} strokeWidth="1.4" strokeLinecap="round" />
    </g>
  ),
  /** An oil derrick over a nodding pump. */
  derrick: (cut) => (
    <g>
      <path d="M15 42L22 6h4l7 36h-4.4l-1.2-6.5h-6.8L19.4 42zM21.4 31h5.2l-1.4-8h-2.4z" fill={W} />
      <path d="M19 18h10M17.5 26h13" stroke={W} strokeWidth="1.6" />
      <path d="M33 30l10-6" {...stroke(3)} />
      <circle cx="38" cy="27" r="2" fill={cut} />
      <path d="M2.5 43h43" {...stroke(2.4)} />
    </g>
  ),
  /** A police badge: a seven-pointed star in a ring. */
  badge: (cut) => (
    <g>
      <circle cx="24" cy="24" r="19" fill={W} />
      <circle cx="24" cy="24" r="15.5" fill={cut} />
      <path d={starPath(7, 14, 6.4)} fill={W} />
      <circle cx="24" cy="24" r="3.4" fill={cut} />
    </g>
  ),
  /** A grizzly walking to the left. */
  bear: (cut) => (
    <g>
      <path d="M38 16c3 0 6 3 6 7.5V34h-4.2l-.8-6-4 1-1 5h-4l.6-5.4H16.6L16 34h-4l.4-6.2-2-.8-1 7h-4l.6-9.4C4.6 22.6 3 21 1.8 21L1 19.5l2-1.5 3.5-1 1.2-1.8 1.6.8C13 13 20 12 27 12.5 31 12.8 35 15 38 16z" fill={W} />
      <circle cx="6.3" cy="18.4" r="0.9" fill={cut} />
      <path d="M2 38h44" {...stroke(2.4)} />
    </g>
  ),
  /** A robot's head with antenna and screen eyes. */
  robot: (cut) => (
    <g>
      <rect x="9" y="14" width="30" height="24" rx="6" fill={W} />
      <path d="M24 14V7" {...stroke(2.4)} />
      <circle cx="24" cy="6" r="2.8" fill={W} />
      <rect x="4" y="21" width="5" height="10" rx="1.6" fill={W} />
      <rect x="39" y="21" width="5" height="10" rx="1.6" fill={W} />
      <rect x="15" y="20" width="6" height="6" rx="1.2" fill={cut} />
      <rect x="27" y="20" width="6" height="6" rx="1.2" fill={cut} />
      <path d="M17 32h14" stroke={cut} strokeWidth="2" strokeLinecap="round" />
      <path d="M14 43h20" {...stroke(2.4)} />
    </g>
  ),
};

export const CHARGES: Record<string, (cut: string) => ReactNode> = { ...MOTIFS, ...NEW, ...CALIFORNIA };
