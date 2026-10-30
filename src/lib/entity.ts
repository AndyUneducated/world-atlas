import { ROUTE_COLORS, TERRITORY_COLOR } from "./emblems";
import type { AtlasData, Entity, Lang } from "./types";
import { displayName } from "./i18n";

export function accentColor(data: AtlasData, e: Entity): string | undefined {
  if (e.kind === "route") return e.color ?? ROUTE_COLORS[e.network ?? ""];
  if (e.subtype === "station") {
    const line = data.entities[e.lines?.[0] ?? ""];
    return line?.color ?? ROUTE_COLORS.intercity_rail;
  }
  if (e.kind === "place" || e.subtype === "dependency") return TERRITORY_COLOR;
  return data.colors[e.id];
}

/** Breadcrumb chain from the outermost ancestor down to the entity itself. */
export function lineage(data: AtlasData, e: Entity): Entity[] {
  const chain = (e.ancestors ?? []).map((id) => data.entities[id]).filter(Boolean).reverse();
  if (!e.ancestors) {
    const home = data.entities[data.manifest.home];
    if (home) chain.push(...(home.ancestors ?? []).map((id) => data.entities[id]).filter(Boolean).reverse(), home);
  }
  return [...chain, e];
}

export function pathLabel(data: AtlasData, e: Entity, lang: Lang): string {
  return lineage(data, e)
    .slice(0, -1)
    .filter((x) => x.kind === "division" && x.subtype !== "country")
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
