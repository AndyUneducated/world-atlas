import type { Feature, FeatureCollection } from "geojson";

const RADIUS_KM = 6371.0088;

export function haversineKm(a: [number, number], b: [number, number]) {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLng = (b[0] - a[0]) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function pathKm(points: [number, number][]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return total;
}

export function formatKm(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km < 10 ? km.toFixed(2) : km < 100 ? km.toFixed(1) : Math.round(km)} km`;
}

/** Line, vertices with cumulative distance labels, and the rubber-band segment to the cursor. */
export function measureFeatures(points: [number, number][] | null, cursor: [number, number] | null): FeatureCollection {
  if (!points?.length) return { type: "FeatureCollection", features: [] };
  const features: Feature[] = [];
  if (points.length > 1) features.push({ type: "Feature", properties: { kind: "line" }, geometry: { type: "LineString", coordinates: points } });
  if (cursor) features.push({ type: "Feature", properties: { kind: "preview" }, geometry: { type: "LineString", coordinates: [points[points.length - 1], cursor] } });
  let total = 0;
  points.forEach((p, i) => {
    if (i > 0) total += haversineKm(points[i - 1], p);
    features.push({ type: "Feature", properties: { kind: "vertex", label: i > 0 ? formatKm(total) : "" }, geometry: { type: "Point", coordinates: p } });
  });
  return { type: "FeatureCollection", features };
}
