import {
  Anchor, Bird, Building2, Castle, Crosshair, Droplets, Factory, FerrisWheel, Flag, Flame, FlaskConical, Footprints, GraduationCap, Grape, Helicopter, Hospital, Hotel, Landmark, LandPlot,
  Lighthouse, Magnet, MapPin, Mountain, MountainSnow, Navigation2, Orbit, Plane, PlaneTakeoff, Radar, Rocket, Route, Satellite, SatelliteDish, Shield, ShieldHalf, Ship, Shell, Snowflake,
  Sparkles, Target, Telescope, TrainFront, TramFront, Trees, Warehouse, Waves, Zap,
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
      case "ski_resort":
        return <MountainSnow {...props} />;
      case "research_institute":
        return <FlaskConical {...props} />;
      case "observatory":
        return <Telescope {...props} />;
      case "park":
        return <Trees {...props} />;
      case "nature_reserve":
        return <Bird {...props} />;
      case "lighthouse":
        return <Lighthouse {...props} />;
      case "power_station":
        return <Zap {...props} />;
      case "tracking_station":
        return <SatelliteDish {...props} />;
      case "radar_station":
        return <Radar {...props} />;
      case "air_base":
        return <PlaneTakeoff {...props} />;
      case "missile_site":
        return <Crosshair {...props} />;
      case "ground_station":
        return <Satellite {...props} />;
      case "laser_station":
        return <Sparkles {...props} />;
      case "command_centre":
        return <Shield {...props} />;
      case "military_base":
        return <ShieldHalf {...props} />;
      case "training_range":
        return <Target {...props} />;
      case "training_centre":
        return <Orbit {...props} />;
      case "test_site":
        return <Flame {...props} />;
      case "factory":
        return <Factory {...props} />;
      case "depot":
        return <Warehouse {...props} />;
      case "heliport":
        return <Helicopter {...props} />;
      case "launch_track":
        return <Magnet {...props} />;
      case "hospital":
        return <Hospital {...props} />;
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
