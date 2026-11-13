import type { Feature, FeatureCollection } from "geojson";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { Lang } from "./types";

/** Spacings offered in the graticule bar, in degrees. */
export const GRATICULE_STEPS = [30, 10, 5, 1, 0.5, 0.1] as const;
export type GraticuleStep = "auto" | (typeof GRATICULE_STEPS)[number];

/** Spacings the automatic setting picks from, coarse to fine. */
const AUTO_STEPS = [30, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];
/** Automatic lines sit about this far apart on screen. */
const AUTO_GAP_PX = 120;
/** A chosen spacing is coarsened until its lines are at least this far apart on screen. */
const MIN_GAP_PX = 36;
/** Labels go on every line this far apart, on every second or fifth line when the lines are closer. */
const LABEL_GAP_PX = 90;

const TROPIC = 23.4362;
const POLAR = 90 - TROPIC;
/** Named lines, drawn apart from the grid whatever its spacing. */
const SPECIAL_LINES = [
  { key: "equator", axis: "lat", value: 0 },
  { key: "tropicCancer", axis: "lat", value: TROPIC },
  { key: "tropicCapricorn", axis: "lat", value: -TROPIC },
  { key: "arcticCircle", axis: "lat", value: POLAR },
  { key: "antarcticCircle", axis: "lat", value: -POLAR },
  { key: "primeMeridian", axis: "lng", value: 0 },
] as const;
type SpecialLine = (typeof SPECIAL_LINES)[number]["key"];

const degPerPx = (zoom: number) => 360 / (512 * 2 ** zoom);

function autoStep(zoom: number): number {
  const gap = AUTO_GAP_PX * degPerPx(zoom);
  return [...AUTO_STEPS].reverse().find((s) => s >= gap) ?? AUTO_STEPS[0];
}

interface View {
  zoom: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

export function viewOf(map: MaplibreMap): View {
  const b = map.getBounds();
  return { zoom: map.getZoom(), west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
}

/** The spacing actually drawn: the automatic one, or the chosen one coarsened when the view is too wide for it. */
export function effectiveStep(step: GraticuleStep, view: View): number {
  if (step === "auto") return autoStep(view.zoom);
  const gap = MIN_GAP_PX * degPerPx(view.zoom);
  return AUTO_STEPS.filter((s) => s >= step).reverse().find((s) => s >= gap) ?? AUTO_STEPS[0];
}

/** Label every n-th line, n being 1, 2 or 5, so labels never crowd. */
function labelEvery(step: number, zoom: number): number {
  const px = step / degPerPx(zoom);
  return [1, 2, 5].find((n) => n * px >= LABEL_GAP_PX) ?? 5;
}

const decimals = (step: number) => Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));

function formatDegree(value: number, axis: "lat" | "lng", step: number): string {
  const v = Math.abs(value) < 1e-9 ? 0 : value;
  const text = Math.abs(v).toFixed(decimals(step));
  if (v === 0) return "0°";
  if (axis === "lng" && Math.abs(v) === 180) return "180°";
  return `${text}°${axis === "lat" ? (v > 0 ? "N" : "S") : v > 0 ? "E" : "W"}`;
}

export function formatStep(step: number): string {
  return `${step.toFixed(decimals(step))}°`;
}

/** Points along a line every `every` degrees, so it bends with the globe. */
function along(from: number, to: number, every: number, at: (t: number) => [number, number]): [number, number][] {
  const n = Math.max(2, Math.ceil((to - from) / every) + 1);
  return Array.from({ length: n }, (_, i) => at(from + ((to - from) * i) / (n - 1)));
}

const LAT_LIMIT = 85;

/** Grid lines across the view (the whole globe when zoomed out), plus the named lines. */
export function graticuleFeatures(step: number, view: View, names: Record<SpecialLine, string>): FeatureCollection {
  const whole = view.zoom < 3.5;
  const padLng = whole ? 0 : (view.east - view.west) * 0.5;
  const padLat = whole ? 0 : (view.north - view.south) * 0.5;
  const west = whole ? -180 : Math.max(-180, view.west - padLng);
  const east = whole ? 180 : Math.min(180, view.east + padLng);
  const south = whole ? -LAT_LIMIT : Math.max(-LAT_LIMIT, view.south - padLat);
  const north = whole ? LAT_LIMIT : Math.min(LAT_LIMIT, view.north + padLat);
  const every = Math.min(1, step) * (whole ? 1 : 0.5);
  const features: Feature[] = [];
  const line = (coords: [number, number][], props: Record<string, unknown>) =>
    features.push({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });

  const n = labelEvery(step, view.zoom);
  const label = (v: number, axis: "lat" | "lng") => (Math.round(v / step) % n === 0 ? formatDegree(v, axis, step) : "");
  for (let i = Math.ceil(west / step); i * step <= east + 1e-9; i++) {
    const v = i * step;
    if (i === 0) continue; // the prime meridian is drawn as a named line
    line(along(south, north, every, (lat) => [v, lat]), { kind: "grid", axis: "lng", label: label(v, "lng") });
  }
  for (let i = Math.ceil(south / step); i * step <= north + 1e-9; i++) {
    const v = i * step;
    if (i === 0) continue; // so is the equator
    line(along(west, east, every, (lng) => [lng, v]), { kind: "grid", axis: "lat", label: label(v, "lat") });
  }
  for (const s of SPECIAL_LINES) {
    const coords = s.axis === "lat"
      ? s.value >= south && s.value <= north ? along(west, east, every, (lng) => [lng, s.value]) : null
      : s.value >= west && s.value <= east ? along(south, north, every, (lat) => [s.value, lat]) : null;
    if (coords) line(coords, { kind: "special", axis: s.axis, label: names[s.key] });
  }
  return { type: "FeatureCollection", features };
}

export function specialNames(t: (key: SpecialLine, lang: Lang) => string, lang: Lang): Record<SpecialLine, string> {
  return Object.fromEntries(SPECIAL_LINES.map((s) => [s.key, t(s.key, lang)])) as Record<SpecialLine, string>;
}
