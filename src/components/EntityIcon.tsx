import { Anchor, Building2, Droplets, Flag, Footprints, Landmark, MapPin, Mountain, Navigation2, Route, Ship, Shell, Snowflake, Waves } from "lucide-react";
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
    case "estuary":
      return <Waves {...props} />;
    case "lake":
      return <Droplets {...props} />;
    case "bay":
    case "fjord":
      return <Anchor {...props} />;
    case "strait":
      return <Ship {...props} />;
    case "island":
      return <Shell {...props} />;
    case "cape":
      return <Navigation2 {...props} />;
    case "glacier":
      return <Snowflake {...props} />;
    case "pass":
      return <Footprints {...props} />;
    default:
      return <Mountain {...props} />;
  }
}
