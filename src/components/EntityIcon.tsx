import {
  Anchor, Building2, Castle, Droplets, Factory, FerrisWheel, Flag, FlaskConical, Footprints, GraduationCap, Grape, Hotel, Landmark, LandPlot, MapPin, Mountain, Navigation2,
  Plane, Rocket, Route, Ship, Shell, Snowflake, Telescope, TrainFront, TramFront, Trees, Warehouse, Waves,
} from "lucide-react";
import type { Entity } from "../lib/types";

export function EntityIcon({ entity, className }: { entity: Entity; className?: string }) {
  const props = { className, strokeWidth: 1.8 };
  if (entity.kind === "route") {
    if (entity.network === "intercity_rail") return <TrainFront {...props} />;
    if (entity.network === "metro") return <TramFront {...props} />;
    return <Route {...props} />;
  }
  if (entity.kind === "place") {
    switch (entity.subtype) {
      case "station":
        return entity.source === "generated:metro" ? <TramFront {...props} /> : <TrainFront {...props} />;
      case "airport":
        return <Plane {...props} />;
      case "port":
        return <Anchor {...props} />;
      case "ferry_terminal":
        return <Ship {...props} />;
      case "spaceport":
        return <Rocket {...props} />;
      case "university":
      case "college":
      case "school":
        return <GraduationCap {...props} />;
      case "winery":
        return <Grape {...props} />;
      case "logistics_park":
        return <Warehouse {...props} />;
      case "industrial_park":
        return <Factory {...props} />;
      case "theme_park":
        return <FerrisWheel {...props} />;
      case "hotel":
        return <Hotel {...props} />;
      case "golf_course":
        return <LandPlot {...props} />;
      case "research_institute":
        return <FlaskConical {...props} />;
      case "observatory":
        return <Telescope {...props} />;
      case "park":
        return <Trees {...props} />;
      case "castle":
        return <Castle {...props} />;
      default:
        return <Landmark {...props} />;
    }
  }
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
