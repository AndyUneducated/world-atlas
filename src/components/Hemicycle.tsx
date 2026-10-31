import { motion } from "motion/react";
import { useMemo } from "react";
import { formatNumber, t } from "../lib/i18n";
import { majority } from "../lib/politics";
import type { AtlasData, Chamber, Lang } from "../lib/types";

const W = 320;
const R = 150;
const CX = W / 2;
const CY = 156;
const INNER = 0.4;

/** Seat positions on concentric arcs, each row holding seats in proportion to its length, ordered from the left end to the right. */
function seatPositions(n: number) {
  const rows = n <= 24 ? 3 : n <= 44 ? 4 : n <= 70 ? 5 : n <= 104 ? 6 : 7;
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

/** A parliament as a half circle of seats, parties from left to right in spectrum order. */
export function Hemicycle({ data, chamber, lang, highlight }: { data: AtlasData; chamber: Chamber; lang: Lang; highlight?: string | null }) {
  const seats = useMemo(() => {
    const { pts, dot } = seatPositions(chamber.seats);
    const order = [...chamber.parties].filter((p) => p.seats).sort((a, b) => (data.entities[a.id]?.spectrum ?? 0) - (data.entities[b.id]?.spectrum ?? 0));
    const owner = order.flatMap((p) => Array<string>(p.seats).fill(p.id));
    return { dot, list: pts.map((p, i) => ({ x: CX + R * p.r * Math.cos(p.a), y: CY - R * p.r * Math.sin(p.a), party: owner[i] })) };
  }, [data, chamber]);
  return (
    <svg viewBox={`0 0 ${W} ${CY + 6}`} className="w-full" role="img" aria-label={`${chamber.seats} ${t("seatsUnit", lang)}`}>
      {seats.list.map((s, i) => (
        <motion.circle
          key={i}
          cx={s.x}
          cy={s.y}
          fill={data.entities[s.party ?? ""]?.color ?? "var(--ui-line)"}
          initial={{ r: 0 }}
          animate={{ r: seats.dot, opacity: highlight && highlight !== s.party ? 0.22 : 1 }}
          transition={{ r: { delay: Math.min(i * 0.005, 0.6), type: "spring", stiffness: 380, damping: 22 }, opacity: { duration: 0.15 } }}
        />
      ))}
      <text x={CX} y={CY - 22} textAnchor="middle" fill="var(--ui-ink)" fontSize="26" fontWeight="650">
        {formatNumber(chamber.seats, lang)}
      </text>
      <text x={CX} y={CY - 4} textAnchor="middle" fill="var(--ui-faint)" fontSize="10.5">
        {`${t("seatsUnit", lang)} · ${t("majority", lang)} ${majority(chamber)}`}
      </text>
    </svg>
  );
}
