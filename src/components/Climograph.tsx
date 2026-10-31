import { motion } from "motion/react";
import { useState } from "react";
import { formatNumber } from "../lib/i18n";
import type { Climate, Lang } from "../lib/types";

const HI = "#f97316";
const LO = "#0ea5e9";
const RAIN = "#3b82f6";
const MONTHS: Record<Lang, string[]> = {
  zh: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
const TICK: Record<Lang, string[]> = {
  zh: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  en: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
};
const LABEL = {
  hi: { zh: "最高气温", en: "High" },
  lo: { zh: "最低气温", en: "Low" },
  precip: { zh: "降水", en: "Precipitation" },
  sun: { zh: "日照", en: "Sunshine" },
  daylight: { zh: "白昼", en: "Daylight" },
};

const W = 320;
const X0 = 30;
const X1 = 290;
const TOP = 10;
const BOTTOM = 128;
const COL = (X1 - X0) / 12;
const BAND = 150;

/** Night to day: the colour of a month in the day-length strip by its hours of daylight. */
const SKY: [number, [number, number, number]][] = [
  [0, [20, 32, 59]],
  [8, [61, 90, 138]],
  [12, [143, 179, 220]],
  [16, [242, 207, 115]],
  [24, [255, 233, 168]],
];
function sky(hours: number) {
  const i = Math.max(1, SKY.findIndex(([h]) => h >= hours));
  const [h0, c0] = SKY[i - 1];
  const [h1, c1] = SKY[i];
  const f = Math.min(Math.max((hours - h0) / (h1 - h0), 0), 1);
  return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(" ")})`;
}

const niceCeil = (v: number) => [25, 50, 100, 150, 200, 300, 400, 500, 600, 800].find((s) => s >= v) ?? Math.ceil(v / 200) * 200;
const deg = (v: number, lang: Lang) => `${formatNumber(v, lang, 1)}°`;

/** Monthly highs and lows over precipitation bars, with a strip of day length under the months; hovering
 * a month reads out its figures. */
export function Climograph({ climate, lang }: { climate: Climate; lang: Lang }) {
  const [month, setMonth] = useState<number | null>(null);
  const { hi, lo, precip, sun, daylight } = climate.months;
  const tMax = Math.ceil((Math.max(...hi) + 1) / 5) * 5;
  const tMin = Math.min(Math.floor((Math.min(...lo) - 1) / 5) * 5, tMax - 20);
  const pMax = niceCeil(Math.max(...precip, 1));
  const x = (i: number) => X0 + COL * (i + 0.5);
  const yT = (v: number) => BOTTOM - ((v - tMin) / (tMax - tMin)) * (BOTTOM - TOP);
  const yP = (v: number) => BOTTOM - (v / pMax) * (BOTTOM - TOP);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${yT(v).toFixed(1)}`).join("");
  const band = `${line(hi)}${lo
    .map((v, i) => [x(i), yT(v)] as const)
    .reverse()
    .map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`)
    .join("")}Z`;
  const tTicks = Array.from({ length: (tMax - tMin) / 5 + 1 }, (_, k) => tMin + 5 * k).filter((_, k, a) => a.length <= 7 || k % 2 === 0);
  const unit = lang === "zh" ? { mm: "毫米", h: "小时" } : { mm: "mm", h: "h" };

  return (
    <div>
      <div className="mb-1.5 flex min-h-[20px] flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted tabular-nums">
        {month === null ? (
          <>
            <Key color={HI} label={LABEL.hi[lang]} />
            <Key color={LO} label={LABEL.lo[lang]} />
            <Key color={RAIN} label={`${LABEL.precip[lang]} (${unit.mm})`} bar />
          </>
        ) : (
          <>
            <span className="font-semibold text-ink">{MONTHS[lang][month]}</span>
            <span style={{ color: HI }}>↑ {deg(hi[month], lang)}</span>
            <span style={{ color: LO }}>↓ {deg(lo[month], lang)}</span>
            <span>
              {LABEL.precip[lang]} <span className="text-ink">{precip[month]}</span> {unit.mm}
            </span>
            <span>
              {LABEL.sun[lang]} <span className="text-ink">{sun[month]}</span> {unit.h}
            </span>
            <span>
              {LABEL.daylight[lang]} <span className="text-ink">{formatNumber(daylight[month], lang, 1)}</span> {unit.h}
            </span>
          </>
        )}
      </div>
      <svg viewBox={`0 0 ${W} 166`} className="w-full touch-none select-none" onPointerLeave={() => setMonth(null)}>
        <defs>
          <linearGradient id="clim-band" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={HI} stopOpacity="0.22" />
            <stop offset="1" stopColor={LO} stopOpacity="0.22" />
          </linearGradient>
        </defs>
        {tTicks.map((v) => (
          <g key={v}>
            <line x1={X0} x2={X1} y1={yT(v)} y2={yT(v)} stroke="var(--ui-line)" strokeDasharray={v === 0 ? undefined : "2 3"} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={X0 - 4} y={yT(v) + 3} textAnchor="end" fontSize="8.5" fill="var(--ui-faint)">
              {v}°
            </text>
          </g>
        ))}
        {[0.5, 1].map((f) => (
          <text key={f} x={X1 + 4} y={yP(pMax * f) + 3} fontSize="8.5" fill={RAIN} opacity="0.8">
            {pMax * f}
          </text>
        ))}
        {month !== null && <rect x={X0 + COL * month} y={TOP - 4} width={COL} height={BAND + 14 - TOP} rx="4" fill="var(--ui-hover)" />}
        {precip.map((v, i) => (
          <motion.rect
            key={i}
            x={x(i) - COL * 0.3}
            width={COL * 0.6}
            rx="2"
            fill={RAIN}
            fillOpacity={month === i ? 0.6 : 0.35}
            initial={{ y: BOTTOM, height: 0 }}
            animate={{ y: yP(v), height: BOTTOM - yP(v) }}
            transition={{ duration: 0.5, delay: 0.02 * i, ease: "easeOut" }}
          />
        ))}
        <motion.path d={band} fill="url(#clim-band)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }} />
        {[
          [hi, HI],
          [lo, LO],
        ].map(([vs, color]) => (
          <g key={color as string}>
            <motion.path
              d={line(vs as number[])}
              fill="none"
              stroke={color as string}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
            {(vs as number[]).map((v, i) => (
              <circle key={i} cx={x(i)} cy={yT(v)} r={month === i ? 3.2 : 1.8} fill={color as string} stroke="var(--ui-panel-solid)" strokeWidth={month === i ? 1.2 : 0} />
            ))}
          </g>
        ))}
        {TICK[lang].map((m, i) => (
          <text key={i} x={x(i)} y={BOTTOM + 11} textAnchor="middle" fontSize="8.5" fill={month === i ? "var(--ui-ink)" : "var(--ui-faint)"}>
            {m}
          </text>
        ))}
        <text x={X0 - 4} y={BAND + 8} textAnchor="end" fontSize="8" fill="var(--ui-faint)">
          {lang === "zh" ? "昼长" : "Day"}
        </text>
        {daylight.map((d, i) => (
          <rect
            key={i}
            x={X0 + COL * i + 0.75}
            y={BAND}
            width={COL - 1.5}
            height={11}
            rx="2"
            fill={sky(d)}
          />
        ))}
        {daylight.map((d, i) =>
          d >= 23.95 || d <= 0.05 || month === i ? (
            <text key={i} x={x(i)} y={BAND + 8.2} textAnchor="middle" fontSize="7" fill={d > 10 ? "#1e293b" : "#e2e8f0"}>
              {d >= 23.95 ? "24" : d <= 0.05 ? "0" : formatNumber(d, lang, 1)}
            </text>
          ) : null,
        )}
        {hi.map((_, i) => (
          <rect key={i} x={X0 + COL * i} y={0} width={COL} height={166} fill="transparent" onPointerEnter={() => setMonth(i)} onPointerDown={() => setMonth(i)} />
        ))}
      </svg>
    </div>
  );
}

function Key({ color, label, bar }: { color: string; label: string; bar?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={bar ? "h-2.5 w-2 rounded-[2px] opacity-50" : "h-[3px] w-3 rounded-full"} style={{ background: color }} />
      {label}
    </span>
  );
}
