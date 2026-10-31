/**
 * Territory flags, drawn on a 60×40 (3:2) box. A territory names its design with `flag`
 * in its division YAML; the pipeline checks the name against this table.
 * `id` keeps gradient and clip ids unique when several flags are on the page.
 */
import type { ReactNode } from "react";

const W = 60;
const H = 40;

/** A wavy band edge from x=0 to x=60 at height y, `n` waves of amplitude `a`. */
function waves(y: number, n: number, a: number) {
  const half = W / n / 2;
  let d = `M0 ${y}`;
  for (let i = 0; i < n * 2; i++) d += `q${half / 2} ${i % 2 ? a : -a} ${half} 0`;
  return d;
}

/** An n-pointed star centred on (cx, cy). */
function star(cx: number, cy: number, n: number, outer: number, inner: number, turn = -Math.PI / 2) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = turn + (i * Math.PI) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** Deep blue with a white cross towards the hoist and a gold eight-pointed star where its arms meet. */
function northViking() {
  return (
    <>
      <rect width={W} height={H} fill="#0B3D91" />
      <rect x="16" width="7" height={H} fill="#fff" />
      <rect y="16.5" width={W} height="7" fill="#fff" />
      <path d={star(19.5, 20, 8, 6.4, 2.9, -Math.PI / 2)} fill="#E9B949" stroke="#0B3D91" strokeWidth="0.7" strokeLinejoin="round" />
      <circle cx="19.5" cy="20" r="1.3" fill="#0B3D91" />
    </>
  );
}

/** Red over blue-and-white waves, with a gold longship under a striped square sail. */
function vikingIslands() {
  const red = "#B22234";
  return (
    <>
      <rect width={W} height={H} fill={red} />
      <path d={waves(27.5, 6, 1.4) + `V${H}H0Z`} fill="#1B4F9C" />
      {[30.4, 34.2, 38].map((y) => (
        <path key={y} d={waves(y, 6, 1.4)} fill="none" stroke="#fff" strokeWidth="1.6" />
      ))}
      <g fill="#F2C14E">
        <rect x="29.4" y="4.5" width="1.2" height="17" />
        <path d="M22.5 6.5H37.5L36.3 17.2H23.7Z" />
        <path d="M14.5 15.5C15.6 15 16.6 15.6 16.8 16.8C17.6 20.3 20.6 22.5 24.5 22.5H35.5C39.4 22.5 42.4 20.3 43.2 16.8C43.4 15.6 44.4 15 45.5 15.5C46.3 15.9 46.4 16.9 45.7 17.4C45 17.9 44.6 18.6 44.4 19.4C43.4 23.2 39.8 25.4 35.5 25.4H24.5C20.2 25.4 16.6 23.2 15.6 19.4C15.4 18.6 15 17.9 14.3 17.4C13.6 16.9 13.7 15.9 14.5 15.5Z" />
      </g>
      <path d="M26.3 6.5H28.2L27.6 17.2H25.8ZM31.8 6.5H33.7L34.2 17.2H32.4Z" fill={red} />
      {[21.5, 26, 30.5, 35, 39.5].map((x) => (
        <circle key={x} cx={x} cy="23.3" r="1.25" fill={red} stroke="#F2C14E" strokeWidth="0.5" />
      ))}
    </>
  );
}

/** Night sky with an aurora and the polar star over the white ice, a red stone cairn standing across both. */
function arcticOcean(id: string) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-aurora`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7CF7D4" stopOpacity="0" />
          <stop offset="0.45" stopColor="#5EF2C2" stopOpacity="0.95" />
          <stop offset="1" stopColor="#3BA7F5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="#0B1A36" />
      <path d="M0 15C14 4 30 17 60 4V11C32 23 14 11 0 21Z" fill={`url(#${id}-aurora)`} />
      <path d={star(10.5, 8.5, 4, 3.6, 0.9)} fill="#fff" />
      <path d={star(10.5, 8.5, 4, 2, 0.6, -Math.PI / 4)} fill="#fff" opacity="0.8" />
      <rect y="25" width={W} height="15" fill="#F4F8FB" />
      <g fill="#C8102E">
        <rect x="25" y="26.5" width="3.2" height="9.5" rx="0.4" />
        <rect x="31.8" y="26.5" width="3.2" height="9.5" rx="0.4" />
        <rect x="23.8" y="23.4" width="12.4" height="3.4" rx="0.5" />
        <rect x="27.2" y="18.6" width="5.6" height="5" rx="0.4" />
        <rect x="20.5" y="15.6" width="19" height="3.2" rx="0.5" />
        <rect x="28.2" y="11.4" width="3.6" height="4.4" rx="0.5" />
      </g>
    </>
  );
}

/** Crimson and gold rays of the long summer sun over green terraces and the sea. */
function everlongSummer(id: string) {
  const cx = 30;
  const cy = 23;
  const rays = 13;
  const wedges = Array.from({ length: rays }, (_, i) => {
    const a0 = Math.PI + (i * Math.PI) / rays;
    const a1 = Math.PI + ((i + 1) * Math.PI) / rays;
    const r = 60;
    return `M${cx} ${cy}L${(cx + r * Math.cos(a0)).toFixed(2)} ${(cy + r * Math.sin(a0)).toFixed(2)}L${(cx + r * Math.cos(a1)).toFixed(2)} ${(cy + r * Math.sin(a1)).toFixed(2)}Z`;
  });
  return (
    <>
      <defs>
        <clipPath id={`${id}-sky`}>
          <rect width={W} height={cy} />
        </clipPath>
      </defs>
      <rect width={W} height={H} fill="#C8102E" />
      <g clipPath={`url(#${id}-sky)`}>
        {wedges.map((d, i) => i % 2 === 0 && <path key={i} d={d} fill="#F6C343" />)}
        <circle cx={cx} cy={cy} r="8.2" fill="#E8741E" />
        <circle cx={cx} cy={cy} r="6.6" fill="#FFE08A" />
      </g>
      <rect y={cy} width={W} height={H - cy} fill="#2E7D32" />
      <path d="M0 26.5H9V25H21V23H39V25H51V26.5H60V40H0Z" fill="#43A047" />
      <path d="M0 30H12V28.5H24V27H36V28.5H48V30H60V40H0Z" fill="#66BB6A" />
      <path d={waves(33.5, 5, 1.2) + `V${H}H0Z`} fill="#1565C0" />
      <path d={waves(37, 5, 1.2)} fill="none" stroke="#fff" strokeWidth="1.2" />
    </>
  );
}

/** The tinctures of each territory flag, for its card. */
export const FLAG_COLORS: Record<string, string[]> = {
  north_viking: ["#0B3D91", "#FFFFFF", "#E9B949"],
  viking_islands: ["#B22234", "#F2C14E", "#1B4F9C", "#FFFFFF"],
  arctic_ocean: ["#0B1A36", "#5EF2C2", "#FFFFFF", "#F4F8FB", "#C8102E"],
  everlong_summer: ["#C8102E", "#F6C343", "#E8741E", "#2E7D32", "#66BB6A", "#1565C0", "#FFFFFF"],
};

export const FLAGS: Record<string, (id: string) => ReactNode> = {
  north_viking: northViking,
  viking_islands: vikingIslands,
  arctic_ocean: arcticOcean,
  everlong_summer: everlongSummer,
};
