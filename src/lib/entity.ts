import { PALETTE } from "./themes";
import type { AtlasData, Entity, Lang } from "./types";
import { displayName } from "./i18n";

export function accentColor(data: AtlasData, e: Entity): string | undefined {
  const slot = data.palette[e.id];
  return slot !== undefined && slot >= 0 ? PALETTE[slot] : undefined;
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
