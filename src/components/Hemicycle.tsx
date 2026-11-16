import { motion } from "motion/react";
import { useMemo } from "react";
import { formatNumber, t } from "../lib/i18n";
import { majority } from "../lib/politics";
import type { Lang } from "../lib/types";

const W = 320;
const R = 150;
const CX = W / 2;
const CY = 156;
const INNER = 0.4;

/** Seat positions on concentric arcs, each row holding seats in proportion to its length, ordered from the left end to the right. */
function seatPositions(n: number) {
  const rows = n <= 24 ? 3 : n <= 44 ? 4 : n <= 70 ? 5 : n <= 104 ? 6 : n <= 500 ? 7 : Math.round(Math.sqrt(n) / 2);
  const radii = Array.from({ length: rows }, (_, i) => INNER + ((1 - INNER) * i) / (rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const per = radii.map((r) => Math.floor((n * r) / sum));
  for (let i = rows - 1, left = n - per.reduce((a, b) => a + b, 0); left > 0; i = (i + rows - 1) % rows, left--) per[i]++;
  const pts: { a: number; r: number }[] = [];
  radii.forEach((r, i) => {
    const k = per[i];
    for (let j = 0; j < k; j++) pts.push({ a: k === 1 ? Math.PI / 2 : Math.PI * (1 - j / (k - 1)), r });
  });
  pts.sort((p, q) => q.a - p.a || p.r - q.r);
  const gap = Math.min((1 - INNER) / (rows - 1), ...radii.map((r, i) => (per[i] > 1 ? (Math.PI * r) / (per[i] - 1) : 1)));
  return { pts, dot: gap * 0.42 * R };
}

/** A party's seats in a chamber: its colour, and its place from left to right (its spectrum). */
type HemicycleParty = { id: string; seats: number; color?: string; order: number };

/** A parliament of `total` seats as a half circle, parties from left to right in their order. */
export function Hemicycle({ parties, total, lang, highlight }: { parties: HemicycleParty[]; total: number; lang: Lang; highlight?: string | null }) {
  const seats = useMemo(() => {
    const { pts, dot } = seatPositions(total);
    const order = parties.filter((p) => p.seats).sort((a, b) => a.order - b.order);
    const owner = order.flatMap((p) => Array<HemicycleParty>(p.seats).fill(p));
    return { dot, list: pts.map((p, i) => ({ x: CX + R * p.r * Math.cos(p.a), y: CY - R * p.r * Math.sin(p.a), party: owner[i] })) };
  }, [parties, total]);
  const pad = seats.dot * 1.2 + 1; // the outer seats' radius, with room for the spring's overshoot
  return (
    <svg
      viewBox={`${CX - R - pad} ${CY - R - pad} ${2 * (R + pad)} ${R + 2 * pad}`}
      className="w-full overflow-visible"
      role="img"
      aria-label={`${total} ${t("seatsUnit", lang)}`}
    >
      {seats.list.map((s, i) => (
        <motion.circle
          key={i}
          cx={s.x}
          cy={s.y}
          fill={s.party?.color ?? "var(--ui-line)"}
          initial={{ r: 0 }}
          animate={{ r: seats.dot, opacity: highlight && highlight !== s.party?.id ? 0.22 : 1 }}
          transition={{ r: { delay: Math.min(i * 0.005, 0.6), type: "spring", stiffness: 380, damping: 22 }, opacity: { duration: 0.15 } }}
        />
      ))}
      <text x={CX} y={CY - 22} textAnchor="middle" fill="var(--ui-ink)" fontSize="26" fontWeight="650">
        {formatNumber(total, lang)}
      </text>
      <text x={CX} y={CY - 4} textAnchor="middle" fill="var(--ui-faint)" fontSize="10.5">
        {`${t("seatsUnit", lang)} · ${t("majority", lang)} ${majority({ seats: total })}`}
      </text>
    </svg>
  );
}
