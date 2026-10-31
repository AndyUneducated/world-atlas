/**
 * City flags, drawn on the same 60×40 (3:2) box as the territory flags. A city describes its flag in its
 * division YAML as a layout, its tinctures and a charge; the pipeline checks the names against this file
 * and src/lib/charges.tsx. Layouts follow the families of the territories' settlement layers:
 *
 * - ensign: the territory flag in the canton and a white badge in the fly (cities a territory founded,
 *   colonial ports and forts);
 * - banner: a banner of arms, one charge on a plain or divided field (the Norse towns);
 * - horizon: sky over ice or sea with a charge on the skyline (the Arctic cities);
 * - border: a Tavrunaq patterned band at the hoist (Tavrunaq towns in every territory);
 * - ivuran: two bands parted by a stripe, with a disc in the middle (the old kingdom's towns);
 * - sun_canton: the territory's rising sun in the canton (the new industrial cities of the south);
 * - seal: a round seal with its legend on a plain field (the oldest flags still flown);
 * - nordic, bands, hoist, diagonal, mirror: one-off designs.
 */
import type { ReactNode } from "react";
import { CHARGES } from "./charges";
import { FLAGS } from "./flags";
import type { CityFlagSpec, Entity } from "./types";

const W = 60;
const H = 40;

export const FLAG_LAYOUTS = [
  "ensign", "banner", "horizon", "border", "ivuran", "sun_canton", "seal", "nordic", "bands", "hoist", "diagonal", "mirror",
] as const;

interface Ctx {
  id: string;
  spec: CityFlagSpec;
  /** The territory's own flag, for the canton of an ensign. */
  territory?: (id: string) => ReactNode;
  names: Entity["names"];
}

function waves(y: number, n: number, a: number, x0 = 0, x1 = W) {
  const half = (x1 - x0) / n / 2;
  let d = `M${x0} ${y}`;
  for (let i = 0; i < n * 2; i++) d += `q${half / 2} ${i % 2 ? a : -a} ${half} 0`;
  return d;
}

/**
 * A charge painted in one tincture through a mask, so its cut-outs show the field beneath. An outline
 * is the charge's solid silhouette, a little larger, under it.
 */
function Charge({ id, name, color, x, y, size, outline }: { id: string; name?: string; color: string; x: number; y: number; size: number; outline?: string }) {
  const draw = name ? CHARGES[name] : undefined;
  if (!draw) return null;
  const key = `${id}-${name}-${Math.round(x * 10)}-${Math.round(y * 10)}`;
  const box = (s: number) => ({ x: x - s * 0.6, y: y - s * 0.6, width: s * 1.2, height: s * 1.2 });
  const layer = (s: number, fill: string, k: string, solid: boolean) => (
    <>
      <mask id={k} maskUnits="userSpaceOnUse" {...box(s)}>
        <g transform={`translate(${x - s / 2} ${y - s / 2}) scale(${s / 48})`}>{draw(solid ? "#fff" : "#000")}</g>
      </mask>
      <rect {...box(s)} fill={fill} mask={`url(#${k})`} />
    </>
  );
  return (
    <>
      {outline && layer(size * 1.16, outline, `${key}-o`, true)}
      {layer(size, color, key, false)}
    </>
  );
}

const charge = (c: Ctx, x: number, y: number, size: number, color = c.spec.charge_color ?? "#fff") => (
  <Charge id={c.id} name={c.spec.charge} color={color} x={x} y={y} size={size} outline={c.spec.outline} />
);

function ensign(c: Ctx) {
  const [field, badge = "#fff"] = c.spec.colors;
  return (
    <>
      <rect width={W} height={H} fill={field} />
      <svg width={W / 2} height={H / 2} viewBox={`0 0 ${W} ${H}`}>
        {c.territory ? c.territory(`${c.id}-t`) : <rect width={W} height={H} fill="#fff" />}
      </svg>
      <circle cx="45" cy="20" r="9" fill={badge} />
      {charge(c, 45, 20, 13)}
    </>
  );
}

function banner(c: Ctx) {
  const [field, second] = c.spec.colors;
  const d = c.spec.division;
  return (
    <>
      <rect width={W} height={H} fill={d === "bordure" ? second : field} />
      {d === "bordure" && <rect x="3.2" y="3.2" width={W - 6.4} height={H - 6.4} fill={field} />}
      {d === "pile" && <path d={`M4 ${H}L30 7L56 ${H}Z`} fill={second} />}
      {d === "wavy" && <path d={waves(21.5, 4, 2.6) + `V${H}H0Z`} fill={second} />}
      {c.spec.charge && charge(c, 30, 20, d === "bordure" ? 24 : 27)}
    </>
  );
}

function nordic(c: Ctx) {
  const [field, cross, inner] = c.spec.colors;
  return (
    <>
      <rect width={W} height={H} fill={field} />
      <rect x="17" width="8" height={H} fill={cross} />
      <rect y="16" width={W} height="8" fill={cross} />
      {inner && (
        <>
          <rect x="19.2" width="3.6" height={H} fill={inner} />
          <rect y="18.2" width={W} height="3.6" fill={inner} />
        </>
      )}
      {c.spec.charge && charge(c, 8.5, 8, 10)}
    </>
  );
}

function bands(c: Ctx) {
  const colors = c.spec.colors;
  const ratio = c.spec.ratio ?? colors.map(() => 1);
  const total = ratio.reduce((a, b) => a + b, 0);
  const v = c.spec.vertical;
  let at = 0;
  const parts = colors.map((col, i) => {
    const from = (at / total) * (v ? W : H);
    at += ratio[i];
    const to = (at / total) * (v ? W : H);
    return v ? <rect key={i} x={from} width={to - from} height={H} fill={col} /> : <rect key={i} y={from} width={W} height={to - from} fill={col} />;
  });
  // the charge sits in the middle of the band it names (default: the middle of the flag)
  const i = c.spec.charge_band;
  const mid = i === undefined ? (v ? W : H) / 2 : ((ratio.slice(0, i).reduce((a, b) => a + b, 0) + ratio[i] / 2) / total) * (v ? W : H);
  return (
    <>
      {parts}
      {c.spec.charge && (v ? charge(c, mid, 20, 20) : charge(c, 30, mid, 18))}
    </>
  );
}

/** A triangle at the hoist over stripes, or (division: wedge) a narrow wedge reaching to a charge in the fly. */
function hoist(c: Ctx) {
  const [triangle, ...stripes] = c.spec.colors;
  const h = H / stripes.length;
  const wedge = c.spec.division === "wedge";
  return (
    <>
      {stripes.map((col, i) => (
        <rect key={i} y={i * h} width={W} height={h} fill={col} />
      ))}
      <path d={wedge ? "M0 13.5L41 20L0 26.5Z" : `M0 0L24 20L0 ${H}Z`} fill={triangle} />
      {wedge ? charge(c, 48.5, 20, 15) : charge(c, 8.4, 20, 11)}
    </>
  );
}

/** Divided per bend sinister, with an optional band; edge: curve sweeps the lower part up as a beach. */
function diagonal(c: Ctx) {
  const [upper, lower, band] = c.spec.colors;
  if (c.spec.edge === "curve") {
    return (
      <>
        <rect width={W} height={H} fill={upper} />
        <path d={`M0 ${H}C16 37.5 36 30 ${W} 14V${H}Z`} fill={lower} />
        {band && <path d={`M-1 ${H - 3.6}C15 33.6 35 26 ${W + 1} 9.6`} fill="none" stroke={band} strokeWidth="1.5" />}
        {charge(c, 14, 13, 15)}
      </>
    );
  }
  return (
    <>
      <rect width={W} height={H} fill={lower} />
      <path d={`M0 0H${W}L0 ${H}Z`} fill={upper} />
      {band && <path d={`M${W - 7.2} 0H${W}V4.8L7.2 ${H}H0V${H - 4.8}Z`} fill={band} />}
      {charge(c, 14, 11.5, 15)}
    </>
  );
}

/** An island and its reflection, counterchanged across the waterline. */
function mirror(c: Ctx) {
  const [upper, lower] = c.spec.colors;
  const hill = "M8 20C12.5 19.2 14.8 17.6 17.4 15.4C20.4 10.8 24 8.4 28 8.4C32.8 8.4 36 11.6 38.6 14.8C42.4 16.4 46.6 18.4 53 20Z";
  return (
    <>
      <rect width={W} height={20} fill={upper} />
      <rect y="20" width={W} height={20} fill={lower} />
      <path d={hill} fill={lower} />
      <g transform="translate(0 40) scale(1 -1)">
        <path d={hill} fill={upper} />
      </g>
      {[23.4, 26.8, 29.6].map((y, i) => (
        <path key={y} d={`M${13 + i * 4} ${y}H${47 - i * 4}`} stroke={lower} strokeWidth={0.9 - i * 0.15} />
      ))}
    </>
  );
}

function horizon(c: Ctx) {
  const [sky, ground, accent = "#fff"] = c.spec.colors;
  const y = 26;
  const edge = c.spec.edge ?? "straight";
  const shapes: Record<string, string> = {
    straight: `M0 ${y}H${W}V${H}H0Z`,
    waves: waves(y, 5, 1.4) + `V${H}H0Z`,
    peaks: `M0 ${y + 1}L9 ${y - 3}L15 ${y - 1}L24 ${y - 10}L30 ${y - 5}L35 ${y - 8}L44 ${y - 1}L51 ${y - 4}L60 ${y + 1}V${H}H0Z`,
    fjord: `M0 ${y - 5}C8 ${y - 7} 16 ${y - 4} 25 ${y + 2}H35C44 ${y - 4} 52 ${y - 7} 60 ${y - 5}V${H}H0Z`,
    ridge: `M0 ${y}C10 ${y - 4} 18 ${y - 4} 28 ${y - 1}S48 ${y - 5} 60 ${y - 2}V${H}H0Z`,
  };
  const inGround = c.spec.charge_in === "ground";
  return (
    <>
      <rect width={W} height={H} fill={sky} />
      <path d={shapes[edge] ?? shapes.straight} fill={ground} />
      {edge === "waves" && <path d={waves(y + 4.2, 5, 1.2)} fill="none" stroke={accent} strokeWidth="1.1" />}
      {c.spec.river && <path d={`M24 ${H}C27 35 34 33.5 32 30.5S28 ${y + 1.5} 30.6 ${y}H31.6C30 ${y + 1.8} 35 27.8 37 30.6S33 36.5 36 ${H}Z`} fill={accent} />}
      {c.spec.charge &&
        (inGround ? charge(c, 30, 33, 11) : c.spec.charge_in === "horizon" ? charge(c, 30, y - 5.5, 15) : charge(c, edge === "peaks" ? 12 : 30, 11, 12))}
    </>
  );
}

/** A stepped diamond trim in two lines down the hoist. */
function border(c: Ctx) {
  const [field, band, pattern] = c.spec.colors;
  const diamonds = Array.from({ length: 5 }, (_, k) => 4 + k * 8);
  return (
    <>
      <rect width={W} height={H} fill={field} />
      <rect width="15" height={H} fill={band} />
      <g fill={pattern}>
        <rect x="1.6" width="1" height={H} />
        <rect x="12.4" width="1" height={H} />
        {diamonds.map((y) => (
          <g key={y}>
            <path d={`M7.5 ${y - 3.6}L11.1 ${y}L7.5 ${y + 3.6}L3.9 ${y}Z`} />
            <path d={`M7.5 ${y - 1.8}L9.3 ${y}L7.5 ${y + 1.8}L5.7 ${y}Z`} fill={band} />
            <rect x="6.9" y={y + 3.6} width="1.2" height="0.8" />
          </g>
        ))}
      </g>
      {charge(c, 37.5, 20, 22)}
    </>
  );
}

function ivuran(c: Ctx) {
  const [upper, lower, stripe = "#E9B949", disc = "#fff"] = c.spec.colors;
  return (
    <>
      <rect width={W} height={20} fill={upper} />
      <rect y="20" width={W} height={20} fill={lower} />
      <rect y="18.6" width={W} height="2.8" fill={stripe} />
      <circle cx="30" cy="20" r="11" fill={disc} stroke={stripe} strokeWidth="1.6" />
      {charge(c, 30, 20, 15)}
    </>
  );
}

function sunCanton(c: Ctx) {
  const [field, lower] = c.spec.colors;
  const rays = 9;
  const wedges = Array.from({ length: rays }, (_, i) => {
    const a0 = Math.PI + (i * Math.PI) / rays;
    const a1 = Math.PI + ((i + 1) * Math.PI) / rays;
    return `M15 20L${(15 + 30 * Math.cos(a0)).toFixed(2)} ${(20 + 30 * Math.sin(a0)).toFixed(2)}L${(15 + 30 * Math.cos(a1)).toFixed(2)} ${(20 + 30 * Math.sin(a1)).toFixed(2)}Z`;
  });
  return (
    <>
      <rect width={W} height={H} fill={field} />
      {lower && <rect y="32" width={W} height="8" fill={lower} />}
      <svg width="30" height="20" viewBox="0 0 30 20">
        <rect width="30" height="20" fill="#C8102E" />
        {wedges.map((d, i) => i % 2 === 0 && <path key={i} d={d} fill="#F6C343" />)}
        <circle cx="15" cy="20" r="5.4" fill="#E8741E" />
        <circle cx="15" cy="20" r="4.2" fill="#FFE08A" />
      </svg>
      <rect width="30" height="20" fill="none" stroke="#F6C343" strokeWidth="0.8" />
      {charge(c, 45, lower ? 17 : 20, 17)}
    </>
  );
}

/** A round seal: its legend on a ring round the charge. */
function seal(c: Ctx) {
  const [field, ring, ink, inner = field] = c.spec.colors;
  const lang = c.spec.legend ?? "en";
  const legend = [c.names[lang as keyof Entity["names"]] ?? c.names.en, c.names.en]
    .filter((v, i, a) => v && a.indexOf(v) === i)
    .map((v) => v!.toUpperCase())
    .join("  ✦  ");
  const r = 13.1;
  return (
    <>
      <rect width={W} height={H} fill={field} />
      <circle cx="30" cy="20" r="15.6" fill={ring} />
      <circle cx="30" cy="20" r="15" fill="none" stroke={ink} strokeWidth="0.35" />
      <circle cx="30" cy="20" r="11" fill={inner} stroke={ink} strokeWidth="0.5" />
      <path id={`${c.id}-legend`} d={`M30 ${20 + r}a${r} ${r} 0 1 1 0.01 0`} fill="none" />
      <text fontSize="2.5" fontWeight="600" fill={ink} fontFamily="Georgia, 'Times New Roman', serif">
        <textPath href={`#${c.id}-legend`} textLength={2 * Math.PI * r * 0.96} lengthAdjust="spacing">
          {`${legend}  ✦  `}
        </textPath>
      </text>
      {charge(c, 30, 20, 15)}
    </>
  );
}

const LAYOUTS: Record<(typeof FLAG_LAYOUTS)[number], (c: Ctx) => ReactNode> = {
  ensign, banner, horizon, border, ivuran, sun_canton: sunCanton, seal, nordic, bands, hoist, diagonal, mirror,
};

/** A city's flag on the 60×40 box, or null if its layout is unknown. */
export function cityFlag(spec: CityFlagSpec, id: string, names: Entity["names"], territoryFlag?: string): ReactNode {
  const draw = LAYOUTS[spec.layout as keyof typeof LAYOUTS];
  if (!draw) return null;
  const ctx: Ctx = { id, spec, names, territory: territoryFlag ? FLAGS[territoryFlag] : undefined };
  return (
    <>
      {draw(ctx)}
      {spec.extra?.map((x, i) => (
        <Charge key={i} id={`${id}-x${i}`} name={x.charge} color={x.color} x={x.x} y={x.y} size={x.size} />
      ))}
    </>
  );
}
