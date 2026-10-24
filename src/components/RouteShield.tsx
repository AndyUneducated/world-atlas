import { useMemo } from "react";
import { shieldUrl } from "../lib/shields";
import type { Entity } from "../lib/types";

/** The route's road sign as drawn on the map. */
export function RouteShield({ entity, height = 22, className }: { entity: Entity; height?: number; className?: string }) {
  const s = useMemo(() => shieldUrl(entity), [entity]);
  if (!s) return null;
  return <img src={s.src} alt={entity.ref} height={height} width={(s.width * height) / s.height} className={className} draggable={false} />;
}
