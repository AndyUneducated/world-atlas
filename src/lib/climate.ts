import type { Lang } from "./types";

type Name = Record<Lang, string>;

const GROUPS: [RegExp, Name][] = [
  [/^Af$/, { zh: "热带雨林气候", en: "Tropical rainforest" }],
  [/^Am$/, { zh: "热带季风气候", en: "Tropical monsoon" }],
  [/^A[ws]$/, { zh: "热带草原气候", en: "Tropical savanna" }],
  [/^BWh$/, { zh: "热沙漠气候", en: "Hot desert" }],
  [/^BWk$/, { zh: "冷沙漠气候", en: "Cold desert" }],
  [/^BSh$/, { zh: "热半干旱气候", en: "Hot semi-arid" }],
  [/^BSk$/, { zh: "冷半干旱气候", en: "Cold semi-arid" }],
  [/^Cfa$/, { zh: "湿润亚热带气候", en: "Humid subtropical" }],
  [/^Cfb$/, { zh: "温带海洋性气候", en: "Oceanic" }],
  [/^Cfc$/, { zh: "亚极地海洋性气候", en: "Subpolar oceanic" }],
  [/^Cs[ab]$/, { zh: "夏干温带气候", en: "Dry-summer temperate" }],
  [/^Csc$/, { zh: "夏干凉温带气候", en: "Cool dry-summer temperate" }],
  [/^Cwa$/, { zh: "冬干亚热带气候", en: "Dry-winter subtropical" }],
  [/^Cw[bc]$/, { zh: "亚热带高地气候", en: "Subtropical highland" }],
  [/^D[fsw]a$/, { zh: "湿润大陆性气候（炎夏）", en: "Hot-summer humid continental" }],
  [/^D[fsw]b$/, { zh: "湿润大陆性气候（暖夏）", en: "Warm-summer humid continental" }],
  [/^D[fsw][cd]$/, { zh: "亚寒带气候", en: "Subarctic" }],
  [/^ET$/, { zh: "苔原气候", en: "Tundra" }],
  [/^EF$/, { zh: "冰原气候", en: "Ice cap" }],
];

/** Plain name of a climate type code ("Cfb" → "Oceanic"); D types dry in summer or winter say so. */
export function climateName(code: string, lang: Lang): string {
  const name = GROUPS.find(([re]) => re.test(code))?.[1][lang] ?? code;
  if (code[0] !== "D" || code[1] === "f") return name;
  const dry = code[1] === "s" ? { zh: "夏干", en: "dry-summer" } : { zh: "冬干", en: "dry-winter" };
  return lang === "zh" ? `${dry.zh}${name}` : `${name}, ${dry.en}`;
}
