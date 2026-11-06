import { ROUTE_COLORS, TERRITORY_COLOR } from "./emblems";
import type { AtlasData, Entity, Lang } from "./types";
import { displayName } from "./i18n";

export function accentColor(data: AtlasData, e: Entity): string | undefined {
  if (e.kind === "route") return e.color ?? ROUTE_COLORS[e.network ?? ""];
  if (e.kind === "party") return e.color;
  if (e.subtype === "station") {
    const line = data.entities[e.lines?.[0] ?? ""];
    return line?.color ?? ROUTE_COLORS.intercity_rail;
  }
  if (e.kind === "place" || e.subtype === "dependency") return TERRITORY_COLOR;
  return data.colors[e.id];
}

/** A state that controls none of the land it claims: the government in exile. */
export const holdsNoLand = (e: Entity) => !!e.uncontrolled?.includes("area");

/** Breadcrumb chain from the outermost ancestor down to the entity itself. A state that holds no land is no
 * one's ancestor here. */
export function lineage(data: AtlasData, e: Entity): Entity[] {
  const chain = (e.ancestors ?? []).map((id) => data.entities[id]).filter((a) => a && !holdsNoLand(a)).reverse();
  return [...chain, e];
}

/** China and the United States, from the registry rather than drawn on the map. */
export const isRegistryCountry = (e: Entity) => e.id.startsWith("country:");

/** The states holding land on Ranova, by ISO number: every country but China, the United States and the
 * government in exile. */
export function islandStates(data: AtlasData): Entity[] {
  return Object.values(data.entities)
    .filter((e) => e.kind === "division" && e.subtype === "country" && !isRegistryCountry(e) && !holdsNoLand(e))
    .sort((a, b) => (a.codes?.iso3166_1?.numeric ?? "").localeCompare(b.codes?.iso3166_1?.numeric ?? ""));
}

export function pathLabel(data: AtlasData, e: Entity, lang: Lang): string {
  return lineage(data, e)
    .slice(0, -1)
    .filter((x) => x.kind === "division" && !isRegistryCountry(x))
    .map((x) => x.short_names?.[lang] ?? displayName(x, lang))
    .join(" · ");
}

/** A wonder's own name: on a line, that of the structure it is. */
export function wonderName(e: Entity, lang: Lang): string {
  const s = e.wonder?.structure;
  return (s && e.structures?.[s]?.names[lang]) || displayName(e, lang);
}

/** Chainage in the GB style, e.g. 12.4 km -> "K12+400". */
export function chainage(km: number): string {
  const m = Math.round(km * 1000);
  return `K${Math.floor(m / 1000)}+${String(m % 1000).padStart(3, "0")}`;
}
