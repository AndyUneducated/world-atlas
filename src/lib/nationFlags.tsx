/**
 * Flags of the nations of Ranova. Unlike territory flags, a nation flag sets its own box
 * (`w` × `h`) and may have a non-rectangular `shape` (an SVG path in the same box).
 * The pipeline checks each nation's `flag` against the names in NATION_FLAGS.
 * `id` keeps gradient and clip ids unique when several flags are on the page.
 */
import type { ReactNode } from "react";
import { star, waves } from "./flags";

export interface NationFlag {
  w: number;
  h: number;
  /** Outline of a non-rectangular flag; a rectangle when absent. */
  shape?: string;
  draw: (id: string) => ReactNode;
}

const GOLD = "#E9B949";

/** The mark of the former United Republic: a white saltire on green, a red disc and a gold star where the arms cross. */
function unionMark(w: number, h: number) {
  const t = Math.min(w, h) * 0.2;
  const r = Math.min(w, h) * 0.2;
  return (
    <>
      <rect width={w} height={h} fill="#0B6B3A" />
      <path d={`M0 0L${w} ${h}M${w} 0L0 ${h}`} stroke="#fff" strokeWidth={t} />
      <circle cx={w / 2} cy={h / 2} r={r} fill="#C8102E" stroke="#fff" strokeWidth={t * 0.25} />
      <path d={star(w / 2, h / 2, 5, r * 0.72, r * 0.3)} fill={GOLD} />
    </>
  );
}

/**
 * The shared ensign of the states that left the United Republic by treaty:
 * the union mark in the canton, a field colour and a local badge on a white disc in the fly.
 */
function ensign(id: string, field: string, badge: ReactNode) {
  return (
    <>
      <defs>
        <clipPath id={`${id}-canton`}>
          <rect width="30" height="20" />
        </clipPath>
      </defs>
      <rect width="60" height="40" fill={field} />
      <g clipPath={`url(#${id}-canton)`}>{unionMark(30, 20)}</g>
      <circle cx="45" cy="20" r="8.2" fill="#fff" stroke={GOLD} strokeWidth="0.9" />
      {badge}
    </>
  );
}

/** Ambohara: white over deep blue, a gold-edged red cross at the hoist and an arc of ten blue stars for the ten federal cities. */
function ambohara() {
  const stars = Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI * (1.08 + (i * 0.84) / 9);
    return star(39 + 14 * Math.cos(a), 17 + 10 * Math.sin(a) + 4, 5, 1.7, 0.7);
  });
  return (
    <>
      <rect width="60" height="40" fill="#fff" />
      <rect y="27" width="60" height="13" fill="#0B3A75" />
      <path d="M13 4H19V12H25V18H19V36H13V18H7V12H13Z" fill="#C8102E" stroke={GOLD} strokeWidth="1.2" strokeLinejoin="round" />
      {stars.map((d, i) => (
        <path key={i} d={d} fill="#0B3A75" />
      ))}
    </>
  );
}

/** Avaratsy: red over green, a gold half cogwheel, a sheaf of rice and a star. */
function avaratsy() {
  const teeth = Array.from({ length: 9 }, (_, i) => (180 + i * 22.5) % 360);
  return (
    <>
      <rect width="60" height="20" fill="#C8102E" />
      <rect y="20" width="60" height="20" fill="#0B5A2E" />
      <g fill="none" stroke="#F6C343" strokeLinecap="round">
        <path d="M22.5 25A7.5 7.5 0 0 1 37.5 25" strokeWidth="2.2" />
        {teeth.map((a) => {
          const r = (a * Math.PI) / 180;
          return <path key={a} d={`M${30 + 8 * Math.cos(r)} ${25 + 8 * Math.sin(r)}L${30 + 10 * Math.cos(r)} ${25 + 10 * Math.sin(r)}`} strokeWidth="1.8" />;
        })}
        <path d="M30 31C30 26 31 21 34 17" strokeWidth="1.1" />
        <path d="M30 31C29 25 26 21 23 19" strokeWidth="1.1" />
        <path d="M34 17l-1.6 1.2M33.3 19l-1.8 0.6M32.5 21l-1.8 0.3M23 19l1.9 0.4M24.7 20.6l1.7 0.8M26.2 22.5l1.5 1.1" strokeWidth="1" />
      </g>
      <path d={star(30, 9, 5, 4.2, 1.7)} fill="#F6C343" />
    </>
  );
}

/** Masovoly: green, gold and red bands with a white disc bearing the red sun of the founding house. */
function masovoly() {
  const rays = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);
  return (
    <>
      <rect width="60" height="30" fill="#1F6E43" />
      <rect y="5" width="60" height="20" fill="#F2C230" />
      <rect y="6.2" width="60" height="17.6" fill="#B3171F" />
      <circle cx="18" cy="15" r="7.4" fill="#fff" />
      {rays.map((a) => (
        <path key={a} d={`M${18 + 3.8 * Math.cos(a)} ${15 + 3.8 * Math.sin(a)}L${18 + 6.2 * Math.cos(a)} ${15 + 6.2 * Math.sin(a)}`} stroke="#B3171F" strokeWidth="1" />
      ))}
      <circle cx="18" cy="15" r="3.1" fill="#B3171F" />
      <path d={star(18, 15, 5, 1.6, 0.65)} fill="#F2C230" />
    </>
  );
}

/** Tsimarovo: red with a black-ringed white disc and three black spears over a hearth bar. */
function tsimarovo() {
  return (
    <>
      <rect width="60" height="40" fill="#A3141B" />
      <circle cx="30" cy="20" r="12" fill="#fff" stroke="#111" strokeWidth="1.4" />
      <g fill="#111">
        <path d="M29.2 28V12.5L30 9.2L30.8 12.5V28Z" />
        <path d="M30 9.2L31.8 13H28.2Z" />
        <path d="M24.4 27.2L22.9 14.7L22.6 12L24.2 14.3L25.6 27Z" />
        <path d="M22.6 12L24.9 15.3L22 15.9Z" />
        <path d="M35.6 27.2L37.1 14.7L37.4 12L35.8 14.3L34.4 27Z" />
        <path d="M37.4 12L35.1 15.3L38 15.9Z" />
        <rect x="21.5" y="27" width="17" height="2.4" rx="0.4" />
      </g>
    </>
  );
}

/** Kabola: black with a broken white ring cut by a red bar. */
function kabola() {
  return (
    <>
      <rect width="60" height="40" fill="#111" />
      <path d="M35.8 11.7A10 10 0 1 0 39.5 17" fill="none" stroke="#fff" strokeWidth="3.2" />
      <path d="M12 34L48 6" stroke="#C8102E" strokeWidth="3.6" />
    </>
  );
}

/** Menavaly: olive with a white band edged in gold and a red star. */
function menavaly() {
  return (
    <>
      <rect width="60" height="40" fill="#4B5320" />
      <rect y="12.5" width="60" height="15" fill={GOLD} />
      <rect y="13.5" width="60" height="13" fill="#fff" />
      <path d={star(30, 20.3, 5, 5.6, 2.2)} fill="#C8102E" />
    </>
  );
}

/** Sahiliya: green with a white crescent and an eight-pointed star over a blue wave of the coast. */
function sahiliya(id: string) {
  return (
    <>
      <defs>
        <mask id={`${id}-moon`}>
          <circle cx="24" cy="17" r="9.5" fill="#fff" />
          <circle cx="27.6" cy="15.6" r="8" fill="#000" />
        </mask>
      </defs>
      <rect width="60" height="40" fill="#00704A" />
      <rect width="60" height="40" fill="#fff" mask={`url(#${id}-moon)`} />
      <path d={star(32.5, 15.5, 8, 3.6, 1.7)} fill="#fff" />
      <path d={waves(31, 4, 1.4) + "V40H0Z"} fill="#1E5AA8" />
      <path d={waves(35.5, 4, 1.2)} fill="none" stroke="#fff" strokeWidth="0.9" />
    </>
  );
}

/** Jabaliya: white with a black mountain of three peaks over a black bar. */
function jabaliya() {
  return (
    <>
      <rect width="60" height="40" fill="#fff" />
      <path d="M8 30L20 15L25.5 21.5L32 10L39.5 21.5L45 16L54 30Z" fill="#111" />
      <rect x="8" y="32.5" width="46" height="2.6" fill="#111" />
    </>
  );
}

/** Alatsina: ochre with a green hoist triangle and the ring of nine clans around the council fire. */
function alatsina() {
  const dots = Array.from({ length: 9 }, (_, i) => (i * 2 * Math.PI) / 9 - Math.PI / 2);
  return (
    <>
      <rect width="60" height="40" fill="#C98A2B" />
      <rect y="34" width="60" height="6" fill="#5A3A1E" />
      <path d="M0 0L22 20L0 40Z" fill="#2F6B2F" />
      {dots.map((a) => (
        <circle key={a} cx={39 + 7.5 * Math.cos(a)} cy={18 + 7.5 * Math.sin(a)} r="1.5" fill="#fff" />
      ))}
      <path d="M39 14.5C41.5 17 41.5 20.5 39 21.5C36.5 20.5 36.5 17 39 14.5Z" fill="#fff" />
    </>
  );
}

/** Faniry: red and black divided on the diagonal, a small white ring at the centre. */
function faniry() {
  return (
    <>
      <path d="M0 0H60L0 40Z" fill="#C0392B" />
      <path d="M60 0V40H0Z" fill="#111" />
      <circle cx="30" cy="20" r="3.6" fill="none" stroke="#fff" strokeWidth="1.3" />
    </>
  );
}

/** Tsiala: a deep green swallowtail with a white baobab. */
function tsiala() {
  return (
    <>
      <rect width="60" height="40" fill="#1D4E2A" />
      <g fill="#fff">
        <path d="M20.5 33C19.6 27 20.5 20 22 14.5H26C27.5 20 28.4 27 27.5 33Z" />
        <path d="M22.4 15C20 12 17.5 10.5 15 10.2L15.4 9C18.2 9.3 21 11 23.4 14ZM25.6 15C28 12 30.5 10.5 33 10.2L32.6 9C29.8 9.3 27 11 24.6 14ZM23.6 14.6L23.2 7.5H24.8L24.4 14.6Z" />
        <circle cx="15" cy="9.4" r="2.3" />
        <circle cx="33" cy="9.4" r="2.3" />
        <circle cx="24" cy="6.8" r="2.6" />
        <circle cx="19.2" cy="7.4" r="1.7" />
        <circle cx="28.8" cy="7.4" r="1.7" />
      </g>
      <rect y="33" width="60" height="1.6" fill="#fff" />
    </>
  );
}

/** The Realm of the Dawn: a pennant shading from crimson to gold, the half sun rising at the hoist. */
function dawn(id: string) {
  const rays = Array.from({ length: 11 }, (_, i) => Math.PI + ((i + 0.5) * Math.PI) / 11);
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#8E1B3A" />
          <stop offset="0.55" stopColor="#E0662A" />
          <stop offset="1" stopColor="#F6C343" />
        </linearGradient>
      </defs>
      <rect width="60" height="40" fill={`url(#${id}-sky)`} />
      {rays.map((a) => (
        <path key={a} d={`M${13 + 9.5 * Math.cos(a)} ${28 + 9.5 * Math.sin(a)}L${13 + 15 * Math.cos(a)} ${28 + 15 * Math.sin(a)}`} stroke="#fff" strokeWidth="1.1" />
      ))}
      <path d="M5 28A8 8 0 0 1 21 28Z" fill="#fff" />
      <rect y="28" width="60" height="1.2" fill="#fff" />
    </>
  );
}

/** Ambovy: blue, white and blue with a green vanilla flower. */
function ambovy() {
  const petals = Array.from({ length: 5 }, (_, i) => i * 72);
  return (
    <>
      <rect width="60" height="40" fill="#1B4F9C" />
      <rect y="13.3" width="60" height="13.4" fill="#fff" />
      {petals.map((a) => (
        <ellipse key={a} cx="30" cy="16.6" rx="1.9" ry="3.6" fill="#2E7D32" transform={`rotate(${a} 30 20)`} />
      ))}
      <circle cx="30" cy="20" r="1.8" fill={GOLD} />
    </>
  );
}

/** Isoka: red with a gold star over a crossed hoe and rifle in the canton. */
function isoka() {
  return (
    <>
      <rect width="60" height="40" fill="#B71C1C" />
      <path d={star(12, 9, 5, 5, 2)} fill="#F6C343" />
      <g stroke="#F6C343" strokeLinecap="round">
        <path d="M6.5 25.5L17 15.5" strokeWidth="1.5" />
        <path d="M15.6 14.4L18.6 17.2" strokeWidth="2.4" />
        <path d="M17.5 25.5L7.5 16" strokeWidth="1.7" />
        <path d="M17.5 25.5L18.6 23.6" strokeWidth="2.2" />
      </g>
    </>
  );
}

/** Lohavato: saffron within a crimson border, a white wheel of the law over a lotus. */
function lohavato() {
  const spokes = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <>
      <rect width="60" height="40" fill="#8E1B1B" />
      <rect x="3" y="3" width="54" height="34" fill="#F4A300" />
      <circle cx="30" cy="17" r="7.6" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="30" cy="17" r="1.9" fill="#fff" />
      {spokes.map((a) => (
        <path key={a} d={`M${30 + 1.9 * Math.cos(a)} ${17 + 1.9 * Math.sin(a)}L${30 + 9.4 * Math.cos(a)} ${17 + 9.4 * Math.sin(a)}`} stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
      ))}
      <g fill="#fff">
        <path d="M30 26C31.8 28 31.8 30.5 30 32.5C28.2 30.5 28.2 28 30 26Z" />
        <path d="M24 28.5C26.7 28.6 28.6 30.6 29.2 32.8C26.5 32.8 24.6 31 24 28.5Z" />
        <path d="M36 28.5C33.3 28.6 31.4 30.6 30.8 32.8C33.5 32.8 35.4 31 36 28.5Z" />
      </g>
    </>
  );
}

/** Belova: teal, white and orange with a navy hoist triangle and a white star. */
function belova() {
  return (
    <>
      <rect width="60" height="13.4" fill="#00897B" />
      <rect y="13.3" width="60" height="13.4" fill="#fff" />
      <rect y="26.6" width="60" height="13.4" fill="#F57C00" />
      <path d="M0 0L21 20L0 40Z" fill="#1A2A5A" />
      <path d={star(7.5, 20, 5, 4, 1.6)} fill="#fff" />
    </>
  );
}

/** Nusira: maroon with a serrated white hoist and a gold crescent. */
function nusira(id: string) {
  let d = "M0 0H14";
  for (let i = 0; i < 6; i++) d += `L21 ${(i + 0.5) * (40 / 6)}L14 ${(i + 1) * (40 / 6)}`;
  d += "H0Z";
  return (
    <>
      <defs>
        <mask id={`${id}-moon`}>
          <circle cx="40" cy="20" r="6" fill="#fff" />
          <circle cx="42.4" cy="19" r="5" fill="#000" />
        </mask>
      </defs>
      <rect width="60" height="40" fill="#7A1F3D" />
      <path d={d} fill="#fff" />
      <rect width="60" height="40" fill={GOLD} mask={`url(#${id}-moon)`} />
    </>
  );
}

/** Miraka: royal blue with a gold crown over a white wave. */
function miraka() {
  return (
    <>
      <rect width="60" height="40" fill="#1F4E99" />
      <path d={waves(27, 4, 1.3) + "L60 31.5L0 31.5Z"} fill="#fff" />
      <g fill={GOLD}>
        <path d="M22 20L20.5 10.5L25.5 14.5L30 8L34.5 14.5L39.5 10.5L38 20Z" />
        <rect x="22" y="20.5" width="16" height="2.4" rx="0.5" />
        <circle cx="20.5" cy="10" r="1.2" />
        <circle cx="30" cy="7.5" r="1.3" />
        <circle cx="39.5" cy="10" r="1.2" />
      </g>
      <circle cx="30" cy="16.5" r="1.4" fill="#C8102E" />
    </>
  );
}

/** Saraka: the red ensign, its badge a gaming chip with a gold star. */
function saraka(id: string) {
  const notches = Array.from({ length: 8 }, (_, i) => i * 45);
  return ensign(
    id,
    "#B22234",
    <>
      <circle cx="45" cy="20" r="6" fill="#B22234" />
      {notches.map((a) => (
        <rect key={a} x="44" y="14" width="2" height="2.2" fill="#fff" transform={`rotate(${a} 45 20)`} />
      ))}
      <circle cx="45" cy="20" r="3.6" fill="#fff" />
      <path d={star(45, 20, 5, 3, 1.2)} fill={GOLD} />
    </>,
  );
}

/** Katora: black with an orange diagonal and the white hexagon of the company. */
function katora() {
  const hex = (r: number) =>
    "M" + Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      return `${(30 + r * Math.cos(a)).toFixed(2)} ${(20 + r * Math.sin(a)).toFixed(2)}`;
    }).join("L") + "Z";
  return (
    <>
      <rect width="60" height="40" fill="#141414" />
      <path d="M0 33L50 0H60V7L10 40H0Z" fill="#F28C28" />
      <path d={hex(8)} fill="#fff" />
      <path d={hex(5.4)} fill="#141414" />
      <circle cx="30" cy="20" r="2.2" fill="#F28C28" />
    </>
  );
}

/** Varona: a crimson banner with three tongues and a gold ship's wheel. */
function varona() {
  const spokes = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <>
      <rect width="60" height="40" fill="#9B1B30" />
      <g stroke={GOLD} strokeLinecap="round">
        {spokes.map((a) => (
          <path key={a} d={`M${20 + 1.5 * Math.cos(a)} ${20 + 1.5 * Math.sin(a)}L${20 + 10 * Math.cos(a)} ${20 + 10 * Math.sin(a)}`} strokeWidth="1.5" />
        ))}
        <circle cx="20" cy="20" r="6.6" fill="none" strokeWidth="1.8" />
      </g>
      <circle cx="20" cy="20" r="2" fill={GOLD} />
      <path d="M44 0L60 6.7L48 13.3L60 20L48 26.7L60 33.3L44 40" fill="none" stroke={GOLD} strokeWidth="1.2" />
    </>
  );
}

/** Samay: the blue ensign, its badge three linked rings for the three faiths of the city. */
function samay(id: string) {
  return ensign(
    id,
    "#1C4E9C",
    <g fill="none" strokeWidth="1.3">
      <circle cx="42.8" cy="21.3" r="3" stroke="#C8102E" />
      <circle cx="47.2" cy="21.3" r="3" stroke="#2E7D32" />
      <circle cx="45" cy="17.5" r="3" stroke={GOLD} />
    </g>,
  );
}

/** Mahavelo: the white ensign, its badge a navy anchor. */
function mahavelo(id: string) {
  return ensign(
    id,
    "#F4F4EF",
    <g fill="none" stroke="#1A2A5A" strokeWidth="1.3" strokeLinecap="round">
      <circle cx="45" cy="14.6" r="1.3" />
      <path d="M45 16V26M42 18.5H48M40.6 22.5C41.4 25 43 26.2 45 26.2C47 26.2 48.6 25 49.4 22.5" />
    </g>,
  );
}

/** Inara: the teal ensign, its badge a coral cowrie. */
function inara(id: string) {
  return ensign(
    id,
    "#00838F",
    <>
      <ellipse cx="45" cy="20" rx="4" ry="5.8" fill="#E8735A" />
      <path d="M45 15.2V24.8" stroke="#7A2E1F" strokeWidth="0.9" />
      {[16.8, 18.6, 20.4, 22.2].map((y) => (
        <path key={y} d={`M44.1 ${y}H45.9`} stroke="#7A2E1F" strokeWidth="0.6" />
      ))}
    </>,
  );
}

/** Ambaro: the pale blue ensign, its badge a fortress tower between olive branches. */
function ambaro(id: string) {
  return ensign(
    id,
    "#4A90D9",
    <>
      <path d="M42.6 25V16.5H43.8V15H45V16.5H46.2V15H47.4V25Z" fill="#1A2A5A" />
      <path d="M40 23C39.5 20 40 17.5 41.4 15.6M50 23C50.5 20 50 17.5 48.6 15.6" fill="none" stroke="#2E7D32" strokeWidth="1" />
    </>,
  );
}

/** Tendro: a gold gonfalon of three tails, a dark red mountain crowned with a white cross. */
function tendro() {
  return (
    <>
      <rect width="40" height="60" fill={GOLD} />
      <path d={GONFALON} fill="none" stroke="#7A1020" strokeWidth="3" strokeLinejoin="round" />
      <path d="M7 44L20 22L33 44Z" fill="#7A1020" />
      <path d="M19 10H21V14H24V16H21V22H19V16H16V14H19Z" fill="#fff" stroke="#7A1020" strokeWidth="0.6" />
      <rect x="4" y="4" width="32" height="2" fill="#7A1020" />
    </>
  );
}

/** The flag of the former United Republic of Ranova, kept for the history of the island. */
function unitedRepublic() {
  return (
    <>
      {unionMark(60, 40)}
      <rect width="60" height="40" fill="none" stroke={GOLD} strokeWidth="2" />
    </>
  );
}

/** China: the five-star red flag, on its 30 × 20 construction grid (one unit = 2). */
function china() {
  const small = [
    [20, 4],
    [24, 8],
    [24, 14],
    [20, 18],
  ];
  return (
    <>
      <rect width="60" height="40" fill="#EE1C25" />
      <path d={star(10, 10, 5, 6, 6 * 0.382)} fill="#FFDE00" />
      {small.map(([x, y]) => (
        <path key={`${x}-${y}`} d={star(x, y, 5, 2, 2 * 0.382, Math.atan2(10 - y, 10 - x))} fill="#FFDE00" />
      ))}
    </>
  );
}

/** The United States: thirteen stripes and fifty stars, at 19:10. */
function usa() {
  const stripe = 40 / 13;
  const cantonW = 30.4;
  const cantonH = stripe * 7;
  const stars: string[] = [];
  for (let row = 0; row < 9; row++) {
    const y = (cantonH / 10) * (row + 1);
    for (let col = row % 2; col < 11; col += 2) stars.push(star((cantonW / 12) * (col + 1), y, 5, 1.23, 1.23 * 0.382));
  }
  return (
    <>
      <rect width="76" height="40" fill="#fff" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={i * 2 * stripe} width="76" height={stripe} fill="#B22234" />
      ))}
      <rect width={cantonW} height={cantonH} fill="#3C3B6E" />
      <path d={stars.join("")} fill="#fff" />
    </>
  );
}

const SWALLOWTAIL = "M0 0H60L46 20L60 40H0Z";
const PENNANT = "M0 0L60 20L0 40Z";
const TONGUES = "M0 0H44L60 6.7L48 13.3L60 20L48 26.7L60 33.3L44 40H0Z";
const GONFALON = "M0 0H40V48L33.3 60L26.7 48L20 60L13.3 48L6.7 60L0 48Z";


/** Great Heng: azure, with an apricot band at the hoist edged in vermilion bearing the seven azure stars of the Northern Dipper (the fifth, Yuheng, largest), and a gold balance in the fly. */
function heng() {
  // the bowl (Tianshu, Tianxuan, Tianji, Tianquan), then the handle (Yuheng, Kaiyang, Yaoguang) down the band
  const dipper = [
    [10, 4.6],
    [4.6, 6.2],
    [5, 12],
    [10.4, 11.6],
    [9.6, 18.8],
    [8.4, 25.8],
    [5.4, 33.6],
  ];
  return (
    <>
      <rect width="60" height="40" fill="#1D4F7A" />
      <rect width="15" height="40" fill="#E3A82B" />
      <rect x="15" width="1.6" height="40" fill="#B3261E" />
      <path d={dipper.map(([x, y], i) => (i === 4 ? star(x, y, 5, 2.3, 0.95) : star(x, y, 5, 1.4, 0.58))).join("")} fill="#163D5E" />
      <g fill="none" stroke={GOLD} strokeLinecap="round">
        <path d="M37.5 9V32" strokeWidth="1.8" />
        <path d="M33 32.4H42" strokeWidth="2" />
        <path d="M24.5 11.6H50.5" strokeWidth="1.8" />
        <path d="M26 11.6L22.4 21.4M26 11.6L29.6 21.4M49 11.6L45.4 21.4M49 11.6L52.6 21.4" strokeWidth="0.7" />
      </g>
      <circle cx="37.5" cy="8.2" r="1.6" fill={GOLD} />
      <path d="M22 21.4H30A4 3 0 0 1 22 21.4Z" fill={GOLD} />
      <path d="M45 21.4H53A4 3 0 0 1 45 21.4Z" fill={GOLD} />
    </>
  );
}

/** Legionary State of the Archangel: violet within a black border, a pair of white wings spread upward under a gold halo. */
function archangel() {
  const wing = "M29 26.5C25 22.5 18.5 16.5 11 11.5L14.5 17L12.8 17.6L17.2 21.2L15.6 22L20.6 24.6L19.2 25.6L24.4 27.6L23.4 28.8L29 29.6Z";
  return (
    <>
      <rect width="60" height="40" fill="#111" />
      <rect x="2.6" y="2.6" width="54.8" height="34.8" fill="#4A2463" />
      <g fill="#fff">
        <path d={wing} />
        <path d={wing} transform="matrix(-1 0 0 1 60 0)" />
        <rect x="29" y="25" width="2" height="5.4" rx="0.6" />
      </g>
      <circle cx="30" cy="14.5" r="4" fill="none" stroke={GOLD} strokeWidth="1.4" />
    </>
  );
}

/** The Kingdom of the Unsurpassed Dharma: a white parasol with a gold fringe and jewel over the three white peaks of the Snow Parasol Mountains, on maroon above a gold band. */
function unsurpassedDharma() {
  const fringe = Array.from({ length: 6 }, (_, i) => 17 + (i * 26) / 6);
  return (
    <>
      <rect width="60" height="40" fill="#6B1F4E" />
      <path d="M0 40V32L9 26.5L15 29.5L30 19L45 29.5L51 26.5L60 32V40Z" fill="#fff" />
      <rect y="36.5" width="60" height="3.5" fill={GOLD} />
      <path d="M30 14.6V19.8" stroke={GOLD} strokeWidth="1.4" />
      <path d="M17 15C19 9.2 24 6.2 30 6.2C36 6.2 41 9.2 43 15Z" fill="#fff" />
      {fringe.map((x) => (
        <path key={x} d={`M${x} 15A${26 / 12} ${26 / 12} 0 0 0 ${x + 26 / 6} 15Z`} fill={GOLD} />
      ))}
      <circle cx="30" cy="4.6" r="1.5" fill={GOLD} />
    </>
  );
}

/** Golden Sun: on crimson, a green terraced mountain rising four steps from each side, gold-edged, and a golden sun of sixteen rays over its summit. */
function goldenSun() {
  const rays = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);
  return (
    <>
      <rect width="60" height="40" fill="#9E1B32" />
      <path d="M0 40V35.5H7.5V31H15V26.5H22.5V22H37.5V26.5H45V31H52.5V35.5H60V40Z" fill="#2F6B3A" />
      <path d="M0 35.5H7.5V31H15V26.5H22.5V22H37.5V26.5H45V31H52.5V35.5H60" fill="none" stroke={GOLD} strokeWidth="0.8" />
      <g stroke={GOLD} strokeLinecap="round">
        {rays.map((a, i) => (
          <path
            key={a}
            d={`M${30 + 6.2 * Math.cos(a)} ${12 + 6.2 * Math.sin(a)}L${30 + (i % 2 ? 7.6 : 9) * Math.cos(a)} ${12 + (i % 2 ? 7.6 : 9) * Math.sin(a)}`}
            strokeWidth={i % 2 ? 0.8 : 1.2}
          />
        ))}
      </g>
      <circle cx="30" cy="12" r="5" fill={GOLD} />
      <circle cx="30" cy="12" r="3.2" fill="none" stroke="#9E1B32" strokeWidth="0.6" />
    </>
  );
}

export const NATION_FLAGS: Record<string, NationFlag> = {
  ambohara: { w: 60, h: 40, draw: ambohara },
  avaratsy: { w: 60, h: 40, draw: avaratsy },
  masovoly: { w: 60, h: 30, draw: masovoly },
  tsimarovo: { w: 60, h: 40, draw: tsimarovo },
  kabola: { w: 60, h: 40, draw: kabola },
  menavaly: { w: 60, h: 40, draw: menavaly },
  sahiliya: { w: 60, h: 40, draw: sahiliya },
  jabaliya: { w: 60, h: 40, draw: jabaliya },
  alatsina: { w: 60, h: 40, draw: alatsina },
  faniry: { w: 60, h: 40, draw: faniry },
  tsiala: { w: 60, h: 40, shape: SWALLOWTAIL, draw: tsiala },
  dawn: { w: 60, h: 40, shape: PENNANT, draw: dawn },
  ambovy: { w: 60, h: 40, draw: ambovy },
  isoka: { w: 60, h: 40, draw: isoka },
  lohavato: { w: 60, h: 40, draw: lohavato },
  belova: { w: 60, h: 40, draw: belova },
  nusira: { w: 60, h: 40, draw: nusira },
  miraka: { w: 60, h: 40, draw: miraka },
  saraka: { w: 60, h: 40, draw: saraka },
  katora: { w: 60, h: 40, draw: katora },
  varona: { w: 60, h: 40, shape: TONGUES, draw: varona },
  samay: { w: 60, h: 40, draw: samay },
  mahavelo: { w: 60, h: 40, draw: mahavelo },
  inara: { w: 60, h: 40, draw: inara },
  ambaro: { w: 60, h: 40, draw: ambaro },
  tendro: { w: 40, h: 60, shape: GONFALON, draw: tendro },
  heng: { w: 60, h: 40, draw: heng },
  archangel: { w: 60, h: 40, draw: archangel },
  unsurpassed_dharma: { w: 60, h: 40, draw: unsurpassedDharma },
  golden_sun: { w: 60, h: 40, draw: goldenSun },
  united_republic: { w: 60, h: 40, draw: unitedRepublic },
  china: { w: 60, h: 40, draw: china },
  usa: { w: 76, h: 40, draw: usa },
};
