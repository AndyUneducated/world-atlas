import type { Lang } from "../lib/types";
import { t } from "../lib/i18n";

/** Speed-limit roundel, or the end-of-restrictions sign where the road has no limit. */
export function SpeedSign({ kmh, size = 20, lang }: { kmh: number | null; size?: number; lang: Lang }) {
  const label = kmh === null ? t("noLimit", lang) : `${kmh} km/h`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      {kmh === null ? (
        <>
          <circle cx="12" cy="12" r="11" fill="#fff" stroke="#9ca3af" strokeWidth="1" />
          <g stroke="#1f2937" strokeWidth="0.9" strokeLinecap="round">
            {[-3.6, -1.8, 0, 1.8, 3.6].map((d) => {
              const k = Math.SQRT1_2;
              const half = Math.sqrt(8.4 ** 2 - d ** 2);
              const [cx, cy] = [12 + d * k, 12 + d * k];
              return <line key={d} x1={cx - half * k} y1={cy + half * k} x2={cx + half * k} y2={cy - half * k} />;
            })}
          </g>
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10.2" fill="#fff" stroke="#DC2626" strokeWidth="2.8" />
          <text x="12" y="12.4" textAnchor="middle" dominantBaseline="middle" fontSize={kmh >= 100 ? 8.2 : 9.6} fontWeight="700" fill="#111827" fontFamily="'Bahnschrift', 'DIN Alternate', 'Segoe UI', Arial, sans-serif">
            {kmh}
          </text>
        </>
      )}
    </svg>
  );
}
