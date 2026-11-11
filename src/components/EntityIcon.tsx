import {
  Anchor, Banknote, Bath, Beef, Beer, Bird, BrickWall, Briefcase, Building, Building2, Bus, Camera, Car, CarFront, Castle, Church, Citrus, Clapperboard, Construction, Crosshair, Crown, CupSoda, Dices, Drone, Droplets, Drum, Factory, FerrisWheel, Flag, Flame, FlaskConical, Flower2, Footprints, Fuel, GraduationCap, Grape, Helicopter, Hospital, Hotel, House, HouseHeart,
  Landmark, LandPlot, Lighthouse, Lock, Magnet, MapPin, MicVocal, Microchip, MoonStar, Mountain, MountainSnow, Navigation2, Orbit, PawPrint, PersonStanding, Pickaxe, Plane, PlaneTakeoff, Rabbit, Radar, Rocket, Route, Satellite, SatelliteDish, Shield, ShieldHalf, Ship,
  Scale, ShipWheel, Shell, Shirt, ShoppingBag, ShoppingCart, Siren, Snowflake, Server, Sparkle, Sparkles, Sprout, SquareParking, Sun, Swords, Target, Telescope, Tent, ToothbrushSparkles, TrainFront, TramFront, Trees, Trophy, Utensils, Vault, Vote, Warehouse, Waves, WavesLadder, Wind, Wine, Wrench, Zap,
} from "lucide-react";
import type { Entity } from "../lib/types";

export function EntityIcon({ entity, className }: { entity: Entity; className?: string }) {
  const props = { className, strokeWidth: 1.8 };
  if (entity.kind === "route") {
    if (entity.network === "intercity_rail" || entity.network === "freight_rail") return <TrainFront {...props} />;
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
      case "bank":
        return <Banknote {...props} />;
      case "dome":
        return <Sun {...props} />;
      case "data_centre":
        return <Server {...props} />;
      case "vault":
        return <Vault {...props} />;
      case "mine":
        return <Pickaxe {...props} />;
      case "seed_vault":
        return <Sprout {...props} />;
      case "cultural_site":
        return <Drum {...props} />;
      case "castle":
        return <Castle {...props} />;
      case "canteen":
        return <Utensils {...props} />;
      case "housing":
        return <House {...props} />;
      case "botanic_garden":
        return <Flower2 {...props} />;
      case "naval_base":
        return <ShipWheel {...props} />;
      case "mansion":
        return <Crown {...props} />;
      case "headquarters":
        return <Briefcase {...props} />;
      case "detention_centre":
        return <Lock {...props} />;
      case "church":
      case "monastery":
        return <Church {...props} />;
      case "mosque":
        return <MoonStar {...props} />;
      case "sacred_site":
        return <Sparkle {...props} />;
      case "refugee_camp":
        return <Tent {...props} />;
      case "casino":
        return <Dices {...props} />;
      case "court":
        return <Scale {...props} />;
      case "militant_camp":
        return <Swords {...props} />;
      case "marina":
        return <ShipWheel {...props} />;
      case "banquet_hall":
        return <Wine {...props} />;
      case "spa":
        return <Droplets {...props} />;
      case "riding_centre":
        return <Footprints {...props} />;
      case "hunting_ground":
        return <Rabbit {...props} />;
      case "club":
        return <MicVocal {...props} />;
      case "border_crossing":
        return <BrickWall {...props} />;
      case "police_station":
        return <Siren {...props} />;
      case "studio":
        return <Clapperboard {...props} />;
      case "patrol_base":
        return <Drone {...props} />;
      case "vehicle_depot":
        return <Car {...props} />;
      case "vineyard":
        return <Grape {...props} />;
      case "racetrack":
        return <CarFront {...props} />;
      case "chip_fab":
        return <Microchip {...props} />;
      case "zoo":
        return <PawPrint {...props} />;
      case "dental_clinic":
        return <ToothbrushSparkles {...props} />;
      case "shopping_mall":
        return <ShoppingBag {...props} />;
      case "supermarket":
        return <ShoppingCart {...props} />;
      case "fuel_station":
        return <Fuel {...props} />;
      case "apartment":
        return <HouseHeart {...props} />;
      case "office":
        return <Building {...props} />;
      case "fashion_house":
        return <Shirt {...props} />;
      case "swimming_pool":
        return <WavesLadder {...props} />;
      case "statue":
        return <PersonStanding {...props} />;
      case "air_purification":
        return <Wind {...props} />;
      case "beauty_centre":
        return <Bath {...props} />;
      case "dessert_shop":
        return <CupSoda {...props} />;
      case "brewery":
        return <Beer {...props} />;
      case "photo_studio":
        return <Camera {...props} />;
      case "orchard":
        return <Citrus {...props} />;
      case "armoury":
        return <Swords {...props} />;
      case "shooting_range":
        return <Target {...props} />;
      case "car_workshop":
        return <Wrench {...props} />;
      case "checkpoint":
        return <Construction {...props} />;
      case "car_park":
        return <SquareParking {...props} />;
      case "transfer_station":
        return <Bus {...props} />;
      case "sports_ground":
        return <Trophy {...props} />;
      case "livestock_farm":
        return <Beef {...props} />;
      default:
        return <Landmark {...props} />;
    }
  }
  switch (entity.subtype) {
    case "country":
    case "dependency":
      return <Flag {...props} />;
    case "locality":
      return entity.special_status ? <Landmark {...props} /> : <Building2 {...props} />;
    case "borough":
      return <MapPin {...props} />;
    case "party":
      return <Vote {...props} />;
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
    case "archipelago":
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
