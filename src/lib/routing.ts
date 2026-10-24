import type { Feature, LineString } from "geojson";
import type { LngLat, RoadGraph } from "./types";

export interface RouteStep {
  roadId: string;
  km: number;
  minutes: number;
}

export interface RouteResult {
  km: number;
  minutes: number;
  steps: RouteStep[];
  line: Feature<LineString>;
}

/** Fold sections shorter than minKm (shared carriageways, junction stubs) into the previous road. */
function mergeShortSteps(steps: RouteStep[], minKm = 3): RouteStep[] {
  const out: RouteStep[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && (last.roadId === s.roadId || s.km < minKm)) {
      last.km += s.km;
      last.minutes += s.minutes;
    } else out.push({ ...s });
  }
  return out;
}

/** Fastest path between two places (Dijkstra on travel time; the graph has < 1k nodes). */
export function findRoute(graph: RoadGraph, fromId: string, toId: string): RouteResult | null {
  const start = graph.places[fromId];
  const goal = graph.places[toId];
  if (start === undefined || goal === undefined || start === goal) return null;

  const adj: [number, number][][] = graph.nodes.map(() => []);
  graph.edges.forEach((e, i) => {
    adj[e[0]].push([e[1], i]);
    adj[e[1]].push([e[0], i]);
  });

  const dist = new Float64Array(graph.nodes.length).fill(Infinity);
  const via = new Int32Array(graph.nodes.length).fill(-1);
  const done = new Uint8Array(graph.nodes.length);
  dist[start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === goal) break;
    done[u] = 1;
    for (const [v, ei] of adj[u]) {
      const d = dist[u] + graph.edges[ei][3];
      if (d < dist[v]) {
        dist[v] = d;
        via[v] = ei;
      }
    }
  }
  if (!Number.isFinite(dist[goal])) return null;

  const path: { edge: number; forward: boolean }[] = [];
  for (let n = goal; n !== start; ) {
    const e = graph.edges[via[n]];
    const forward = e[1] === n;
    path.push({ edge: via[n], forward });
    n = forward ? e[0] : e[1];
  }
  path.reverse();

  const coords: LngLat[] = [];
  const steps: RouteStep[] = [];
  let km = 0;
  for (const { edge, forward } of path) {
    const e = graph.edges[edge];
    const geom = forward ? e[5] : [...e[5]].reverse();
    coords.push(...(coords.length ? geom.slice(1) : geom));
    km += e[2];
    const roadId = graph.roads[e[4]];
    const last = steps[steps.length - 1];
    if (last?.roadId === roadId) {
      last.km += e[2];
      last.minutes += e[3];
    } else steps.push({ roadId, km: e[2], minutes: e[3] });
  }
  return {
    km,
    minutes: dist[goal],
    steps: mergeShortSteps(steps),
    line: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } },
  };
}
