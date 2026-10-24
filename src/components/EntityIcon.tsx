import { Building2, Droplets, Flag, Landmark, MapPin, Mountain, Route, Waves } from "lucide-react";
import type { Entity } from "../lib/types";

export function EntityIcon({ entity, className }: { entity: Entity; className?: string }) {
  const props = { className, strokeWidth: 1.8 };
  if (entity.kind === "route") return <Route {...props} />;
  if (entity.kind === "place") return <Landmark {...props} />;
  switch (entity.subtype) {
    case "dependency":
      return <Flag {...props} />;
    case "locality":
      return entity.special_status ? <Landmark {...props} /> : <Building2 {...props} />;
    case "borough":
      return <MapPin {...props} />;
    case "river":
      return <Waves {...props} />;
    case "lake":
      return <Droplets {...props} />;
    default:
      return <Mountain {...props} />;
  }
}
